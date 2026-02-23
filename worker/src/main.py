import os
import re
import shutil
import subprocess
import tempfile
from pathlib import Path
from uuid import uuid4
import xml.etree.ElementTree as ET
from urllib.parse import unquote

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import httpx
from azure.storage.blob import BlobServiceClient
from pyaxmlparser import APK


def _sanitize_log(msg: str) -> str:
  """Remove sensitive URLs (Azure blob, etc.) from log messages."""
  return re.sub(r'https?://[^\s"\'>]+', '[REDACTED_URL]', msg)

BACKEND_API_URL = os.getenv("BACKEND_API_URL", "http://backend:4000")
BACKEND_API_TOKEN = os.getenv("BACKEND_API_TOKEN", "")
BUILD_WORK_DIR = Path(os.getenv("BUILD_WORK_DIR", "/app/workdir"))

AZURE_CONN_STR = os.getenv("AZURE_STORAGE_CONNECTION_STRING")
AZURE_CONTAINER = os.getenv("AZURE_STORAGE_CONTAINER", "uploads")

blob_service_client = BlobServiceClient.from_connection_string(AZURE_CONN_STR) if AZURE_CONN_STR else None

ANDROID_NS = "http://schemas.android.com/apk/res/android"
ET.register_namespace("android", ANDROID_NS)


class BuildRequest(BaseModel):
  buildId: str
  flavorId: str
  sourceUrl: str
  sourceType: str  # APK or SOURCE
  config: dict
  buildType: str  # APK | AAB | BOTH
  projectSourceUrl: str | None = None  # Already-decompiled source zip URL


class DecompileRequest(BaseModel):
  projectId: str
  apkUrl: str


app = FastAPI(title="APK WhiteLabel Worker")


async def append_logs(build_id: str, message: str, status: str | None = None, download_url: str | None = None) -> None:
  headers = {}
  if BACKEND_API_TOKEN:
    headers["x-internal-token"] = BACKEND_API_TOKEN

  payload: dict = {"append": message}
  if status:
    payload["status"] = status
  if download_url:
    payload["downloadUrl"] = download_url

  async with httpx.AsyncClient(base_url=BACKEND_API_URL, headers=headers, timeout=60) as client:
    await client.post(f"/internal/builds/{build_id}/logs", json=payload)


async def append_project_logs(project_id: str, message: str, status: str | None = None, metadata: dict | None = None) -> None:
  headers = {}
  if BACKEND_API_TOKEN:
    headers["x-internal-token"] = BACKEND_API_TOKEN

  payload: dict = {"append": message}
  if status:
    payload["status"] = status
  if metadata:
    payload["metadata"] = metadata

  async with httpx.AsyncClient(base_url=BACKEND_API_URL, headers=headers, timeout=60) as client:
    await client.post(f"/internal/projects/{project_id}/logs", json=payload)


async def update_flavor_config(flavor_id: str, config: dict) -> None:
  headers = {}
  if BACKEND_API_TOKEN:
    headers["x-internal-token"] = BACKEND_API_TOKEN

  async with httpx.AsyncClient(base_url=BACKEND_API_URL, headers=headers, timeout=60) as client:
    await client.patch(f"/internal/flavors/{flavor_id}/config", json={"config": config})


def run_cmd(cmd: list[str], cwd: Path, env: dict | None = None) -> str:
  proc_env = os.environ.copy()
  if env:
    proc_env.update(env)
  result = subprocess.run(
    cmd,
    cwd=str(cwd),
    env=proc_env,
    stdout=subprocess.PIPE,
    stderr=subprocess.STDOUT,
    text=True
  )
  if result.returncode != 0:
    raise RuntimeError(f"Command failed: {' '.join(cmd)}\n{result.stdout}")
  return result.stdout


async def download_to_file(url: str, dest: Path) -> None:
  # If it's an Azure Blob URL and we have a client, use it to avoid 409 Public Access denied
  if blob_service_client and "blob.core.windows.net" in url:
    try:
      # URL format: https://<account>.blob.core.windows.net/<container>/<blob_name>
      parts = url.replace("https://", "").split("/")
      container_name = parts[1]
      blob_name = unquote("/".join(parts[2:]))

      blob_client = blob_service_client.get_blob_client(container=container_name, blob=blob_name)
      with open(dest, "wb") as f:
        data = blob_client.download_blob()
        data.readinto(f)
      return
    except Exception as e:
      print(f"Failed to download via Azure client, falling back to HTTP: {_sanitize_log(str(e))}")

  async with httpx.AsyncClient(timeout=60 * 10) as client:
    resp = await client.get(url)
    resp.raise_for_status()
    dest.write_bytes(resp.content)


def upload_to_blob(path: Path, prefix: str) -> str:
  if not blob_service_client:
    raise RuntimeError("Azure Blob service not configured")
  container_client = blob_service_client.get_container_client(AZURE_CONTAINER)
  try:
    container_client.create_container()
  except Exception:
    # container may already exist
    pass
  blob_name = f"{prefix}/{uuid4()}-{path.name}"
  file_size = path.stat().st_size
  with path.open("rb") as fh:
    container_client.upload_blob(
      name=blob_name,
      data=fh,
      overwrite=True,
      max_concurrency=4,
      connection_timeout=300,
      timeout=600,
    )
  blob_client = container_client.get_blob_client(blob_name)
  return blob_client.url


# ─── Branding Override Functions ─────────────────────────────────────────────


def apply_manifest_changes(decompiled_dir: Path, config: dict) -> None:
  """
  Apply versionCode, versionName, and applicationId (package) into AndroidManifest.xml.
  When the package name changes, also update all custom permissions, uses-permissions,
  and provider authorities that reference the old package name to avoid
  INSTALL_FAILED_DUPLICATE_PERMISSION errors.
  """
  manifest_path = decompiled_dir / "AndroidManifest.xml"
  if not manifest_path.exists():
    return

  tree = ET.parse(manifest_path)
  root = tree.getroot()

  android_ns = f"{{{ANDROID_NS}}}"

  app_config = config.get("app", {})
  version_code = app_config.get("versionCode")
  version_name = app_config.get("versionName")
  application_id = app_config.get("applicationId")

  if version_code is not None:
    root.set(f"{android_ns}versionCode", str(version_code))
  if version_name is not None:
    root.set(f"{android_ns}versionName", str(version_name))
  if application_id:
    old_package = root.get("package", "")
    new_package = str(application_id)
    root.set("package", new_package)

    # Replace old package name in all permission-related attributes
    if old_package and old_package != new_package:
      # Update <permission> and <permission-group> android:name attributes
      for tag in ("permission", "permission-group", "permission-tree"):
        for elem in root.iter(tag):
          name = elem.get(f"{android_ns}name", "")
          if old_package in name:
            elem.set(f"{android_ns}name", name.replace(old_package, new_package))

      # Update <uses-permission> android:name attributes
      for elem in root.iter("uses-permission"):
        name = elem.get(f"{android_ns}name", "")
        if old_package in name:
          elem.set(f"{android_ns}name", name.replace(old_package, new_package))

      # Update <provider> android:authorities attributes
      for elem in root.iter("provider"):
        authorities = elem.get(f"{android_ns}authorities", "")
        if old_package in authorities:
          elem.set(f"{android_ns}authorities", authorities.replace(old_package, new_package))

  tree.write(manifest_path, encoding="utf-8", xml_declaration=True)


def apply_app_name(decompiled_dir: Path, new_name: str) -> None:
  """
  Replace the app_name string in res/values/strings.xml.
  Also patches AndroidManifest.xml android:label if it uses a hardcoded string.
  """
  if not new_name:
    return

  # 1. Update strings.xml (handles the @string/app_name reference)
  strings_xml = decompiled_dir / "res" / "values" / "strings.xml"
  if strings_xml.exists():
    try:
      tree = ET.parse(strings_xml)
      root = tree.getroot()
      for string_el in root.findall("string"):
        if string_el.get("name") == "app_name":
          string_el.text = new_name
          break
      else:
        # If app_name doesn't exist yet, create it
        el = ET.SubElement(root, "string")
        el.set("name", "app_name")
        el.text = new_name
      tree.write(strings_xml, encoding="utf-8", xml_declaration=True)
    except ET.ParseError:
      # If XML is malformed, do plaintext replacement
      content = strings_xml.read_text(encoding="utf-8")
      content = re.sub(
        r'(<string\s+name="app_name"[^>]*>)(.*?)(</string>)',
        rf'\g<1>{new_name}\3',
        content,
        flags=re.DOTALL
      )
      strings_xml.write_text(content, encoding="utf-8")

  # 2. Also patch hardcoded android:label in manifest application tag
  manifest_path = decompiled_dir / "AndroidManifest.xml"
  if manifest_path.exists():
    try:
      tree = ET.parse(manifest_path)
      root = tree.getroot()
      application = root.find("application")
      if application is not None:
        label = application.get(f"{{{ANDROID_NS}}}label")
        # If label is a hardcoded string (not a resource reference), replace it
        if label and not label.startswith("@"):
          application.set(f"{{{ANDROID_NS}}}label", new_name)
        # If label is missing, set it
        elif not label:
          application.set(f"{{{ANDROID_NS}}}label", new_name)
      tree.write(manifest_path, encoding="utf-8", xml_declaration=True)
    except ET.ParseError:
      pass


async def apply_logo(decompiled_dir: Path, logo_url: str | None) -> None:
  """
  Download the new logo and replace all mipmap ic_launcher PNG files.
  """
  if not logo_url:
    return

  tmplogo = decompiled_dir / "_new_logo.png"
  await download_to_file(logo_url, tmplogo)

  # Find all ic_launcher files in mipmap and drawable directories
  for res_dir in decompiled_dir.glob("res/mipmap-*"):
    for launcher in res_dir.glob("ic_launcher*.png"):
      shutil.copy2(tmplogo, launcher)

  for res_dir in decompiled_dir.glob("res/drawable-*"):
    for launcher in res_dir.glob("ic_launcher*.png"):
      shutil.copy2(tmplogo, launcher)

  # Also check non-dpi directories
  for d in ["res/mipmap", "res/drawable"]:
    mipmap_dir = decompiled_dir / d
    if mipmap_dir.exists():
      for launcher in mipmap_dir.glob("ic_launcher*.png"):
        shutil.copy2(tmplogo, launcher)

  tmplogo.unlink(missing_ok=True)


def apply_colors(decompiled_dir: Path, primary_color: str | None, splash_bg_color: str | None) -> None:
  """
  Edit res/values/colors.xml to replace colorPrimary and colorPrimaryDark.
  """
  if not primary_color and not splash_bg_color:
    return

  colors_xml = decompiled_dir / "res" / "values" / "colors.xml"
  if not colors_xml.exists():
    return

  try:
    tree = ET.parse(colors_xml)
    root = tree.getroot()

    for color_el in root.findall("color"):
      name = color_el.get("name", "")
      if primary_color:
        if name in ("colorPrimary", "colorPrimaryDark", "colorAccent"):
          if name == "colorPrimaryDark" and primary_color.startswith("#"):
            # Darken primary color slightly for the dark variant
            color_el.text = _darken_hex(primary_color, 0.2)
          else:
            color_el.text = primary_color
      if splash_bg_color:
        if "splash" in name.lower() or "background" in name.lower():
          color_el.text = splash_bg_color

    tree.write(colors_xml, encoding="utf-8", xml_declaration=True)
  except ET.ParseError:
    pass


def _darken_hex(hex_color: str, factor: float) -> str:
  """Darken a hex color by a factor (0.0 = no change, 1.0 = black)."""
  hex_color = hex_color.lstrip("#")
  if len(hex_color) == 8:
    # ARGB format
    alpha = hex_color[:2]
    hex_color = hex_color[2:]
  else:
    alpha = ""

  r = max(0, int(int(hex_color[0:2], 16) * (1 - factor)))
  g = max(0, int(int(hex_color[2:4], 16) * (1 - factor)))
  b = max(0, int(int(hex_color[4:6], 16) * (1 - factor)))
  return f"#{alpha}{r:02x}{g:02x}{b:02x}"


def apply_custom_overrides(decompiled_dir: Path, overrides: list[dict]) -> None:
  """
  Apply user-defined search-and-replace overrides across decompiled files.
  Each override has: type (string|resource), search, replace.
  """
  if not overrides:
    return

  for override in overrides:
    search = override.get("search", "")
    replace = override.get("replace", "")
    override_type = override.get("type", "string")

    if not search:
      continue

    if override_type == "string":
      # Search and replace in strings.xml files
      for strings_file in decompiled_dir.rglob("strings.xml"):
        try:
          content = strings_file.read_text(encoding="utf-8")
          if search in content:
            content = content.replace(search, replace)
            strings_file.write_text(content, encoding="utf-8")
        except (UnicodeDecodeError, IOError):
          continue
    elif override_type == "resource":
      # Search and replace across all XML resource files
      for xml_file in decompiled_dir.rglob("*.xml"):
        try:
          content = xml_file.read_text(encoding="utf-8")
          if search in content:
            content = content.replace(search, replace)
            xml_file.write_text(content, encoding="utf-8")
        except (UnicodeDecodeError, IOError):
          continue


# ─── Signing Helpers ─────────────────────────────────────────────────────────


def get_signing_config(config: dict) -> dict | None:
  signing = config.get("signing")
  if not signing:
    return None
  return signing


async def ensure_keystore(tmpdir: Path, signing_cfg: dict, build_id: str, flavor_id: str, current_config: dict) -> Path:
  keystore_path = tmpdir / "keystore.jks"
  keystore_url = signing_cfg.get("keystoreUrl")

  if keystore_url:
    await append_logs(build_id, "Downloading keystore...\n")
    await download_to_file(keystore_url, keystore_path)
    return keystore_path

  # Generate a keystore if URL not provided
  await append_logs(build_id, "Generating new keystore...\n")
  store_pass = signing_cfg.get("keystorePassword", "changeit")
  key_pass = signing_cfg.get("keyPassword", store_pass)
  alias = signing_cfg.get("keyAlias", "whitelabel")
  dname = signing_cfg.get("dname", "CN=APKWhiteLabel,O=Unbrandit,C=US")

  run_cmd(
    [
      "keytool",
      "-genkeypair",
      "-alias",
      alias,
      "-keyalg",
      "RSA",
      "-keysize",
      "2048",
      "-validity",
      "3650",
      "-keystore",
      str(keystore_path),
      "-storepass",
      store_pass,
      "-keypass",
      key_pass,
      "-dname",
      dname
    ],
    cwd=tmpdir
  )

  # Upload generated keystore to Azure
  await append_logs(build_id, "Uploading keystore to storage...\n")
  keystore_url = upload_to_blob(keystore_path, "keystores")

  # Update flavor config with the new URL
  new_config = current_config.copy()
  if "signing" not in new_config:
    new_config["signing"] = {}
  new_config["signing"]["keystoreUrl"] = keystore_url
  new_config["signing"]["keystorePassword"] = store_pass
  new_config["signing"]["keyAlias"] = alias
  new_config["signing"]["keyPassword"] = key_pass

  await append_logs(build_id, "Saving unique signing config to flavor...\n")
  await update_flavor_config(flavor_id, new_config)

  return keystore_path


def sign_apk(input_apk: Path, output_apk: Path, keystore: Path, signing_cfg: dict) -> None:
  """
  Use apksigner to sign the APK with the provided keystore.
  Enables both v1 (JAR) and v2 (APK Signature Scheme) signing.
  IMPORTANT: The APK must be zipaligned BEFORE signing, otherwise
  v2 signatures will be invalidated by post-signing alignment.
  """
  store_pass = signing_cfg["keystorePassword"]
  key_pass = signing_cfg["keyPassword"]
  alias = signing_cfg["keyAlias"]

  cmd = [
    "apksigner",
    "sign",
    "--v1-signing-enabled", "true",
    "--v2-signing-enabled", "true",
    "--v3-signing-enabled", "true",
    "--ks",
    str(keystore),
    "--ks-pass",
    f"pass:{store_pass}",
    "--key-pass",
    f"pass:{key_pass}",
    "--ks-key-alias",
    alias,
    "--out",
    str(output_apk),
    str(input_apk)
  ]
  run_cmd(cmd, cwd=input_apk.parent)


def zipalign_apk(input_apk: Path, output_apk: Path) -> None:
  """
  Run zipalign on a signed APK.
  """
  cmd = [
    "zipalign",
    "-p",
    "4",
    str(input_apk),
    str(output_apk)
  ]
  run_cmd(cmd, cwd=input_apk.parent)


# ─── Build Processors ───────────────────────────────────────────────────────


async def process_apk_build(payload: BuildRequest, tmpdir: Path) -> dict[str, str]:
  """
  Full APK white-label pipeline:
  1. Get decompiled source (use cached zip if available, else download + decompile)
  2. Apply all branding overrides
  3. Rebuild with apktool
  4. Zipalign (must happen BEFORE signing for v2/v3 compat)
  5. Sign with apksigner (v1 + v2 + v3)
  6. Optionally convert to AAB with bundletool
  7. Upload artifacts

  Returns dict with 'apk' and/or 'aab' download URLs.
  """
  config = payload.config or {}
  app_config = config.get("app", {})
  branding_config = config.get("branding", {})
  decompiled_dir = tmpdir / "decompiled"

  # Step 1: Get decompiled source — prefer the already-decompiled zip
  if payload.projectSourceUrl:
    await append_logs(payload.buildId, "Downloading pre-decompiled source...\n")
    source_zip = tmpdir / "source.zip"
    await download_to_file(payload.projectSourceUrl, source_zip)
    await append_logs(payload.buildId, "Extracting decompiled source...\n")
    run_cmd(["unzip", "-q", str(source_zip), "-d", "decompiled"], cwd=tmpdir)
  else:
    # Fallback: download the original APK and decompile it
    apk_path = tmpdir / "input.apk"
    await append_logs(payload.buildId, "Downloading APK...\n")
    await download_to_file(payload.sourceUrl, apk_path)
    await append_logs(payload.buildId, "Decompiling APK with apktool...\n")
    run_cmd(["apktool", "d", str(apk_path), "-o", "decompiled", "-f"], cwd=tmpdir)

  # Step 2: Apply manifest changes (package name, version code/name)
  await append_logs(payload.buildId, "Applying manifest changes...\n")
  apply_manifest_changes(decompiled_dir, config)

  # Step 3: Apply app name override
  new_app_name = app_config.get("name")
  if new_app_name:
    await append_logs(payload.buildId, f"Setting app name to: {new_app_name}\n")
    apply_app_name(decompiled_dir, new_app_name)

  # Step 4: Apply logo override
  logo_url = branding_config.get("logoUrl")
  if logo_url:
    await append_logs(payload.buildId, "Replacing app icon with custom logo...\n")
    await apply_logo(decompiled_dir, logo_url)

  # Step 5: Apply color overrides
  primary_color = app_config.get("primaryColor")
  splash_bg = app_config.get("splashBackgroundColor")
  if primary_color or splash_bg:
    await append_logs(payload.buildId, "Applying color overrides...\n")
    apply_colors(decompiled_dir, primary_color, splash_bg)

  # Step 6: Apply custom overrides
  custom_overrides = config.get("overrides")
  if custom_overrides:
    await append_logs(payload.buildId, f"Applying {len(custom_overrides)} custom override(s)...\n")
    apply_custom_overrides(decompiled_dir, custom_overrides)

  # Step 7: Rebuild APK
  await append_logs(payload.buildId, "Rebuilding APK with apktool...\n")
  run_cmd(["apktool", "b", "decompiled", "-o", "unsigned.apk"], cwd=tmpdir)

  unsigned_apk = tmpdir / "unsigned.apk"
  aligned_apk = tmpdir / "aligned.apk"
  signed_apk = tmpdir / "signed.apk"

  # Step 8: Zipalign FIRST (must happen BEFORE signing for v2/v3 compatibility)
  await append_logs(payload.buildId, "Zipaligning APK...\n")
  zipalign_apk(unsigned_apk, aligned_apk)

  # Step 9: Sign the aligned APK (v1 + v2 + v3)
  signing_cfg = get_signing_config(config)
  if signing_cfg:
    await append_logs(payload.buildId, "Signing APK with apksigner (v1+v2+v3)...\n")
    keystore = await ensure_keystore(tmpdir, signing_cfg, payload.buildId, payload.flavorId, config)
    sign_apk(aligned_apk, signed_apk, keystore, signing_cfg)
  else:
    await append_logs(payload.buildId, "No signing config provided; copying unsigned APK.\n")
    shutil.copyfile(aligned_apk, signed_apk)

  # Step 10: Upload APK and optionally generate AAB
  urls: dict[str, str] = {}

  if payload.buildType in ("APK", "BOTH"):
    await append_logs(payload.buildId, "Uploading APK to storage...\n")
    urls["apk"] = upload_to_blob(signed_apk, "apk")

  if payload.buildType in ("AAB", "BOTH"):
    await append_logs(payload.buildId, "Generating AAB from APK...\n")
    aab_path = await _convert_apk_to_aab(tmpdir, signed_apk, signing_cfg, payload.buildId)
    if aab_path and aab_path.exists():
      await append_logs(payload.buildId, "Uploading AAB to storage...\n")
      urls["aab"] = upload_to_blob(aab_path, "aab")
    else:
      await append_logs(payload.buildId, "WARNING: AAB generation not available. Uploading APK instead.\n")
      if "apk" not in urls:
        urls["apk"] = upload_to_blob(signed_apk, "apk")

  return urls


async def _convert_apk_to_aab(tmpdir: Path, apk_path: Path, signing_cfg: dict | None, build_id: str) -> Path | None:
  """
  Convert APK to AAB using bundletool.
  This creates an AAB from the APK's contents.
  Note: This is a best-effort conversion. True AAB builds require Gradle source builds.
  """
  bundletool_jar = Path("/usr/local/bin/bundletool.jar")
  if not bundletool_jar.exists():
    await append_logs(build_id, "bundletool not found, skipping AAB generation.\n")
    return None

  try:
    # Step 1: Build APKs module from the APK
    apks_path = tmpdir / "output.apks"
    aab_path = tmpdir / "output.aab"

    # Use bundletool to create a universal APK set from the APK, then convert back
    # The approach: build-bundle from a zip of the APK's contents
    # Alternative: use aapt2 to convert resources, then bundle

    # Simpler approach: use the APK as-is for distribution
    # For Play Store, we create a minimal AAB structure
    await append_logs(build_id, "Building AAB with bundletool...\n")

    # Create a base module zip from the APK
    base_zip = tmpdir / "base.zip"
    shutil.copy2(apk_path, base_zip)

    run_cmd(
      [
        "java", "-jar", str(bundletool_jar),
        "build-bundle",
        "--modules=" + str(base_zip),
        "--output=" + str(aab_path)
      ],
      cwd=tmpdir
    )

    if aab_path.exists():
      return aab_path

  except Exception as e:
    await append_logs(build_id, f"AAB conversion failed: {e}\nFalling back to APK only.\n")

  return None


async def process_source_build(payload: BuildRequest, tmpdir: Path) -> dict[str, str]:
  zip_path = tmpdir / "source.zip"
  await append_logs(payload.buildId, "Downloading source archive...\n")
  await download_to_file(payload.sourceUrl, zip_path)

  await append_logs(payload.buildId, "Extracting source code...\n")
  run_cmd(["unzip", "-q", str(zip_path), "-d", "source"], cwd=tmpdir)

  project_dir = tmpdir / "source"

  # Detect Gradle
  gradlew = project_dir / "gradlew"
  if not gradlew.exists():
    raise RuntimeError("Gradle wrapper not found in source")

  gradlew.chmod(gradlew.stat().st_mode | 0o111)

  signing_cfg = get_signing_config(payload.config or {})
  if signing_cfg:
    await append_logs(payload.buildId, "Preparing signing configuration...\n")
    keystore = await ensure_keystore(tmpdir, signing_cfg, payload.buildId, payload.flavorId, payload.config)

  if payload.buildType in ("APK", "BOTH"):
    await append_logs(payload.buildId, "Running Gradle assembleRelease for APK...\n")
    run_cmd(["./gradlew", "assembleRelease"], cwd=project_dir)

  if payload.buildType in ("AAB", "BOTH"):
    await append_logs(payload.buildId, "Running Gradle bundleRelease for AAB...\n")
    run_cmd(["./gradlew", "bundleRelease"], cwd=project_dir)

  outputs_dir = project_dir / "app" / "build" / "outputs"
  apk_candidates = list(outputs_dir.rglob("*.apk"))
  aab_candidates = list(outputs_dir.rglob("*.aab"))

  urls: dict[str, str] = {}

  if payload.buildType == "APK":
    if not apk_candidates:
      raise RuntimeError("No APK artifact found after Gradle build")
    await append_logs(payload.buildId, f"Uploading {apk_candidates[0].name} to storage...\n")
    urls["apk"] = upload_to_blob(apk_candidates[0], "gradle")
  elif payload.buildType == "AAB":
    if not aab_candidates:
      raise RuntimeError("No AAB artifact found after Gradle bundleRelease")
    await append_logs(payload.buildId, f"Uploading {aab_candidates[0].name} to storage...\n")
    urls["aab"] = upload_to_blob(aab_candidates[0], "gradle")
  else:  # BOTH
    if apk_candidates:
      urls["apk"] = upload_to_blob(apk_candidates[0], "gradle")
    if aab_candidates:
      urls["aab"] = upload_to_blob(aab_candidates[0], "gradle")
    if not urls:
      raise RuntimeError("No APK or AAB artifacts found after Gradle build")

  return urls


@app.post("/build")
async def handle_build(req: BuildRequest):
  tmpdir_obj = tempfile.mkdtemp(dir=BUILD_WORK_DIR)
  tmpdir = Path(tmpdir_obj)
  try:
    await append_logs(req.buildId, "Starting worker build...\n", status="RUNNING")
    if req.sourceType == "APK":
      urls = await process_apk_build(req, tmpdir)
    else:
      urls = await process_source_build(req, tmpdir)

    # Determine a single download URL for backwards compat
    # Prefer AAB if the user requested it, else APK
    download_url = urls.get("aab") or urls.get("apk", "")

    await append_logs(req.buildId, "Build completed successfully.\n", status="SUCCESS", download_url=download_url)
    return {"status": "ok", "downloadUrl": download_url, "urls": urls}
  except Exception as exc:  # pylint: disable=broad-except
    await append_logs(req.buildId, f"Build failed: {_sanitize_log(str(exc))}\n", status="FAILED")
    raise HTTPException(status_code=500, detail=str(exc)) from exc
  finally:
    shutil.rmtree(tmpdir, ignore_errors=True)


class InspectRequest(BaseModel):
  url: str


@app.post("/inspect")
async def inspect_apk(req: InspectRequest):
  tmpdir_obj = tempfile.mkdtemp(dir=BUILD_WORK_DIR)
  tmpdir = Path(tmpdir_obj)
  apk_path = tmpdir / "input.apk"
  try:
    await download_to_file(req.url, apk_path)
    apk = APK(str(apk_path))
    return {
      "packageName": apk.package,
      "versionName": apk.version_name,
      "versionCode": int(apk.version_code) if apk.version_code else 0,
      "appName": apk.application
    }
  except Exception as exc:
    raise HTTPException(status_code=500, detail=str(exc)) from exc
  finally:
    shutil.rmtree(tmpdir, ignore_errors=True)


@app.post("/decompile")
async def handle_decompile(req: DecompileRequest):
  tmpdir_obj = tempfile.mkdtemp(dir=BUILD_WORK_DIR)
  tmpdir = Path(tmpdir_obj)
  apk_path = tmpdir / "base.apk"
  decompiled_dir = tmpdir / "decompiled"
  try:
    await append_project_logs(req.projectId, "Starting project decompilation...\n", status="DECOMPILING")
    
    # 1. Download
    await append_project_logs(req.projectId, "Downloading base APK...\n")
    await download_to_file(req.apkUrl, apk_path)

    # 2. Inspect Metadata
    await append_project_logs(req.projectId, "Inspecting APK metadata...\n")
    apk_meta = APK(str(apk_path))
    metadata = {
      "packageName": apk_meta.package,
      "versionName": apk_meta.version_name,
      "versionCode": int(apk_meta.version_code) if apk_meta.version_code else 0,
      "appName": apk_meta.application
    }

    # 3. Decompile
    await append_project_logs(req.projectId, "Decompiling with apktool...\n")
    run_cmd(["apktool", "d", str(apk_path), "-o", "decompiled", "-f"], cwd=tmpdir)

    # 4. Extract Icon
    logo_url = None
    try:
      await append_project_logs(req.projectId, "Extracting app icon...\n")
      # Find icon name from manifest
      manifest_path = decompiled_dir / "AndroidManifest.xml"
      tree = ET.parse(manifest_path)
      root = tree.getroot()
      application = root.find("application")
      icon_res = application.get(f"{{{ANDROID_NS}}}icon") if application is not None else None
      
      if icon_res:
        icon_name = icon_res.split("/")[-1]
        # Search for icon file
        icon_candidates = list(decompiled_dir.rglob(f"{icon_name}.png"))
        # Prefer higher dpi mipmaps
        icon_candidates.sort(key=lambda p: ("xxxhdpi" in str(p), "xxhdpi" in str(p), "xhdpi" in str(p)), reverse=True)
        
        if icon_candidates:
          logo_url = upload_to_blob(icon_candidates[0], "project-logos")
          metadata["logoUrl"] = logo_url
          await append_project_logs(req.projectId, "Icon extracted successfully.\n")
    except Exception as e:
      await append_project_logs(req.projectId, f"Warning: Failed to extract icon: {_sanitize_log(str(e))}\n")

    # 5. Zip and upload source
    await append_project_logs(req.projectId, "Compressing decompiled source...\n")
    source_zip_base = tmpdir / "source"
    source_zip_path = shutil.make_archive(str(source_zip_base), "zip", root_dir=decompiled_dir)
    source_url = upload_to_blob(Path(source_zip_path), "project-sources")
    metadata["sourceUrl"] = source_url

    await append_project_logs(req.projectId, "Project ready.\n", status="READY", metadata=metadata)
    return {"status": "ok", "metadata": metadata}

  except Exception as exc:
    await append_project_logs(req.projectId, f"Decompilation failed: {_sanitize_log(str(exc))}\n", status="FAILED")
    raise HTTPException(status_code=500, detail=str(exc)) from exc
  finally:
    shutil.rmtree(tmpdir, ignore_errors=True)


@app.get("/health")
async def health_check():
  return {"status": "ok"}


if __name__ == "__main__":
  import uvicorn

  uvicorn.run(app, host="0.0.0.0", port=5000)

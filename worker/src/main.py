import os
import shutil
import subprocess
import tempfile
from pathlib import Path
from uuid import uuid4
import xml.etree.ElementTree as ET

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import httpx
from azure.storage.blob import BlobServiceClient

BACKEND_API_URL = os.getenv("BACKEND_API_URL", "http://backend:4000")
BACKEND_API_TOKEN = os.getenv("BACKEND_API_TOKEN", "")
BUILD_WORK_DIR = Path(os.getenv("BUILD_WORK_DIR", "/app/workdir"))

AZURE_CONN_STR = os.getenv("AZURE_STORAGE_CONNECTION_STRING")
AZURE_CONTAINER = os.getenv("AZURE_STORAGE_CONTAINER", "apk-whitelabel-outputs")

blob_service_client = BlobServiceClient.from_connection_string(AZURE_CONN_STR) if AZURE_CONN_STR else None

ANDROID_NS = "http://schemas.android.com/apk/res/android"
ET.register_namespace("android", ANDROID_NS)


class BuildRequest(BaseModel):
  buildId: str
  sourceUrl: str
  sourceType: str  # APK or SOURCE
  config: dict
  buildType: str  # APK | AAB | BOTH


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


def run_cmd(cmd: list[str], cwd: Path, env: dict | None = None) -> None:
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


async def download_to_file(url: str, dest: Path) -> None:
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
  with path.open("rb") as fh:
    container_client.upload_blob(name=blob_name, data=fh, overwrite=True)
  blob_client = container_client.get_blob_client(blob_name)
  return blob_client.url


def apply_manifest_versioning_and_branding(decompiled_dir: Path, config: dict) -> None:
  """
  Apply versionCode, versionName, applicationId, and basic branding into AndroidManifest.xml.
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
    root.set("package", str(application_id))

  tree.write(manifest_path, encoding="utf-8", xml_declaration=True)


def get_signing_config(config: dict) -> dict | None:
  signing = config.get("signing")
  if not signing:
    return None
  required_keys = ["keystoreUrl", "keystorePassword", "keyAlias", "keyPassword"]
  if not all(k in signing for k in required_keys):
    return None
  return signing


async def ensure_keystore(tmpdir: Path, signing_cfg: dict, build_id: str) -> Path:
  keystore_path = tmpdir / "keystore.jks"
  keystore_url = signing_cfg.get("keystoreUrl")

  if keystore_url:
    await append_logs(build_id, "Downloading keystore...\n")
    await download_to_file(keystore_url, keystore_path)
    return keystore_path

  # Optional: generate a keystore if URL not provided
  await append_logs(build_id, "Generating new keystore...\n")
  dname = signing_cfg.get("dname", "CN=APKWhiteLabel,O=Unbrandit,C=US")
  store_pass = signing_cfg.get("keystorePassword", "changeit")
  key_pass = signing_cfg.get("keyPassword", store_pass)
  alias = signing_cfg.get("keyAlias", "whitelabel")

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
  return keystore_path


def sign_apk(input_apk: Path, output_apk: Path, keystore: Path, signing_cfg: dict) -> None:
  """
  Use apksigner to sign the APK with the provided keystore.
  """
  store_pass = signing_cfg["keystorePassword"]
  key_pass = signing_cfg["keyPassword"]
  alias = signing_cfg["keyAlias"]

  cmd = [
    "apksigner",
    "sign",
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


async def process_apk_build(payload: BuildRequest, tmpdir: Path) -> str:
  apk_path = tmpdir / "input.apk"

  await append_logs(payload.buildId, "Downloading APK...\n")
  await download_to_file(payload.sourceUrl, apk_path)

  # Step 1: Decompile APK
  await append_logs(payload.buildId, "Decompiling APK with apktool...\n")
  run_cmd(["apktool", "d", str(apk_path), "-o", "decompiled", "-f"], cwd=tmpdir)

  # Step 2: Apply manifest versioning and basic branding
  await append_logs(payload.buildId, "Applying manifest versioning and branding...\n")
  apply_manifest_versioning_and_branding(tmpdir / "decompiled", payload.config or {})

  # Step 3: Rebuild APK
  await append_logs(payload.buildId, "Rebuilding APK...\n")
  run_cmd(["apktool", "b", "decompiled", "-o", "unsigned.apk"], cwd=tmpdir)

  unsigned_apk = tmpdir / "unsigned.apk"
  signed_apk = tmpdir / "signed.apk"
  aligned_apk = tmpdir / "aligned.apk"

  signing_cfg = get_signing_config(payload.config or {})
  if signing_cfg:
    await append_logs(payload.buildId, "Signing APK with apksigner...\n")
    keystore = await ensure_keystore(tmpdir, signing_cfg, payload.buildId)
    sign_apk(unsigned_apk, signed_apk, keystore, signing_cfg)
  else:
    await append_logs(payload.buildId, "No signing config provided; copying unsigned APK.\n")
    shutil.copyfile(unsigned_apk, signed_apk)

  # Step 5: Zipalign
  await append_logs(payload.buildId, "Zipaligning APK...\n")
  zipalign_apk(signed_apk, aligned_apk)

  # Step 6: Upload to Azure Blob and return URL
  await append_logs(payload.buildId, "Uploading APK to storage...\n")
  download_url = upload_to_blob(aligned_apk, "apk")
  return download_url


async def process_source_build(payload: BuildRequest, tmpdir: Path) -> str:
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

  # Always build release APK; build AAB if requested.
  await append_logs(payload.buildId, "Running Gradle assembleRelease...\n")
  run_cmd(["./gradlew", "assembleRelease"], cwd=project_dir)

  if payload.buildType in ("AAB", "BOTH"):
    await append_logs(payload.buildId, "Running Gradle bundleRelease for AAB...\n")
    run_cmd(["./gradlew", "bundleRelease"], cwd=project_dir)

  outputs_dir = project_dir / "app" / "build" / "outputs"
  apk_candidates = list(outputs_dir.rglob("*.apk"))
  aab_candidates = list(outputs_dir.rglob("*.aab"))

  # Decide what to upload based on buildType.
  artifact_to_upload: Path | None = None

  if payload.buildType == "APK":
    if not apk_candidates:
      raise RuntimeError("No APK artifact found after Gradle build")
    artifact_to_upload = apk_candidates[0]
  elif payload.buildType == "AAB":
    if not aab_candidates:
      raise RuntimeError("No AAB artifact found after Gradle bundleRelease")
    artifact_to_upload = aab_candidates[0]
  else:  # BOTH
    if not apk_candidates or not aab_candidates:
      raise RuntimeError("Expected both APK and AAB artifacts for BOTH buildType")
    await append_logs(payload.buildId, "Packaging APK and AAB into a single archive...\n")
    apk_path = apk_candidates[0]
    aab_path = aab_candidates[0]
    bundle_dir = tmpdir / "bundle"
    bundle_dir.mkdir(parents=True, exist_ok=True)
    shutil.copy2(apk_path, bundle_dir / apk_path.name)
    shutil.copy2(aab_path, bundle_dir / aab_path.name)
    archive_base = tmpdir / "artifacts"
    archive_path = shutil.make_archive(str(archive_base), "zip", root_dir=bundle_dir)
    artifact_to_upload = Path(archive_path)

  await append_logs(payload.buildId, f"Uploading artifact {artifact_to_upload.name} to storage...\n")
  download_url = upload_to_blob(artifact_to_upload, "gradle")
  return download_url


@app.post("/build")
async def handle_build(req: BuildRequest):
  tmpdir_obj = tempfile.mkdtemp(dir=BUILD_WORK_DIR)
  tmpdir = Path(tmpdir_obj)
  try:
    await append_logs(req.buildId, "Starting worker build...\n", status="RUNNING")
    if req.sourceType == "APK":
      download_url = await process_apk_build(req, tmpdir)
    else:
      download_url = await process_source_build(req, tmpdir)
    await append_logs(req.buildId, "Build completed successfully.\n", status="SUCCESS", download_url=download_url)
    return {"status": "ok", "downloadUrl": download_url}
  except Exception as exc:  # pylint: disable=broad-except
    await append_logs(req.buildId, f"Build failed: {exc}\n", status="FAILED")
    raise HTTPException(status_code=500, detail=str(exc)) from exc
  finally:
    shutil.rmtree(tmpdir, ignore_errors=True)


if __name__ == "__main__":
  import uvicorn

  uvicorn.run(app, host="0.0.0.0", port=5000)


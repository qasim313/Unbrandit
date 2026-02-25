# Worker Service - APK WhiteLabel Studio

## Overview

The Worker Service operates in isolation to execute heavy Android build workloads. It continuously listens for tasks dispatched by the Node.js backend (using BullMQ) and processes them within an enclosed, dependency-rich Docker environment.

### Capabilities and Android Modularity
- **AAB / APK Disassembly**: Extracts `base.apk` into readable `AndroidManifest.xml`, classes, and resources using `apktool`.
- **Resource Hook Injectors**: Hot-swaps dynamically defined App Names, Colors, AdMob IDs, Firebase strings, Package Identifiers, and Icon Overwrites directly inside the decompiled structures.
- **Protobuf Re-Packaging (App Bundles)**: Compiles raw binary XML and `resources.arsc` into Protocol Buffers utilizing `aapt2` and creates final `.aab` artifacts aligned via `bundletool` for the Google Play Store Console.
- **Key Signing**: Safely unpacks dynamic custom `.jks` User Keystores uploaded from the frontend, securely wrapping signatures with `jarsigner` over App Bundles and `apksigner` over standard APKs.
- **Log Streaming**: Bridges a high-performance HTTP pipeline appending `stdout` console outputs via internal token-secured webhook events back to the Node.js API to populate user dashboards.

---

## Tech Stack

- Python 3.12
- FastAPI / Uvicorn (HTTP Controller)
- httpx (Internal API Hook calls)
- `@azure/storage-blob` (Artifact Hosting & Streaming)
- `apktool` / `aapt2` / `jarsigner` / `apksigner` / `bundletool` (Android Core Utilities)

---

## Architecture Breakdown

| File / Component | Purpose |
|------------------|---------|
| `src/main.py` | FastAPI definition and the master controller route `/build`. |
| `append_logs` | Webhook method sending build phases, real-time logging strings, and final URLs to the `BACKEND_API_URL` under `x-internal-token` encryption. |
| `process_apk_build` | Downloads decompiled APK -> `apktool d` -> Branding configuration injections -> Rebuilds -> Signs -> Uploads final blob URL back. |
| `process_source_build` | Unpacks raw Gradle zip boundaries -> Validates `gradlew assembleRelease` hooks -> Zipaligns `.aab` results. |

---

## Environment Variables

Copy `.env.example` into `.env` to configure your isolated build node:

- `BACKEND_API_URL`: Base URL for the backend HTTP controller (e.g. `http://backend:4000`).
- `BACKEND_API_TOKEN`: Shared encryption secret bridging security between backend and worker.
- `AZURE_STORAGE_CONNECTION_STRING`: Connection URI string wrapping container authorizations.
- `AZURE_STORAGE_CONTAINER`: Usually `apk-whitelabel-outputs` for holding built artifacts temporarily.
- `BUILD_WORK_DIR`: Ephemeral scratch space mapping `tmp` directory artifacts (e.g. `/app/workdir`).

---

## Docker Execution

The Python Worker uses extensive C-extensions and specific Ubuntu dependency injection bindings. **Do not run this locally via PyEnv.** To build and start:

```bash
cd docker/
docker compose -f docker-compose.yml up worker --build
```

---

## Expanding Modules & Extensions

- **Branding Logic**: Subclass logic inside `BuildRequest.config` dictionaries to dynamically overwrite internal properties within `AndroidManifest.xml` tags.
- **Asset Resizing**: Future extensions wrapping graphic utilities to resize `.png` and `.webp` icon assets properly across the `.apk` density folder matrix.
- **Observability**: Expose Readiness/Liveness endpoints inside `main.py` when orchestrating in heavy container deployment networks (e.g., Azure Web Apps or Kubernetes).

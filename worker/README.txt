Worker Service - APK WhiteLabel Studio
======================================

Overview
--------

The worker service executes Android builds in isolation. It receives jobs from the backend (via BullMQ) and performs:
- APK-based rebranding builds using apktool.
- Source-based builds using the Gradle wrapper.
- Signing/optimization steps (with hooks to integrate keystore and signing tools).
- Upload of final APK/AAB artifacts to Azure Blob Storage.
- Streaming of build logs and status back to the backend in real time.

It is implemented as a FastAPI application and runs in its own Docker container.


Tech stack
----------

- Python 3.12
- FastAPI
- Uvicorn
- httpx
- azure-storage-blob


Structure
---------

- src/main.py
  - FastAPI app definition.
  - BuildRequest model: { buildId, sourceUrl, sourceType, config, buildType }.
  - append_logs:
      Sends log messages and optional status/downloadUrl to the backend’s internal endpoint
      using BACKEND_API_URL and BACKEND_API_TOKEN.
  - download_to_file:
      Downloads APK/ZIP from a URL to a temporary directory.
  - upload_to_blob:
      Uploads build artifacts to Azure Blob Storage and returns a public URL.
  - process_apk_build:
      - Downloads APK from sourceUrl.
      - Runs "apktool d" to decompile.
      - Applies branding (hook point for config application).
      - Rebuilds with "apktool b" to produce unsigned.apk.
      - Signs and zipaligns the APK (hook for apksigner/jarsigner/zipalign).
      - Uploads the final signed artifact to Azure and returns its URL.
  - process_source_build:
      - Downloads ZIP from sourceUrl.
      - Unzips into a source directory.
      - Validates presence of "./gradlew".
      - Runs "./gradlew assembleRelease".
      - Locates generated APK (or AAB) under app/build/outputs.
      - Uploads the artifact to Azure and returns its URL.
  - /build endpoint (POST):
      Orchestrates a single build based on BuildRequest, creating a temp working dir, routing
      to the correct build pipeline, sending logs/status updates, and cleaning up.


Environment variables
---------------------

See worker/.env.example:
- BACKEND_API_URL
  Base URL for the backend (e.g. http://backend:4000).

- BACKEND_API_TOKEN
  Shared secret; must match BACKEND_INTERNAL_TOKEN in backend/.env. Used in x-internal-token header.

- AZURE_STORAGE_CONNECTION_STRING
  Connection string for the Azure Storage account used to store built artifacts.

- AZURE_STORAGE_CONTAINER
  Container name for build outputs (e.g. apk-whitelabel-outputs).

- BUILD_WORK_DIR
  Directory used for temporary working space during builds (e.g. /app/workdir).


Local development
-----------------

1. Create and activate a virtual environment:
   - cd worker
   - python -m venv .venv
   - source .venv/bin/activate

2. Install dependencies:
   - pip install -r requirements.txt

3. Configure env:
   - Copy .env.example to .env and set the values, making sure BACKEND_API_TOKEN matches the backend.

4. Run the service:
   - python -m src.main
   - By default the service runs on port 5000.

Note: for a full end-to-end flow, the backend and supporting infrastructure (Postgres, Redis, Azure Storage) must be running.


Docker build
------------

The service is containerized using docker/Dockerfile.worker:
- Installs Java runtime and basic Android build tooling (apktool, Android build tools, zip/unzip).
- Installs Python dependencies from requirements.txt.
- Sets BUILD_WORK_DIR and exposes port 5000.

To build and run via Docker Compose, use the root docker/docker-compose.yml.


Extending the worker
--------------------

- Branding logic:
  - Implement functions to modify AndroidManifest.xml and resources under the decompiled APK tree
    using the flavor config passed in BuildRequest.config.

- Signing:
  - Integrate real keystore management and signing steps using apksigner or jarsigner.
  - Use config parameters for keystore path, passwords, alias, and key passwords.

- AAB and bundletool:
  - Extend process_source_build or process_apk_build to run bundletool for generating AABs when buildType requests it.

- Observability:
  - Add structured logging.
  - Expose health/readiness endpoints as needed for orchestration.


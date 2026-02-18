APK WhiteLabel Studio
======================

Overview
--------

APK WhiteLabel Studio is a multi-service SaaS platform for generating white-labeled Android builds (APK/AAB) from either existing APKs or Android source code. It is designed to be secure, containerized, and production-ready with a modern dashboard UI and a background build worker.

Key components:
- Backend API (Node.js, Express, TypeScript, PostgreSQL, BullMQ, Azure Blob Storage)
- Worker service (Python, FastAPI, apktool/Gradle build pipeline)
- Frontend (Next.js, Tailwind CSS, Socket.IO client)
- Infrastructure (Docker, docker-compose, Redis, Postgres)


High-level flow
---------------

1. Authentication
   - Users register and log in via the frontend.
   - The backend issues JWTs, which the frontend stores and attaches to all API requests.

2. Projects and flavors
   - Users create Projects to represent apps.
   - Under each Project, users create Flavors (e.g. Client A, Client B).
   - Each Flavor holds a JSON configuration describing branding and integration settings:
     - App name, package name
     - App icon/splash theme references
     - Colors and strings
     - Firebase and AdMob configurations
     - API base URL, app version
     - Signing keystore information (if needed)

3. Uploads
   - For each Flavor, the user can upload:
     - An existing signed/unsigned APK, or
     - An Android source ZIP (Gradle project with ./gradlew).
   - The frontend uploads these via the backend, which:
     - Validates file type and size.
     - Runs a pluggable virus-scan hook.
     - Streams the file to Azure Blob Storage and returns a URL.

4. Build queue
   - When the user queues a build for a Flavor, the backend:
     - Creates a Build record including:
       - Flavor reference
       - Source URL and type (APK or SOURCE)
       - Build type (APK, AAB, or BOTH)
       - Initial status (QUEUED)
     - Enqueues a BullMQ job that targets the worker service.

5. Worker build pipeline
   - The Python worker consumes jobs from the queue (via the backend) and:
     - Downloads the source APK or ZIP from Azure Blob.
     - For APK:
       - Runs apktool to decompile.
       - Applies branding and config changes (AndroidManifest/resources/etc.).
       - Rebuilds the APK with apktool.
       - Signs and zipaligns the APK (keystore configuration is provided via flavor config).
     - For SOURCE:
       - Extracts the ZIP and runs ./gradlew assembleRelease.
       - Locates the generated APK/AAB.
       - Signs and optimizes the artifact if needed.
     - Uploads the final artifact(s) back to Azure Blob.
   - Throughout the build, the worker streams logs and status updates to the backend via a token-protected internal endpoint.

6. Real-time logs and downloads
   - The backend broadcasts log updates and state transitions via Socket.IO to clients subscribed on the buildId room.
   - The frontend build detail page subscribes to build updates and renders:
     - Live logs
     - Current status
     - Download link when the build is complete


Repositories and directories
----------------------------

- backend/
  TypeScript Express API, Prisma schema, BullMQ queues, upload and auth logic.

- worker/
  Python FastAPI service implementing the build pipeline with apktool/Gradle and Azure Blob Storage integration.

- frontend/
  Next.js (App Router) app with authentication, dashboard, projects/flavors/builds pages, and real-time log viewer.

- docker/
  Dockerfiles for backend, worker, and frontend, plus docker-compose.yml for local development.


Developer workflow
------------------

1. Fork and clone the repository.

2. Configure environment variables:
   - Copy *.env.example files to .env in backend, worker, and frontend.
   - Edit secrets for JWT, database, Redis, and Azure.

3. Run locally:
   - Use docker/docker-compose.yml for a full local stack (recommended), or
   - Run backend, worker, frontend separately using Node/Python tools as described in each service README.

4. Database migrations:
   - Use Prisma to create and evolve the schema.
   - Run migrations locally with `npx prisma migrate dev` and in production with `npx prisma migrate deploy`.

5. Contribution guidelines (high level):
   - Keep services stateless where possible.
   - Use the provided API contracts and extend via new versioned endpoints when changing behavior.
   - Add or update tests for new features (unit and integration).
   - Ensure changes respect security boundaries:
     - JWT-protected public APIs.
     - Token-guarded internal worker endpoints.
     - No sensitive secrets in logs or client bundles.

See backend/README.txt, frontend/README.txt, and worker/README.txt for service-specific details, commands, and extension points.


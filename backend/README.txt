Backend Service - APK WhiteLabel Studio
=======================================

Overview
--------

The backend service is a TypeScript-based Express API that provides:
- Authentication (JWT)
- Project and flavor management
- Build lifecycle (creation, status tracking, listing)
- File upload orchestration to Azure Blob Storage
- Integration with Redis/BullMQ for build queueing
- Real-time build updates via Socket.IO
- An internal endpoint for the worker to push logs and state transitions


Tech stack
----------

- Node.js + Express
- TypeScript
- Prisma ORM + PostgreSQL
- BullMQ + Redis
- Socket.IO
- Azure Blob Storage SDK


Structure
---------

- src/index.ts
  Entry point, Express app setup, Socket.IO server, route wiring, queue initialization.

- src/routes/auth.ts
  - POST /api/auth/register
  - POST /api/auth/login
  Handles user registration/login with bcrypt password hashing and JWT issuance.

- src/routes/projects.ts
  - GET /api/projects
  - POST /api/projects
  - POST /api/projects/create-flavor
  - GET /api/projects/:projectId/flavors
  - GET /api/projects/flavors/:flavorId
  - PATCH /api/projects/flavors/:flavorId
  Manages projects and flavors and their JSON branding configuration.

- src/routes/builds.ts
  - GET /api/builds
  - GET /api/builds/:buildId
  - GET /api/builds/flavor/:flavorId
  - POST /api/builds/build
  - POST /api/builds/:buildId/logs (user-authenticated log updates, rarely used)
  Manages build creation, listing, and status querying.

- src/routes/uploads.ts
  - POST /api/uploads/upload-apk
  - POST /api/uploads/upload-source
  Handles multipart uploads (APK or ZIP) with:
    - File type and size validation
    - Pluggable virus-scan hook
    - Azure Blob upload to a configured container

- src/routes/internal.ts
  - POST /internal/builds/:buildId/logs
  Internal-only endpoint (protected with BACKEND_INTERNAL_TOKEN) used by the worker to:
    - Append logs to a Build
    - Update status and download URL
    - Broadcast updates via Socket.IO

- src/queue/init.ts
  Sets up BullMQ connection and export of the build queue, and starts the queue worker.

- src/queue/worker.ts
  BullMQ Worker that consumes "builds" jobs and forwards them to the Python worker service (`WORKER_SERVICE_URL`).

- src/middleware/auth.ts
  JWT-based auth middleware that protects `/api/**` routes (except `/api/auth`).

- prisma/schema.prisma
  Prisma models:
    - User
    - Project
    - Flavor
    - Build (with BuildStatus enum)


API overview
------------

Authentication:
- POST /api/auth/register { email, password }
- POST /api/auth/login { email, password }
  -> { token }

Projects & flavors:
- GET /api/projects
- POST /api/projects { name }
- POST /api/projects/create-flavor { projectId, name, config }
- GET /api/projects/:projectId/flavors
- GET /api/projects/flavors/:flavorId
- PATCH /api/projects/flavors/:flavorId { name?, config? }

Builds:
- GET /api/builds
- GET /api/builds/:buildId
- GET /api/builds/flavor/:flavorId
- POST /api/builds/build {
    flavorId,
    buildType: "APK" | "AAB" | "BOTH",
    sourceUrl,
    sourceType: "APK" | "SOURCE"
  }

Uploads:
- POST /api/uploads/upload-apk (multipart/form-data: file, projectId, flavorId?)
- POST /api/uploads/upload-source (multipart/form-data: file, projectId, flavorId?)

Internal (worker only):
- POST /internal/builds/:buildId/logs {
    append?: string,
    status?: "PENDING" | "QUEUED" | "RUNNING" | "SUCCESS" | "FAILED",
    downloadUrl?: string
  }
  Header: x-internal-token must match BACKEND_INTERNAL_TOKEN.


Environment variables
---------------------

See .env.example for full list:
- NODE_ENV
- PORT
- DATABASE_URL
- JWT_SECRET
- REDIS_URL
- FRONTEND_ORIGIN
- AZURE_STORAGE_CONNECTION_STRING
- AZURE_STORAGE_CONTAINER
- WORKER_SERVICE_URL
- BACKEND_INTERNAL_TOKEN


Local development
-----------------

1. Install dependencies:
   - cd backend
   - npm install

2. Generate Prisma client and run migrations:
   - npx prisma generate
   - npx prisma migrate dev --name init

3. Start dev server:
   - npm run dev
   The API will run on http://localhost:4000 by default.


Build and run (production)
--------------------------

1. Compile TypeScript:
   - npm run build

2. Start:
   - npm start

3. Docker:
   - Use docker/Dockerfile.backend from the repo root (via docker-compose or your own deployment).


Extending the backend
---------------------

- Add new routes under src/routes with proper authentication checks.
- Keep public APIs under /api and protected by JWT (authMiddleware).
- Keep internal-only service-to-service APIs under /internal and protect them using shared secrets or private networking.
- Update Prisma schema carefully and run migrations; avoid destructive changes without a migration path.
- When changing build behavior, prefer adding new optional fields to the Build model instead of breaking existing ones.


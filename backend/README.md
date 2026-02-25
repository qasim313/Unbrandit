# Backend Service - APK WhiteLabel Studio

## Overview

The backend service is a TypeScript-based Express API that orchestrates the entire APK/AAB build lifecycle. It connects the user-facing dashboard with the isolated build pipeline, managing authentication, project definitions, uploads, and queueing.

### Key Capabilities
- **Authentication**: JWT issuance and validation.
- **Flavors**: Project and flavor schema management.
- **Build Lifecycle**: Creation, status tracking, and database querying.
- **Storage Integrations**: File upload orchestration directly to Azure Blob Storage using SAS tokens.
- **Queues**: Integration with Redis and BullMQ for pushing builds to the isolated worker.
- **WebSockets**: Real-time log broadcasting to the Next.js frontend via Socket.IO.

---

## Tech Stack

- Node.js & Express
- TypeScript
- Prisma ORM & PostgreSQL
- BullMQ & Redis
- Socket.IO
- `@azure/storage-blob`

---

## Directory Structure

| File | Description |
|-----------|-------------|
| `src/index.ts` | Entry point, Express app setup, Socket.IO server, queue initialization. |
| `src/routes/auth.ts` | Handles user registration/login with bcrypt password hashing and JWT issuance. |
| `src/routes/projects.ts` | Manages projects, flavors, and branding configuration modifications. |
| `src/routes/builds.ts` | Manages build creation, querying, and logs filtering. |
| `src/routes/uploads.ts` | Manages multipart uploads (APK, Keystores, Graphics) and streams them to Azure. |
| `src/routes/internal.ts` | Private endpoints for the Worker pipeline to push updates and status hooks. |
| `src/queue/init.ts` | Sets up BullMQ connection, exports the build queue. |
| `src/queue/worker.ts` | BullMQ Worker that consumes `builds` jobs and forwards them to the Python Worker Service (`WORKER_SERVICE_URL`). |
| `prisma/schema.prisma` | PostgreSQL Schemas (User, Project, Flavor, Build). |

---

## API Overview

### Authentication
- `POST /api/auth/register`
- `POST /api/auth/login`

### Projects & Flavors
- `GET /api/projects`
- `POST /api/projects`
- `POST /api/projects/create-flavor`
- `GET /api/projects/:projectId/flavors`
- `PATCH /api/projects/flavors/:flavorId`

### Builds
- `GET /api/builds`
- `POST /api/builds/build`
  ```json
  {
    "flavorId": "string",
    "buildType": "APK | AAB | BOTH",
    "sourceUrl": "string",
    "sourceType": "APK | SOURCE"
  }
  ```

### Internal (Worker Only)
> Protected via `x-internal-token` header mapping to `BACKEND_INTERNAL_TOKEN`
- `POST /internal/builds/:buildId/logs`

---

## Environment Variables

Copy `.env.example` into `.env` to test locally:

- `NODE_ENV`
- `PORT`
- `DATABASE_URL` (Postgres Database String)
- `JWT_SECRET`
- `REDIS_URL` (Redis Connection String)
- `FRONTEND_ORIGIN` (Usually `http://localhost:3000`)
- `AZURE_STORAGE_CONNECTION_STRING`
- `AZURE_STORAGE_CONTAINER`
- `WORKER_SERVICE_URL`
- `BACKEND_INTERNAL_TOKEN` (Shared secret between backend and Python worker)

---

## Getting Started (Local Development)

It is heavily recommended that developers use `docker-compose.yml` to spin this service up alongside Redis, Postgres, and the Frontend. However, to run purely bare-metal:

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Generate Prisma client and run migrations**
   ```bash
   npx prisma generate
   npx prisma migrate dev --name init
   ```

3. **Start the dev server**
   ```bash
   npm run dev
   ```
   *The API will run on http://localhost:4000 by default.*

---

## Extending the Backend

- **Security Boundaries**: Ensure new internal APIs are always protected behind `BACKEND_INTERNAL_TOKEN`.
- **Database Modularity**: When changing build behavior, avoid destructive migrations in `schema.prisma`. Try adding optional fields to the `Build` model.

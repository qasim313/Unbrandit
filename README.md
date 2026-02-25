<div align="center">
  <img src="logo.png" alt="Unbrandit Logo" width="120" />
  <h1>Unbrandit ⚡️</h1>
  <p><strong>A containerized SaaS platform for automated Android white-labeling and App Bundle generation.</strong></p>
</div>

---

## 📖 Overview

Unbrandit is a multi-service SaaS platform for generating white-labeled Android builds (`.apk` and `.aab`) dynamically from a base application source code or existing pre-compiled APK. It is designed to be highly secure, containerized, and production-ready with a modern dashboard UI and a background build worker. 

The application is split into three main microservices:
- **Frontend**: Next.js 14 App Router, Tailwind CSS, Monaco Editor, Socket.IO client.
- **Backend API**: Node.js, Express, TypeScript, Prisma (PostgreSQL), BullMQ, Azure Blob Storage.
- **Worker Pipeline**: Python, FastAPI, Apktool/aapt2/bundletool build pipeline.

---

## ✨ Features

- **Dynamic App Flavors**: Create and manage multiple application versions (flavors) with distinct branding, icons, and package names.
- **APK & Base Source Support**: Upload a pre-built APK to decompile and modify, or upload raw Gradle source code boundaries.
- **AAB Generation**: Automatically converts APK resources to protobuf arrays and packages them into Google Play Store-ready Android App Bundles (`.aab`).
- **Bring Your Own Keystore**: Upload your existing `.jks` or `.keystore` files directly to the dashboard to avoid Play Store signature mismatch errors!
- **Real-Time Logs**: WebSockets are used to stream live build steps from the isolated Python Worker directly to your browser.
- **Advanced Code Editor**: Overwrite hardcoded mobile app strings and colors dynamically in the browser using the fully embedded VS Code Monaco editor.

---

## 🏗 Architecture

### 1. The Core Loop
1. **Flavors**: Users create a Project, and then child Flavors inside that Project.
2. **Config**: The Flavor contains all branding constraints: App Name, Package Name, APIs, Keystores, overriding XML Strings.
3. **Queue**: Jobs are requested and placed into a Redis queue using BullMQ.
4. **Worker**: The background Python container decompiles the app using `apktool`, hot-swaps the resources based on the JSON configuration, and then rebuilds, zipaligns, and signs the app.

### 2. Infrastructure
All artifacts and Keystores are stored inside **Azure Blob Storage** via secure backend-generated SAS tokens. Live real-time streaming relies on a **Redis** event subscription architecture. Relational data lives in **PostgreSQL**.

---

## 🚀 Getting Started

### 1. Prerequisites
- Docker and Docker Compose installed.

### 2. Environment Configuration
Duplicate the example environment variables across the workspace. Fill in your Azure blob storage credentials, PostgreSQL passwords, and Gmail app passwords.

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
cp worker/.env.example worker/.env
cp docker/.env.example docker/.env # Optional
```

*Note: The `BACKEND_INTERNAL_TOKEN` must be matched between your `backend/.env` and `worker/.env` files!*

### 3. Running Locally (Docker Compose)
We highly recommend running the entire stack via Docker Compose which spins up Postgres, Redis, the Node Backend, the Next.js Frontend, and the Python Worker environments.

```bash
cd docker
docker compose -f docker-compose.dev.yml up -d --build
```

The stack starts on:
- **Frontend App**: `http://localhost:3000`
- **Backend API**: `http://localhost:4000/api`
- Postgres/Redis are exposed on `5432` and `6379`.

Initialize the database schemas inside the backend container:
```bash
docker compose exec backend npx prisma migrate dev --name init
```

---

## 🛡 Security & Best Practices
- Keep services stateless where possible.
- Avoid passing Secrets or Keystore passwords in the logging chunks broadcasted to the WebSockets.
- All secrets are injected through `.env` arrays which are globally ignored in standard `.gitignore` configs.

---

## 📚 Service Deep Dives
For details on running individual services outside of Docker or creating your own build tools logic, refer to their individual documentations:
- [Backend README](backend/README.txt)
- [Frontend README](frontend/README.txt)
- [Worker README](worker/README.txt)

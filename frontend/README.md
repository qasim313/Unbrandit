# Frontend - APK WhiteLabel Studio

## Overview

The Frontend is a Next.js 14 App Router application that acts as the user-facing dashboard for Unbrandit. It provides:
- Authentication flows (login/register).
- Project and flavor management hierarchies.
- Real-time build logs via WebSockets.
- Advanced JSON configuration schemas and Monaco Editor component integration.
- Direct uploads of Keystores, Logos, APKs, and Source ZIPs to Azure Storage.

### Tech Stack

- Next.js (15, App Router)
- React 18
- Tailwind CSS (Dark Stripe-style dashboard look)
- Axios
- Zustand (State management)
- Socket.IO-client

---

## Directory Structure

| File | Description |
|-----------|-------------|
| `app/layout.tsx` | Global layout and Tailwind theme wrapper. |
| `app/page.tsx` | Landing page with entry points to login/register. |
| `app/login/page.tsx` | Authentication UI routing to `/api/auth/login`. |
| `app/dashboard/page.tsx` | Lists user projects and generates an overview of recent builds. |
| `app/projects/[projectId]/page.tsx` | Project detail tree containing flavors. |
| `app/flavors/[flavorId]/page.tsx` | Comprehensive branding config editor, upload components, and Advanced Monaco Editor string/color overrides. |
| `app/builds/[buildId]/page.tsx` | Real-time WebSocket subscriptions to build logs streaming directly from the Python worker. |
| `components/ui/` | Minimal ShadCN styled components (button, input, terminal logs wrapper). |
| `lib/api.ts` | Base Axios client wrapper with automatic JWT Bearer injection headers. |
| `store/auth.ts` | Zustand store managing JWT token states parsed from localStorage. |
| `hooks/useBuildLogs.ts` | Socket.IO listener connection routing build chunks to React state. |

---

## Environment Variables

Copy `.env.example` into `.env.local` to override runtime endpoints:

- `NEXT_PUBLIC_API_BASE_URL`: Base URL of the backend API (e.g. `http://localhost:4000/api`).
- `NEXT_PUBLIC_WS_URL`: WebSocket URL for Socket.IO (e.g. `http://localhost:4000`).

---

## Getting Started (Local Development)

It is highly recommended to run this alongside the `docker-compose.yml` local orchestration instead of bare-metal to assure PostgreSQL, Redis, and Python workers are interconnected.

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Run dev server**
   ```bash
   npm run dev
   ```
   *Visit http://localhost:3000.*

---

## Contribution Guidelines

- **Stateless Structure**: Keep API calls centralized via `lib/api.ts`.
- **Security Check**: *Never* store any secrets or backend internal tokens within `process.env.*` variables in the Next.js `app/` structure. Only use `NEXT_PUBLIC_*` strictly representing public domains.
- **Real-Time Additions**: Centralize generic WebSocket polling events tightly into React Hooks (`hooks/useBuildLogs`) instead of random page components.

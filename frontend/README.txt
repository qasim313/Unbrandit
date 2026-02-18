Frontend - APK WhiteLabel Studio
================================

Overview
--------

The frontend is a Next.js (App Router) application that provides:
- Authentication flows (login/register)
- Dashboard with projects and recent builds
- Project and flavor management
- Upload and build triggers for each flavor
- Build details with real-time log streaming and download link

It uses Tailwind CSS for styling and Socket.IO for live updates.


Tech stack
----------

- Next.js (15, App Router)
- React 18
- Tailwind CSS
- Axios
- Zustand state management
- Socket.IO client


Structure
---------

- app/layout.tsx
  Global layout and Tailwind theme (dark, Stripe-style dashboard look).

- app/page.tsx
  Landing page with entry points to login and registration.

- app/login/page.tsx
  Login form, calls /api/auth/login and stores JWT on success.

- app/register/page.tsx
  Registration form, calls /api/auth/register and stores JWT on success.

- app/dashboard/page.tsx
  Main dashboard:
    - Lists user projects.
    - Allows creating new projects.
    - Shows recent builds with links to build detail views.

- app/projects/[projectId]/page.tsx
  Project detail:
    - Shows project name.
    - Lists flavors for that project.
    - Allows creating new flavors with default empty config.
    - Links into the flavor detail page.

- app/flavors/[flavorId]/page.tsx
  Flavor detail:
    - Displays flavor name and owning project.
    - Allows editing JSON config for branding (app name, package, colors, Firebase/AdMob, API base URL, version, signing options).
    - Allows uploading an APK or source ZIP for this flavor and queuing a new build.
    - Shows build history for the flavor with links to each build.

- app/builds/[buildId]/page.tsx
  Build detail:
    - Fetches a single build’s current status.
    - Subscribes to build updates via WebSocket.
    - Shows current status, logs, and a download link if present.

- components/ui/button.tsx
  Minimal shadcn-style Button component (primary and ghost variants).

- components/ui/input.tsx
  Minimal input component styled to match dashboard look.

- lib/api.ts
  Axios instance with base URL from NEXT_PUBLIC_API_BASE_URL and automatic JWT bearer injection.

- store/auth.ts
  Zustand store that keeps the current JWT token and syncs it to localStorage.

- hooks/useBuildLogs.ts
  Hook that:
    - Connects to Socket.IO server at NEXT_PUBLIC_WS_URL.
    - Emits "subscribeBuild" with the buildId.
    - Listens for "buildUpdate" events and updates logs, status, and download URL.


Environment variables
---------------------

See frontend/.env.example:
- NEXT_PUBLIC_API_BASE_URL
  Base URL of the backend API (e.g. http://localhost:4000/api).

- NEXT_PUBLIC_WS_URL
  WebSocket URL for Socket.IO (e.g. http://localhost:4000).


Local development
-----------------

1. Install dependencies:
   - cd frontend
   - npm install

2. Configure env:
   - Copy .env.example to .env and adjust as needed.

3. Run dev server:
   - npm run dev
   - Visit http://localhost:3000

Note: the backend and worker must be running and properly configured for build-related features to work.


Build and run (production)
--------------------------

1. Build:
   - npm run build

2. Start:
   - npm start

3. Docker:
   - Use docker/Dockerfile.frontend at the repo root (through docker-compose or another orchestration).


Contribution guidelines
-----------------------

- Follow the existing layout structure (App Router) when adding pages.
- Use the UI components in components/ui for consistency.
- Keep API calls centralized via lib/api.ts.
- Avoid storing secrets or internal tokens in the frontend; only use public env vars (NEXT_PUBLIC_*).
- When adding new real-time features, extend the existing Socket.IO integration through hooks instead of ad-hoc client instances.


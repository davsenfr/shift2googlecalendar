# Shift to Google Calendar

NestJS + React application for adding work shifts to Google Calendar.

## Local development with Docker

Requirements: Docker Desktop with Docker Compose.

1. Create the local environment file:

   ```powershell
   Copy-Item .env.example .env
   ```

2. Add `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` to `.env`.
3. In the Google Cloud OAuth web client, authorize this redirect URI:

   ```text
   http://localhost:3001/api/auth/google/callback
   ```

4. Build and start both development containers:

   ```bash
   docker compose up --build
   ```

Open `http://localhost:5173`. The services are deliberately exposed on two URLs, as they are on Render:

- Web (Vite): `http://localhost:5173`
- API (NestJS): `http://localhost:3001/api`

Vite proxies browser requests from `/api` to the `backend` Compose service. Source folders are mounted into the containers, so Nest and Vite reload when files change. Google OAuth tokens are persisted in the host's `.data` directory.

Stop the application with:

```bash
docker compose down
```

Add `--volumes` only when you also want to recreate the development `node_modules` volumes.

## Local development without Docker

Requirements: Node.js 22 or newer.

```bash
npm ci
npm run dev
```

The same `.env` values and local URLs apply.

## Render deployment

The API and web frontend are separate Render services.

### API web service

Use the repository root as the Docker build context and `apps/api/Dockerfile` as the Dockerfile. The final `runtime` stage is selected by default. Render supplies `PORT`; the application already prefers it over `API_PORT`.

Set at least these environment variables:

```text
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=https://YOUR-API.onrender.com/api/auth/google/callback
GOOGLE_CALENDAR_ID=primary
GOOGLE_CALENDAR_TIMEZONE=Europe/Paris
GOOGLE_TOKEN_PATH=...
WEB_URL=https://YOUR-WEB.onrender.com
```

`WEB_URL` must be the exact public frontend origin. It is used both for CORS and for the redirect after Google OAuth.

### Web static site

Use these settings:

```text
Build command: npm ci && npm run build --workspace=@shift-to-gc/web
Publish directory: apps/web/dist
```

Set this build-time environment variable, including the API's `/api` prefix:

```text
VITE_API_BASE_URL=https://YOUR-API.onrender.com/api
```

Vite embeds `VITE_API_BASE_URL` into the static JavaScript bundle at build time. Changing it requires a new web build/deploy.

If the web service is ever deployed from its Dockerfile instead of as a static site, pass the same value as the `VITE_API_BASE_URL` Docker build argument.

## Production builds outside Render

```bash
npm run build
npm start
```

The OAuth token file contains sensitive data. Keep it outside the public web root on persistent, encrypted storage. The current token store is intended for a single user; a multi-user deployment should use encrypted per-user storage.

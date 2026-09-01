# Shift to Google Calendar

NestJS + React application for adding work shifts to Google Calendar.

## Local development with Docker

Requirements: Docker Desktop with Docker Compose.

1. Create the local environment file:

   ```powershell
   Copy-Item .env.example .env
   ```

2. Add `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `DATABASE_URL`, and
   `DATABASE_URL_UNPOOLED` to `.env`.
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

Vite proxies browser requests from `/api` to the `backend` Compose service. Source folders are mounted into the containers, so Nest and Vite reload when files change. Google OAuth tokens and short-lived OAuth state values are persisted in Neon PostgreSQL.

The API applies pending database migrations before starting in development.

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

## Tests

The project uses [Vitest](https://vitest.dev/) in both workspaces. API tests run in
Node.js and replace Google Calendar with mocks, so they never modify a real calendar.
Web tests use Testing Library and `jsdom` to render React components in a simulated
browser.

Install the dependencies once from the repository root:

```bash
npm ci
```

Run every API and web test once:

```bash
npm test
```

Run only one workspace:

```bash
npm run test --workspace=@shift-to-gc/api
npm run test --workspace=@shift-to-gc/web
```

During development, watch mode keeps Vitest running and reruns the relevant tests
after each file change:

```bash
npm run test:watch --workspace=@shift-to-gc/api
npm run test:watch --workspace=@shift-to-gc/web
```

Press `q` to leave watch mode. A test is organized around three basic functions:

- `describe(...)` groups related behavior.
- `it(...)` defines one expected behavior.
- `expect(...)` verifies the result.

If Node.js is not installed locally, rebuild the development images after adding the
test dependencies, then run each suite inside Docker:

```bash
docker compose build backend frontend
docker compose run --rm --no-deps backend npm test
docker compose run --rm --no-deps frontend npm test
```

The current test suites are:

- `apps/api/test/calendar.service.spec.ts`: unit tests for adopting and updating an
  external Google Calendar event, including rejection of an unknown event ID.
- `apps/web/src/App.test.tsx`: component tests for the relative-day badge and the
  behavior when Google does not confirm an update.

Before committing a change, a useful complete check is:

```bash
npm test
npm run typecheck
npm run build
```

## Google Calendar event color mapping

Google Calendar event colors use the `colorId` values from the
[Calendar API event palette](https://developers.google.com/workspace/calendar/api/v3/reference/colors).
The names below are the names shown in the Google Calendar UI, as documented by the
[Apps Script `EventColor` enum](https://developers.google.com/apps-script/reference/calendar/event-color).

| Color name | `colorId` | Hexadecimal code |
| --- | ---: | --- |
| Lavender | `1` | `#a4bdfc` |
| Sage | `2` | `#7ae7bf` |
| Grape | `3` | `#dbadff` |
| Flamingo | `4` | `#ff887c` |
| Banana | `5` | `#fbd75b` |
| Tangerine | `6` | `#ffb878` |
| Peacock | `7` | `#46d6db` |
| Graphite | `8` | `#e1e1e1` |
| Blueberry | `9` | `#5484ed` |
| Basil | `10` | `#51b749` |
| Tomato | `11` | `#dc2127` |

## Vercel API deployment with Neon

The API is ready for Vercel's native NestJS runtime. Its `src/main.ts` entry point is detected automatically, and `apps/api/vercel.json` pins the NestJS framework preset.

1. Import this Git repository as a new Vercel project.
2. Set **Root Directory** to `apps/api`. Leave the automatically detected install and build commands unchanged.
3. In **Settings > Environment Variables**, add the production variables below.
4. Add the final callback URL to the Google Cloud OAuth client's **Authorized redirect URIs**.
5. Deploy again after saving environment variables.

```text
DATABASE_URL=postgresql://...-pooler.../DATABASE?sslmode=require
DATABASE_URL_UNPOOLED=postgresql://.../DATABASE?sslmode=require
TOKEN_ENCRYPTION_KEY=<base64-encoded 32-byte key>
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=https://YOUR-API-DOMAIN/api/auth/google/callback
GOOGLE_CALENDAR_ID=primary
GOOGLE_CALENDAR_TIMEZONE=Europe/Paris
WEB_URL=https://YOUR-WEB-DOMAIN
```

Copy `DATABASE_URL` from Neon's **Connect** dialog with connection pooling enabled, or let the Neon Vercel integration create it. `DATABASE_URL_UNPOOLED` is the direct connection used only by Drizzle migrations; enable that variable in the integration or copy the connection with pooling disabled. Generate `TOKEN_ENCRYPTION_KEY` once and keep the same value across deployments:

```powershell
node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('base64'))"
```

Do not commit either value. Losing or changing `TOKEN_ENCRYPTION_KEY` makes existing credentials unreadable; in that case, delete the `primary` row from `google_oauth_credentials` and reconnect Google Calendar.

The Vercel build runs committed Drizzle migrations before building the API. The initial migration adopts existing `google_oauth_credentials` and `google_oauth_states` tables without deleting their data. The credential JSON is encrypted with AES-256-GCM before it reaches PostgreSQL. OAuth state values are stored only as SHA-256 hashes and consumed once, which makes the callback safe when Vercel routes its two requests to different function instances.

After changing `apps/api/src/database/schema.ts`, generate and review a migration, then commit the schema, SQL migration, and Drizzle metadata together:

```bash
npm run db:generate --workspace=@shift-to-gc/api
npm run db:check --workspace=@shift-to-gc/api
```

Apply pending migrations manually with `npm run db:migrate --workspace=@shift-to-gc/api`. Migration commands prefer `DATABASE_URL_UNPOOLED` and fall back to `DATABASE_URL` for local development. For Vercel previews, enable Neon's per-preview database branches so preview migrations never modify the production branch.

`WEB_URL` must be the exact public frontend origin. It is used both for CORS and for the redirect after Google OAuth. For Preview deployments, use a separate Neon branch and a fixed preview domain with its own Google redirect URI; Google's OAuth redirect URI configuration does not accept arbitrary Vercel preview URLs.

### Web static deployment

Use these settings:

```text
Build command: npm ci && npm run build --workspace=@shift-to-gc/web
Publish directory: apps/web/dist
```

Set this build-time environment variable on the frontend host, including the API's `/api` prefix:

```text
VITE_API_BASE_URL=https://YOUR-API-DOMAIN/api
```

Vite embeds `VITE_API_BASE_URL` into the static JavaScript bundle at build time. Changing it requires a new web build/deploy.

If the web service is ever deployed from its Dockerfile instead of as a static site, pass the same value as the `VITE_API_BASE_URL` Docker build argument.

## Production builds outside Render

```bash
npm run build
npm start
```

The current token store is intentionally a single-account store. A multi-user deployment should add a user/account key to both the OAuth credential and state models.

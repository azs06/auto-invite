# Repository Guidelines

## Project Structure & Module Organization
- `src/worker.ts`: Cloudflare Worker entrypoint, `AvailabilityRequest` Durable Object, API handlers, and inlined UI (HTML/CSS/JS).
- `wrangler.toml`: Worker and Durable Object configuration.
- `package.json`: Scripts and dev dependencies (Wrangler).
- `tsconfig.json`: TypeScript compiler options.
- `SPEC.md`: Product/technical spec for the MVP.
- `README.md`: Local dev and deploy notes.
- `CLAUDE.md`: Architecture and routing notes.
- There is no tests directory yet.

## Build, Test, and Development Commands
- `npm install`: Install dev dependencies (Wrangler).
- `npm run dev`: Run the Worker locally via Wrangler (defaults to `http://localhost:8787`).
- `npm run deploy`: Deploy the Worker to Cloudflare.

## Coding Style & Naming Conventions
- Language: TypeScript for the Worker, plain HTML/CSS/JS embedded in `src/worker.ts`.
- Indentation: 2 spaces for JSON/TS.
- Naming: camelCase for variables/functions, PascalCase for classes (`AvailabilityRequest`).
- Keep HTML/CSS inline blocks readable; avoid large template duplication.
- Prefer small helper functions for shared UI and API logic (see `renderNewPage`, `renderRequestPage`, `sharedStyles`).

## Routing & Data Notes
- Pages: `/new` (host form), `/r/:id` (guest), `/r/:id?admin=...` (host admin).
- API: `POST /api/request`, `GET|PUT|DELETE /api/request/:id`, `POST /api/request/:id/submit`, `GET /api/request/:id/availability`, `GET /api/request/:id/export.ics`.
- WebSocket: `/ws/:id?admin=...` for admin submission notifications.
- Durable Object storage keys: `"request"` (RequestData), `"submission"` (SubmissionData).

## Testing Guidelines
- Framework: Vitest.
- Run: `npm run test`.
- Tests live in `tests/`.

## Commit & Pull Request Guidelines
- No enforced commit message format observed; keep messages short and descriptive.
- For PRs, include:
  - Clear summary of changes.
  - Screenshots for UI updates (`/new`, `/r/:id`).
  - Any new env vars documented in `README.md`.

## Security & Configuration Notes
- Secrets are configured via Cloudflare environment variables (e.g., `NOTIFY_WEBHOOK_URL`).
- Do not commit secrets or tokens.

# Auto Invite (Cloudflare Workers)

Simple availability collection app for sending guests a link and reviewing responses.

## Local dev
1. Install dependencies:
   - `npm install`
2. Start the dev server:
   - `npm run dev`
3. Open `http://localhost:8787/new`

## Deploy
- `npm run deploy`

## Environment variables
Optional:
- `NOTIFY_WEBHOOK_URL` - If set, the worker POSTs a JSON payload when a guest submits.

## Durable Objects
This project uses a single Durable Object class:
- `AvailabilityRequest` (one object per request)


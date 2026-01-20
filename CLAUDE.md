# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Auto Invite is a Cloudflare Workers application for collecting guest availability across timezones. Hosts create availability requests with date/time constraints, guests submit their available times, and hosts review submissions in both timezones.

## Commands

```bash
npm install        # Install dependencies (Wrangler)
npm run dev        # Start local dev server at http://localhost:8787
npm run deploy     # Deploy to Cloudflare Workers
```

Start at `http://localhost:8787/new` for the host form.

## Architecture

**Single-file monolith**: Everything lives in `src/worker.ts`:
- Worker fetch handler (routes requests)
- `AvailabilityRequest` Durable Object class (state management)
- API handlers for create/update/delete/submit
- HTML page renderers with inline CSS and JavaScript

**Routing pattern**:
- `/new` - Host creates a new request
- `/r/<token>` - Guest views and submits availability
- `/r/<token>?admin=<adminToken>` - Host admin view
- `/api/request` - POST creates request, returns guest/admin URLs
- `/api/request/:id` - GET/PUT/DELETE for request data
- `/api/request/:id/submit` - POST guest availability
- `/api/request/:id/availability` - GET submission (admin only)

**Durable Object storage keys**:
- `"request"` - `RequestData` (host settings, tokens, constraints)
- `"submission"` - `SubmissionData` (guest availability ranges in UTC)

**Timezone handling**: Host defines constraints in host timezone. System converts to guest's detected timezone for display. All storage uses UTC. Guest timezone is auto-detected via `Intl.DateTimeFormat().resolvedOptions().timeZone`.

## Environment Variables

- `NOTIFY_WEBHOOK_URL` (optional) - Webhook URL for POST notification when guest submits

## Code Style

- TypeScript with strict mode
- 2-space indentation
- camelCase for variables/functions, PascalCase for classes
- HTML/CSS/JS embedded as template literals in render functions
- No external UI frameworks; vanilla JS in `<script type="module">` blocks

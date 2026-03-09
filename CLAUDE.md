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

**Modular structure** — the codebase is split into focused ES modules:

```
src/
  worker.ts              — Fetch handler + routing (entrypoint), re-exports DO
  durable-object.ts      — AvailabilityRequest class (state management)
  handlers.ts            — handleCreateRequest, handleSubmitAvailability
  types.ts               — All type/interface definitions
  utils.ts               — Time, crypto, calendar, webhook, response helpers
  email.ts               — Email templates and send wrappers (Resend)
  pages/
    group-booking.ts     — renderGroupBookingPage() (guest slot booking + admin dashboard)
    new-group.ts         — renderNewGroupPage() (create group booking form)
    new-group-availability.ts — renderNewGroupAvailabilityPage() (create group availability request)
    new.ts               — renderNewPage() (create individual request form)
    request.ts           — renderRequestPage() (guest availability + host admin)
    shared-styles.ts     — sharedStyles() (shared CSS)
```

**Routing pattern**:
- `/new` - Host creates a new individual request
- `/new/group` - Host creates a group booking (slot-based)
- `/new/group-availability` - Host creates a group availability request (multi-guest)
- `/r/<token>` - Guest views and submits availability (individual)
- `/r/<token>?admin=<adminToken>` - Host admin view (individual)
- `/ga/<token>?guest=<guestToken>` - Guest views and submits availability (group)
- `/ga/<token>?admin=<adminToken>` - Host admin view (group availability)
- `/g/<token>` - Guest books a group slot
- `/g/<token>?admin=<adminToken>` - Group booking admin dashboard
- `/api/request` - POST creates request, returns guest/admin URLs
- `/api/request/:id` - GET/PUT/DELETE for request data
- `/api/request/:id/submit` - POST guest availability
- `/api/request/:id/availability` - GET submission (admin only)
- `/api/request/:id/slots` - GET group slots
- `/api/request/:id/book` - POST/DELETE group events
- `/api/request/:id/bookings` - GET all bookings (admin only)
- `/api/request/:id/confirm` - POST confirm a meeting slot
- `/api/request/:id/export.ics` - GET calendar export (admin only)
- `/ws/:id?admin=<token>` - WebSocket for real-time admin notifications

**Durable Object storage keys**:
- `"request"` - `RequestData` (host settings, tokens, constraints)
- `"submission"` - `SubmissionData` (guest availability ranges in UTC)
- `"confirmed"` - `ConfirmedSlot` (confirmed meeting details)
- `"bookings"` - `GroupBookingsData` (group event entries)

**Timezone handling**: Host defines constraints in host timezone. System converts to guest's detected timezone for display. All storage uses UTC. Guest timezone is auto-detected via `Intl.DateTimeFormat().resolvedOptions().timeZone`.

## Environment Variables

- `NOTIFY_WEBHOOK_URL` (optional) - Webhook URL for POST notification when guest submits
- `RESEND_API_KEY` (optional) - Resend API key for email integration
- `EMAIL_FROM` (optional) - Sender email address
- `EMAIL_INVITE_ENABLED` (optional) - Set to `"true"` to send invite emails to guests
- `EMAIL_CONFIRM_ENABLED` (optional) - Set to `"true"` to send confirmation emails with .ics

## Code Style

- TypeScript with strict mode
- 2-space indentation
- camelCase for variables/functions, PascalCase for classes
- HTML/CSS/JS embedded as template literals in render functions
- No external UI frameworks; vanilla JS in `<script type="module">` blocks

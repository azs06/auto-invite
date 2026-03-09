# Resume: Group Availability Request Feature

## Workspace
`/Users/soikat/code/auto-invite`

## Spec Location
`.kiro/specs/group-availability-request/` — `requirements.md`, `design.md`, `tasks.md`

---

## What's Done

All backend work is complete. The following tasks are marked `[x]` in `tasks.md`:

- **Task 1** — Type definitions (`src/types.ts`): `GuestInfo`, `GuestSubmission`, `GroupSubmissionsData`, `TimeSlot`, `AggregatedAvailability`; extended `RequestData` with `guests`, `participationThreshold`, `confirmed`, `hostEmail`
- **Task 2.1** — `generateGuestToken()` in `src/utils.ts`
- **Task 3.1** — `POST /api/group-request` handler in `src/handlers.ts`
- **Task 4.1** — `GET /guest` endpoint in `src/durable-object.ts`
- **Task 4.2** — `GET /request` extended to support `?guest=` token
- **Task 5.1** — `POST /guest-submit` endpoint in `src/durable-object.ts`
- **Task 6** — Checkpoint passed (176 tests passing at time of check)
- **Task 7.1** — `aggregateAvailability()` in `src/utils.ts`
- **Task 8.1** — `GET /aggregated` endpoint with caching and `minParticipation` filter
- **Task 9.1** — `POST /confirm` extended for group-availability
- **Task 10.1** — `GET /export.ics` extended for group-availability
- **Task 12.1** — `PUT /request` extended for group-availability editing
- **Task 12.2** — `DELETE /request` blocks confirmed requests, cleans up group storage keys
- **Task 13.1** — `broadcastToAdmins()` verified correct
- **Task 17.1** — `sendGroupGuestSubmissionNotification()` and `renderGroupGuestSubmissionEmail()` in `src/email.ts`
- **Task 18.1** — Validation error codes (409/403/400) audited
- **Task 18.2** — `escapeHtml()` in `src/utils.ts`; all user inputs sanitized
- **Task 19.1** — DST-aware timezone functions in `src/utils.ts`

---

## What's Left (required tasks only)

### Task 11 — Checkpoint
Run `npm run test` and fix any failures before proceeding to UI work.

### Task 14.1 — `/new/group` UI page
`src/pages/new-group.ts` exists but is currently a **group booking/slot page** (wrong concept). It needs to be replaced with the **group availability request creation form**:
- Host name, timezone, date range, time windows
- Dynamic guest list (add/remove, minimum 3 guests, name + email per guest)
- Submits to `POST /api/group-request`
- Displays admin URL and per-guest URLs after creation

### Task 14.2 — Update `/new` page
`src/pages/new.ts` already has a link to `/new/group` at the bottom. This task may already be done — verify the link is visible and adequate, or add a more prominent choice UI.

### Task 15.1 — Guest UI at `/r/:id?guest=:guestToken`
`src/pages/request.ts` currently only handles the individual 1:1 flow. Need to detect `?guest=` token in the URL and render a group guest submission form:
- Fetch from `GET /api/request/:id?guest=:guestToken`
- Show guest name, request details, allowed dates/windows in guest's local timezone
- Interactive time range picker per date
- Submit to `POST /api/request/:id/guest-submit?guest=:guestToken`
- Show existing submission if already submitted; allow resubmission

### Task 16.1 — Host admin UI for group requests at `/r/:id?admin=:adminToken`
`src/pages/request.ts` currently shows the 1:1 admin view. Need to detect `requestType === "group-availability"` and render:
- Guest list with submitted/pending status
- Aggregated availability grid (color-coded by participation count)
- Participant names on hover per slot
- Minimum participation threshold filter
- WebSocket connection for real-time updates

### Task 16.2 — Confirmation UI in admin view
- Slot selection from the aggregated grid
- Modal/form for meeting title, description, location
- Submit to `POST /api/request/:id/confirm?admin=:adminToken`
- Show confirmed meeting details; disable further submissions

### Task 16.3 — Export button in admin view
- Button linking to `GET /api/request/:id/export.ics?admin=:adminToken`

### Task 20.1 — Concurrency safety
Durable Objects are single-threaded so the read-modify-write in `guest-submit` is already safe. Verify and document this — task may just need a comment + the checkbox ticked.

### Tasks 21.1, 21.2, 21.3 — Integration tests
End-to-end flow, error scenarios, and real-time WebSocket update tests in `tests/`.

### Task 22 — Final checkpoint
All tests pass.

---

## Key Files

| File | Purpose |
|------|---------|
| `src/types.ts` | All type definitions |
| `src/utils.ts` | Token gen, aggregation, timezone, escapeHtml |
| `src/handlers.ts` | `handleCreateGroupRequest` |
| `src/durable-object.ts` | All DO endpoints incl. guest-submit, aggregated, confirm |
| `src/email.ts` | Group guest submission notification |
| `src/worker.ts` | Routing — `/new/group`, `/r/:id`, `/ws/:id` |
| `src/pages/new-group.ts` | Needs rewrite for group availability request creation |
| `src/pages/new.ts` | Already has link to `/new/group` |
| `src/pages/request.ts` | Needs guest + group-admin branches added |
| `tests/` | Vitest tests — run with `npm run test` |

---

## How to Resume

1. Open this file and the tasks.md
2. Run `npm run test` to confirm current state (Task 11)
3. Rewrite `src/pages/new-group.ts` for group availability request creation (Task 14.1)
4. Add guest and group-admin branches to `src/pages/request.ts` (Tasks 15.1, 16.1–16.3)
5. Verify concurrency safety in `src/durable-object.ts` guest-submit handler (Task 20.1)
6. Write integration tests (Tasks 21.1–21.3)
7. Final test run (Task 22)

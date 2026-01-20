## Auto-Invite Availability App Spec (MVP)

### Summary
Collect a guest's availability via a unique URL. The host sets allowed dates and time windows. The guest selects availability in their local time. The host gets notified and can view responses.

### Goals
- Create an availability request without host login.
- Generate a guest link and an admin link.
- Show the guest a calendar/time grid constrained by host-defined rules.
- Store availability and display it to the host in both host and guest timezones.
- Notify the host when a guest submits.

### Non-goals (MVP)
- Host accounts or login.
- Editing submissions after submit.
- Scheduling or calendar booking.
- Advanced conflict resolution or auto-merge.

### Actors
- Host: creates requests, receives notifications, reviews submissions.
- Guest: views request and submits availability.

### Host Flow (No Login)
1. Host visits `/new`.
2. Inputs:
   - Guest name
   - Guest email
   - Allowed date range (host timezone)
   - Allowed time window(s) (host timezone, optional)
   - Host timezone (auto-detected, editable)
3. Submit -> system returns:
   - Guest URL: `/r/<token>`
   - Admin URL: `/r/<token>?admin=<adminToken>`

### Guest Flow
1. Guest opens `/r/<token>`.
2. Guest timezone auto-detected; no manual override.
3. Guest sees a calendar/time grid in guest local time.
4. Guest selects one or more time ranges within allowed windows.
5. Submit -> confirmation.

### Host Review
- Host opens `/r/<token>?admin=<adminToken>`.
- Host sees guest selections in:
  - Host timezone
  - Guest timezone (side-by-side or toggle)

### Timezone Handling (Key Requirements)
- Store all timestamps in UTC.
- Store IANA timezone for host and guest (e.g., `Asia/Dhaka`).
- Host defines allowed date range + time windows in host timezone.
- System converts allowed windows into guest timezone.
- Allowed date range is interpreted in guest local dates after conversion.
- Guest selects in local time; submission is converted to UTC.
- Host view renders in host timezone and guest timezone.

### Data Model (Conceptual)
Request:
- id (unguessable token)
- adminToken (unguessable token)
- guestName
- guestEmail
- hostTimezone (IANA)
- guestTimezone (IANA, detected at submit)
- allowedDateStart (host local date)
- allowedDateEnd (host local date)
- allowedTimeWindows (array of { startTime, endTime } in host local time)
- createdAt (UTC)

Submission:
- requestId
- submittedAt (UTC)
- availability (array of { startUtc, endUtc })
- guestTimezone (IANA)

### API Endpoints (MVP)
- `POST /api/request`
  - Creates a request and returns guest/admin URLs.
- `GET /api/request/:id`
  - Returns sanitized request details for guest view.
- `POST /api/request/:id/submit`
  - Stores availability and triggers notification.
- `GET /api/request/:id/availability?admin=...`
  - Returns guest availability for host view.

### Storage / Platform
- Cloudflare Workers + Durable Objects (one object per request).
- Optional D1 later for reporting or host login.

### Notifications
- Send email to host when guest submits.
- Provider TBD (SendGrid/Postmark/etc).

### Validation Rules
- Date range required; max range limit (e.g., 60 days).
- Time windows must be valid and non-inverted.
- Guest selections must fall within allowed windows after conversion.
- Prevent empty submissions.

### Security
- Unpredictable tokens for guest/admin links.
- No guest email exposed in guest view.
- Basic rate limiting for request creation/submission.

### Open Questions (Deferred)
- Edit submissions after submit.
- Export formats (ICS/CSV).
- Host login and dashboard.

import type { Env, AllowedWindow, RequestData, IndividualRequestData, GroupAvailabilityRequestData, SubmissionData, ConfirmedSlot, GroupBooking, GroupBookingsData, GroupSubmissionsData, GuestSubmission, AggregatedAvailability } from "./types";
import { EMAIL_REGEX, isGroupAvailabilityRequest, isIndividualRequest } from "./types";
import { readJson, jsonResponse, normalizeTimeWindows, validateTimeWindows, isDateString, generateSlots, randomToken, generateICS, generateGroupICS, notifyHost, isValidTimezone, utcToTimezone, timeToMinutes, aggregateAvailability, escapeHtml } from "./utils";
import { sendConfirmationEmail, sendGroupGuestSubmissionNotification } from "./email";

export class AvailabilityRequest {
  private state: DurableObjectState;
  private env: Env;
  private adminConnections: Map<string, WebSocket> = new Map();

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
      const url = new URL(request.url);
      const { pathname } = url;
      const adminToken = url.searchParams.get("admin") ?? "";

      if (pathname === "/request" && request.method === "POST") {
        const body = await readJson<RequestData>(request);
        if (!body) {
          return jsonResponse({ error: "Invalid JSON." }, 400);
        }

        const existing = await this.state.storage.get<RequestData>("request");
        if (existing) {
          return jsonResponse({ error: "Request already exists." }, 409);
        }

        await this.state.storage.put("request", body);
        return jsonResponse({ ok: true });
      }

      if (pathname === "/request" && request.method === "PUT") {
        const data = await this.state.storage.get<RequestData>("request");
        if (!data) {
          return jsonResponse({ error: "Request not found." }, 404);
        }
        if (!adminToken || adminToken !== data.adminToken) {
          return jsonResponse({ error: "Unauthorized." }, 403);
        }
        const body = await readJson<Record<string, unknown>>(request);
        if (!body) {
          return jsonResponse({ error: "Invalid JSON." }, 400);
        }

        // ── Group-availability: edit guest list, date range, time windows ──
        if (data.type === "group-availability") {
          const errors: string[] = [];

          const hostName = escapeHtml(((body.hostName as string | undefined) ?? data.hostName).trim());
          const hostTimezone = ((body.hostTimezone as string | undefined) ?? data.hostTimezone).trim();
          const allowedDateStart = ((body.allowedDateStart as string | undefined) ?? data.allowedDateStart).trim();
          const allowedDateEnd = ((body.allowedDateEnd as string | undefined) ?? data.allowedDateEnd).trim();
          const allowedTimeWindows = normalizeTimeWindows(
            (body.allowedTimeWindows as AllowedWindow[] | undefined) ?? data.allowedTimeWindows
          );
          const guests = (body.guests as import("./types").GuestInfo[] | undefined) ?? data.guests;

          if (!hostName) errors.push("Host name is required.");
          if (!hostTimezone) errors.push("Host timezone is required.");
          if (!isValidTimezone(hostTimezone)) errors.push(`Invalid timezone identifier: ${hostTimezone}`);
          if (!isDateString(allowedDateStart)) errors.push("Valid start date is required.");
          if (!isDateString(allowedDateEnd)) errors.push("Valid end date is required.");
          if (allowedDateStart && allowedDateEnd && allowedDateStart > allowedDateEnd) {
            errors.push("Start date must be on or before end date.");
          }
          if (allowedDateStart && allowedDateEnd) {
            const startMs = Date.parse(allowedDateStart);
            const endMs = Date.parse(allowedDateEnd);
            if (!Number.isNaN(startMs) && !Number.isNaN(endMs)) {
              const diffDays = (endMs - startMs) / (1000 * 60 * 60 * 24);
              if (diffDays > 60) errors.push("Date range cannot exceed 60 days.");
            }
          }
          if (allowedTimeWindows.length > 0 && !validateTimeWindows(allowedTimeWindows)) {
            errors.push("Time windows must be valid and ordered.");
          }

          if (!guests || !Array.isArray(guests)) {
            errors.push("Guest list is required.");
          } else {
            if (guests.length < 3) errors.push("Minimum 3 guests required for group availability requests.");
            if (guests.length > 50) errors.push("Maximum 50 guests allowed per request.");
            const emailSet = new Set<string>();
            for (const guest of guests) {
              if (!guest.name || !guest.name.trim()) {
                errors.push("Each guest must have a name.");
                break;
              }
              const email = (guest.email ?? "").trim().toLowerCase();
              if (!EMAIL_REGEX.test(email)) {
                errors.push(`Invalid email format: ${guest.email}`);
                break;
              }
              if (emailSet.has(email)) {
                errors.push(`Duplicate guest email: ${email}`);
                break;
              }
              emailSet.add(email);
            }
          }

          if (errors.length) {
            return jsonResponse({ error: errors.join(" ") }, 400);
          }

          // Warn if there are existing submissions (but still allow the edit)
          const submissionsData = await this.state.storage.get<GroupSubmissionsData>("group-submissions");
          const hasSubmissions = (submissionsData?.submissions?.length ?? 0) > 0;

          const updated: GroupAvailabilityRequestData = {
            ...data,
            hostName,
            hostTimezone,
            allowedDateStart,
            allowedDateEnd,
            allowedTimeWindows,
            guests: guests.map((g) => ({
              ...g,
              name: escapeHtml(g.name.trim()),
            })),
          };

          await this.state.storage.put("request", updated);

          // Invalidate aggregation cache since request details changed
          await this.state.storage.delete("aggregated-cache");
          await this.state.storage.delete("cache-timestamp");

          return jsonResponse({ ok: true, warning: hasSubmissions ? "Existing submissions may be invalidated by this change." : undefined });
        }

        // ── Legacy individual / group-event update ──
        if (isIndividualRequest(data)) {
          const updated: IndividualRequestData = {
            ...data,
            hostName: ((body.hostName as string | undefined) ?? data.hostName ?? "").trim(),
            guestName: ((body.guestName as string | undefined) ?? data.guestName ?? "").trim(),
            guestEmail: ((body.guestEmail as string | undefined) ?? data.guestEmail ?? "").trim(),
            hostTimezone: ((body.hostTimezone as string | undefined) ?? data.hostTimezone).trim(),
            allowedDateStart: ((body.allowedDateStart as string | undefined) ?? data.allowedDateStart).trim(),
            allowedDateEnd: ((body.allowedDateEnd as string | undefined) ?? data.allowedDateEnd).trim(),
            allowedTimeWindows: normalizeTimeWindows(
              (body.allowedTimeWindows as AllowedWindow[] | undefined) ?? data.allowedTimeWindows
            ),
          };

          const errors: string[] = [];
          if (!updated.hostName) errors.push("Your name is required.");
          if (!updated.guestName) errors.push("Guest name is required.");
          if (!updated.guestEmail) errors.push("Guest email is required.");
          if (!updated.hostTimezone) errors.push("Host timezone is required.");
          if (!isDateString(updated.allowedDateStart)) errors.push("Valid start date is required.");
          if (!isDateString(updated.allowedDateEnd)) errors.push("Valid end date is required.");
          if (updated.allowedDateStart && updated.allowedDateEnd && updated.allowedDateStart > updated.allowedDateEnd) {
            errors.push("Start date must be on or before end date.");
          }
          if (!validateTimeWindows(updated.allowedTimeWindows)) {
            errors.push("Time windows must be valid and ordered.");
          }
          if (errors.length) {
            return jsonResponse({ error: errors.join(" ") }, 400);
          }

          await this.state.storage.put("request", updated);
          return jsonResponse({ ok: true });
        }

        return jsonResponse({ error: "Unsupported request type for update." }, 400);
      }

      if (pathname === "/request" && request.method === "DELETE") {
        const data = await this.state.storage.get<RequestData>("request");
        if (!data) {
          return jsonResponse({ error: "Request not found." }, 404);
        }
        if (!adminToken || adminToken !== data.adminToken) {
          return jsonResponse({ error: "Unauthorized." }, 403);
        }

        // Prevent deletion of confirmed requests
        if (isGroupAvailabilityRequest(data) && data.confirmed) {
          return jsonResponse({ error: "Cannot delete: request has been confirmed." }, 409);
        }
        if (!isGroupAvailabilityRequest(data)) {
          const confirmedSlot = await this.state.storage.get<ConfirmedSlot>("confirmed");
          if (confirmedSlot) {
            return jsonResponse({ error: "Cannot delete: request has been confirmed." }, 409);
          }
        }

        // For group-availability, delete all group-specific storage keys explicitly
        if (data.type === "group-availability") {
          await this.state.storage.delete("group-submissions");
          await this.state.storage.delete("aggregated-cache");
          await this.state.storage.delete("cache-timestamp");
          await this.state.storage.delete("confirmed");
          await this.state.storage.delete("request");
          return jsonResponse({ ok: true });
        }

        await this.state.storage.deleteAll();
        return jsonResponse({ ok: true });
      }

      if (pathname === "/request" && request.method === "GET") {
        const data = await this.state.storage.get<RequestData>("request");
        if (!data) {
          return jsonResponse({ error: "Request not found." }, 404);
        }

        // Check for guest token parameter
        const guestToken = url.searchParams.get("guest") ?? "";

        // If guest token is provided and this is a group-availability request, return guest-specific view
        if (guestToken && isGroupAvailabilityRequest(data)) {
          const guest = data.guests.find((g) => g.token === guestToken);
          if (!guest) {
            return jsonResponse({ error: "Invalid guest token." }, 403);
          }

          // Get guest's existing submission if any
          const submissionsData = await this.state.storage.get<GroupSubmissionsData>("group-submissions");
          const existingSubmission = submissionsData?.submissions?.find((s) => s.guestToken === guestToken);

          return jsonResponse({
            requestId: data.id,
            guestName: guest.name,
            hostName: data.hostName,
            hostTimezone: data.hostTimezone,
            allowedDateStart: data.allowedDateStart,
            allowedDateEnd: data.allowedDateEnd,
            allowedTimeWindows: data.allowedTimeWindows,
            hasSubmitted: Boolean(existingSubmission),
            existingSubmission: existingSubmission ? {
              availability: existingSubmission.availability,
              guestTimezone: existingSubmission.guestTimezone,
              submittedAt: existingSubmission.submittedAt,
              updatedAt: existingSubmission.updatedAt,
            } : undefined,
          });
        }

        // Default behavior: admin view or legacy individual request view
        const submission = await this.state.storage.get<SubmissionData>("submission");
        const confirmed = await this.state.storage.get<ConfirmedSlot>("confirmed");
        const isAdmin = adminToken && adminToken === data.adminToken;
        return jsonResponse({
          id: data.id,
          hostName: data.hostName,
          guestName: isIndividualRequest(data) ? data.guestName : undefined,
          guestEmail: isAdmin && isIndividualRequest(data) ? data.guestEmail : undefined,
          hostTimezone: data.hostTimezone,
          allowedDateStart: data.allowedDateStart,
          allowedDateEnd: data.allowedDateEnd,
          allowedTimeWindows: data.allowedTimeWindows,
          createdAt: data.createdAt,
          hasSubmission: Boolean(submission),
          isAdmin,
          confirmedSlot: confirmed ?? null,
          confirmed: isGroupAvailabilityRequest(data) ? data.confirmed : undefined,
        });
      }

      if (pathname === "/submission" && request.method === "GET") {
        const data = await this.state.storage.get<RequestData>("request");
        if (!data) {
          return jsonResponse({ error: "Request not found." }, 404);
        }
        if (!adminToken || adminToken !== data.adminToken) {
          return jsonResponse({ error: "Unauthorized." }, 403);
        }
        const submission = await this.state.storage.get<SubmissionData>("submission");
        if (!submission) {
          return jsonResponse({ error: "No submission yet." }, 404);
        }
        return jsonResponse(submission);
      }

      if (pathname === "/export.ics" && request.method === "GET") {
        const data = await this.state.storage.get<RequestData>("request");
        if (!data) {
          return jsonResponse({ error: "Request not found." }, 404);
        }
        if (!adminToken || adminToken !== data.adminToken) {
          return jsonResponse({ error: "Unauthorized." }, 403);
        }

        // Group-availability: export all guest submissions + confirmed slot
        if (data.type === "group-availability") {
          const submissionsData = await this.state.storage.get<GroupSubmissionsData>("group-submissions");
          if (!submissionsData || submissionsData.submissions.length === 0) {
            return jsonResponse({ error: "No submissions yet." }, 404);
          }
          const confirmedSlot = await this.state.storage.get<ConfirmedSlot>("confirmed") ?? null;
          const ics = generateGroupICS(data, submissionsData, confirmedSlot);
          const filename = `group-availability-${data.id}.ics`;
          return new Response(ics, {
            headers: {
              "Content-Type": "text/calendar; charset=utf-8",
              "Content-Disposition": `attachment; filename="${filename}"`,
            },
          });
        }

        // Individual / group-event: existing behaviour
        if (!isIndividualRequest(data)) {
          return jsonResponse({ error: "Export not supported for this request type." }, 400);
        }
        const submission = await this.state.storage.get<SubmissionData>("submission");
        if (!submission) {
          return jsonResponse({ error: "No submission yet." }, 404);
        }
        const ics = generateICS(data, submission);
        return new Response(ics, {
          headers: {
            "Content-Type": "text/calendar; charset=utf-8",
            "Content-Disposition": `attachment; filename="availability-${data.guestName.replace(/[^a-z0-9]/gi, "-")}.ics"`,
          },
        });
      }

      if (pathname === "/confirm" && request.method === "POST") {
        const data = await this.state.storage.get<RequestData>("request");
        if (!data) {
          return jsonResponse({ error: "Request not found." }, 404);
        }
        if (!adminToken || adminToken !== data.adminToken) {
          return jsonResponse({ error: "Unauthorized." }, 403);
        }
        const body = await readJson<{
          startUtc?: string;
          endUtc?: string;
          title?: string;
          description?: string;
          location?: string;
        }>(request);
        if (!body) {
          return jsonResponse({ error: "Invalid JSON." }, 400);
        }
        if (!body.startUtc || !body.endUtc) {
          return jsonResponse({ error: "Start and end times are required." }, 400);
        }
        const start = Date.parse(body.startUtc);
        const end = Date.parse(body.endUtc);
        if (Number.isNaN(start) || Number.isNaN(end) || end <= start) {
          return jsonResponse({ error: "Start and end must be valid UTC times." }, 400);
        }

        // Handle group-availability requests
        if (data.type === "group-availability") {
          // Validate title is required for group-availability
          const title = (body.title ?? "").trim();
          if (!title) {
            return jsonResponse({ error: "Meeting title is required for confirmation." }, 400);
          }

          // Reject if already confirmed
          if (data.confirmed) {
            return jsonResponse({ error: "Cannot confirm: request has already been confirmed." }, 409);
          }

          // Validate confirmed slot overlaps with at least one guest's availability
          const submissionsData = await this.state.storage.get<GroupSubmissionsData>("group-submissions");
          const submissions = submissionsData?.submissions ?? [];

          if (submissions.length === 0) {
            return jsonResponse({ error: "Cannot confirm: no guest submissions yet." }, 400);
          }

          // Check if the confirmed slot overlaps with at least one guest's availability
          const hasOverlap = submissions.some((sub) => {
            return sub.availability.some((range) => {
              const rangeStart = Date.parse(range.startUtc);
              const rangeEnd = Date.parse(range.endUtc);
              // Check if [start, end] overlaps with [rangeStart, rangeEnd]
              return rangeStart <= start && end <= rangeEnd;
            });
          });

          if (!hasOverlap) {
            return jsonResponse({ error: "Cannot confirm: selected time does not overlap with any guest availability." }, 400);
          }

          // Store confirmed slot
          const confirmed: ConfirmedSlot = {
            startUtc: body.startUtc,
            endUtc: body.endUtc,
            title: escapeHtml(title),
            description: escapeHtml((body.description ?? "").trim()),
            location: escapeHtml((body.location ?? "").trim()),
            confirmedAt: new Date().toISOString(),
          };
          await this.state.storage.put("confirmed", confirmed);

          // Mark request as confirmed
          const updatedData: GroupAvailabilityRequestData = {
            ...data,
            confirmed: true,
          };
          await this.state.storage.put("request", updatedData);

          // Send confirmation emails to all guests (if enabled)
          if (this.env.EMAIL_CONFIRM_ENABLED === 'true') {
            for (const guest of data.guests) {
              const guestSubmission = submissions.find((s) => s.guestToken === guest.token);
              const guestTimezone = guestSubmission?.guestTimezone || 'UTC';
              
              sendConfirmationEmail(this.env, {
                requestId: data.id,
                guestName: guest.name,
                guestEmail: guest.email,
                hostName: data.hostName,
                guestTimezone,
                confirmed,
              }).catch(() => undefined);
            }
          }

          // Broadcast WebSocket notification
          this.broadcastToAdmins({
            type: "confirmation",
            startUtc: confirmed.startUtc,
            endUtc: confirmed.endUtc,
            title: confirmed.title,
          });

          return jsonResponse({ ok: true });
        }

        // Handle individual requests (legacy behavior)
        if (!isIndividualRequest(data)) {
          return jsonResponse({ error: "Invalid request type for confirmation." }, 400);
        }
        
        const title = (body.title ?? "").trim();
        const defaultTitle = `Meeting: ${data.hostName} + ${data.guestName}`;
        const confirmed: ConfirmedSlot = {
          startUtc: body.startUtc,
          endUtc: body.endUtc,
          title: title || defaultTitle,
          description: (body.description ?? "").trim(),
          location: (body.location ?? "").trim(),
          confirmedAt: new Date().toISOString(),
        };
        await this.state.storage.put("confirmed", confirmed);

        // Send confirmation email with .ics to guest (non-blocking, if enabled)
        if (this.env.EMAIL_CONFIRM_ENABLED === 'true') {
          const submission = await this.state.storage.get<SubmissionData>('submission');
          sendConfirmationEmail(this.env, {
            requestId: data.id,
            guestName: data.guestName,
            guestEmail: data.guestEmail,
            hostName: data.hostName,
            guestTimezone: submission?.guestTimezone || 'UTC',
            confirmed,
          }).catch(() => undefined);
        }

        return jsonResponse({ ok: true });
      }

      if (pathname === "/submit" && request.method === "POST") {
        const data = await this.state.storage.get<RequestData>("request");
        if (!data) {
          return jsonResponse({ error: "Request not found." }, 404);
        }
        const body = await readJson<SubmissionData>(request);
        if (!body) {
          return jsonResponse({ error: "Invalid JSON." }, 400);
        }
        const existing = await this.state.storage.get<SubmissionData>("submission");
        const now = new Date().toISOString();
        const payload: SubmissionData = {
          availability: body.availability,
          guestTimezone: body.guestTimezone,
          submittedAt: existing?.submittedAt ?? now,
          updatedAt: existing ? now : undefined,
        };
        await this.state.storage.put("submission", payload);
        this.broadcastToAdmins({
          type: "submission",
          action: existing ? "updated" : "new",
          guestName: isIndividualRequest(data) ? data.guestName : undefined,
          submittedAt: payload.submittedAt,
        });
        if (isIndividualRequest(data)) {
          await notifyHost(this.env, data, payload).catch(() => undefined);
        }
        return jsonResponse({ ok: true });
      }

      // ── Group event: GET /slots ──
      if (pathname === "/slots" && request.method === "GET") {
        const data = await this.state.storage.get<RequestData>("request");
        if (!data || data.type !== "group") {
          return jsonResponse({ error: "Group request not found." }, 404);
        }
        const bookingsData = await this.state.storage.get<GroupBookingsData>("bookings");
        const bookings = bookingsData?.bookings ?? [];
        const slots = generateSlots(data);
        const bookedStarts = new Set(bookings.map((b) => b.slotStartUtc));

        const isAdmin = adminToken && adminToken === data.adminToken;
        return jsonResponse({
          request: {
            id: data.id,
            eventTitle: data.eventTitle,
            hostName: data.hostName,
            hostTimezone: data.hostTimezone,
            allowedDateStart: data.allowedDateStart,
            allowedDateEnd: data.allowedDateEnd,
            allowedTimeWindows: data.allowedTimeWindows,
            slotDurationMinutes: data.slotDurationMinutes,
            bufferMinutes: data.bufferMinutes,
            createdAt: data.createdAt,
            isAdmin,
          },
          slots: slots.map((s) => ({
            startUtc: s.startUtc,
            endUtc: s.endUtc,
            booked: bookedStarts.has(s.startUtc),
            bookedBy: isAdmin
              ? bookings.find((b) => b.slotStartUtc === s.startUtc)?.guestName ?? null
              : null,
          })),
          totalSlots: slots.length,
          bookedCount: bookings.length,
        });
      }

      // ── Group event: POST /book ──
      if (pathname === "/book" && request.method === "POST") {
        const data = await this.state.storage.get<RequestData>("request");
        if (!data || data.type !== "group") {
          return jsonResponse({ error: "Group request not found." }, 404);
        }
        const body = await readJson<{
          slotStartUtc?: string;
          slotEndUtc?: string;
          guestName?: string;
          guestEmail?: string;
          guestTimezone?: string;
        }>(request);
        if (!body) {
          return jsonResponse({ error: "Invalid JSON." }, 400);
        }

        const guestName = (body.guestName ?? "").trim();
        const guestEmail = (body.guestEmail ?? "").trim().toLowerCase();
        const guestTimezone = (body.guestTimezone ?? "").trim();
        const slotStartUtc = (body.slotStartUtc ?? "").trim();
        const slotEndUtc = (body.slotEndUtc ?? "").trim();

        if (!guestName || !guestEmail || !guestTimezone || !slotStartUtc || !slotEndUtc) {
          return jsonResponse({ error: "All fields are required." }, 400);
        }

        // Validate slot exists in generated slots
        const slots = generateSlots(data);
        const slotExists = slots.some((s) => s.startUtc === slotStartUtc && s.endUtc === slotEndUtc);
        if (!slotExists) {
          return jsonResponse({ error: "Invalid slot." }, 400);
        }

        const bookingsData = await this.state.storage.get<GroupBookingsData>("bookings");
        const bookings = bookingsData?.bookings ?? [];

        // Check if email already has a booking
        const existingBooking = bookings.find((b) => b.guestEmail === guestEmail);
        if (existingBooking) {
          return jsonResponse({
            error: "You already have a booking.",
            existingBooking: {
              slotStartUtc: existingBooking.slotStartUtc,
              slotEndUtc: existingBooking.slotEndUtc,
              guestName: existingBooking.guestName,
            },
          }, 409);
        }

        // Check if slot is already booked
        const slotTaken = bookings.some((b) => b.slotStartUtc === slotStartUtc);
        if (slotTaken) {
          return jsonResponse({ error: "This slot was just booked by someone else." }, 409);
        }

        const booking: GroupBooking = {
          slotStartUtc,
          slotEndUtc,
          guestName,
          guestEmail,
          guestTimezone,
          bookedAt: new Date().toISOString(),
        };
        bookings.push(booking);
        await this.state.storage.put("bookings", { bookings });

        this.broadcastToAdmins({
          type: "booking",
          action: "new",
          guestName,
          guestEmail,
          slotStartUtc,
          slotEndUtc,
        });

        return jsonResponse({ ok: true, booking });
      }

      // ── Group event: DELETE /book (admin cancel) ──
      if (pathname === "/book" && request.method === "DELETE") {
        const data = await this.state.storage.get<RequestData>("request");
        if (!data || data.type !== "group") {
          return jsonResponse({ error: "Group request not found." }, 404);
        }
        if (!adminToken || adminToken !== data.adminToken) {
          return jsonResponse({ error: "Unauthorized." }, 403);
        }

        const body = await readJson<{ slotStartUtc?: string }>(request);
        if (!body || !body.slotStartUtc) {
          return jsonResponse({ error: "slotStartUtc is required." }, 400);
        }

        const bookingsData = await this.state.storage.get<GroupBookingsData>("bookings");
        const bookings = bookingsData?.bookings ?? [];
        const index = bookings.findIndex((b) => b.slotStartUtc === body.slotStartUtc);
        if (index === -1) {
          return jsonResponse({ error: "Booking not found." }, 404);
        }

        const cancelled = bookings.splice(index, 1)[0];
        await this.state.storage.put("bookings", { bookings });

        this.broadcastToAdmins({
          type: "booking",
          action: "cancelled",
          guestName: cancelled.guestName,
          guestEmail: cancelled.guestEmail,
          slotStartUtc: cancelled.slotStartUtc,
        });

        return jsonResponse({ ok: true });
      }

      // ── Group event: GET /bookings (admin only) ──
      if (pathname === "/bookings" && request.method === "GET") {
        const data = await this.state.storage.get<RequestData>("request");
        if (!data || data.type !== "group") {
          return jsonResponse({ error: "Group request not found." }, 404);
        }
        if (!adminToken || adminToken !== data.adminToken) {
          return jsonResponse({ error: "Unauthorized." }, 403);
        }
        const bookingsData = await this.state.storage.get<GroupBookingsData>("bookings");
        return jsonResponse({ bookings: bookingsData?.bookings ?? [] });
      }

      // WebSocket connection for admin real-time notifications
      if (pathname === "/ws" && request.method === "GET") {
        const data = await this.state.storage.get<RequestData>("request");
        if (!data) {
          return jsonResponse({ error: "Request not found." }, 404);
        }
        if (!adminToken || adminToken !== data.adminToken) {
          return jsonResponse({ error: "Unauthorized." }, 403);
        }

        const pair = new WebSocketPair();
        const [client, server] = Object.values(pair);
        server.accept();

        const sessionId = randomToken(8);
        this.adminConnections.set(sessionId, server);

        server.addEventListener("close", () => this.adminConnections.delete(sessionId));
        server.addEventListener("error", () => this.adminConnections.delete(sessionId));

        return new Response(null, { status: 101, webSocket: client });
      }

      // ── Group availability: GET /guest (guest-specific view) ──
      if (pathname === "/guest" && request.method === "GET") {
        const guestToken = url.searchParams.get("guest") ?? "";

        const data = await this.state.storage.get<RequestData>("request");
        if (!data || data.type !== "group-availability") {
          return jsonResponse({ error: "Group availability request not found." }, 404);
        }

        // Validate guest token
        if (!guestToken) {
          return jsonResponse({ error: "Guest token is required." }, 400);
        }

        const guest = data.guests?.find((g) => g.token === guestToken);
        if (!guest) {
          return jsonResponse({ error: "Invalid guest token." }, 403);
        }

        // Get guest's existing submission if any
        const submissionsData = await this.state.storage.get<GroupSubmissionsData>("group-submissions");
        const existingSubmission = submissionsData?.submissions?.find((s) => s.guestToken === guestToken);

        return jsonResponse({
          requestId: data.id,
          guestName: guest.name,
          hostName: data.hostName,
          hostTimezone: data.hostTimezone,
          allowedDateStart: data.allowedDateStart,
          allowedDateEnd: data.allowedDateEnd,
          allowedTimeWindows: data.allowedTimeWindows,
          hasSubmitted: Boolean(existingSubmission),
          existingSubmission: existingSubmission ? {
            availability: existingSubmission.availability,
            guestTimezone: existingSubmission.guestTimezone,
            submittedAt: existingSubmission.submittedAt,
            updatedAt: existingSubmission.updatedAt,
          } : undefined,
        });
      }

      // ── Group availability: POST /guest-submit (guest submits availability) ──
      // Concurrency safety: Durable Objects process requests sequentially (single-threaded),
      // so the read-modify-write on "group-submissions" is inherently atomic.
      // Multiple guests submitting simultaneously are queued by the DO runtime.
      if (pathname === "/guest-submit" && request.method === "POST") {
        const guestToken = url.searchParams.get("guest") ?? "";

        const data = await this.state.storage.get<RequestData>("request");
        if (!data || data.type !== "group-availability") {
          return jsonResponse({ error: "Group availability request not found." }, 404);
        }

        // Validate guest token
        if (!guestToken) {
          return jsonResponse({ error: "Guest token is required." }, 400);
        }

        const guest = data.guests?.find((g) => g.token === guestToken);
        if (!guest) {
          return jsonResponse({ error: "Invalid guest token." }, 403);
        }

        // Check if request is already confirmed
        if (data.confirmed) {
          return jsonResponse({ error: "Cannot submit: request has been confirmed." }, 409);
        }

        // Parse request body
        const body = await readJson<{
          availability?: { startUtc: string; endUtc: string }[];
          guestTimezone?: string;
        }>(request);

        if (!body) {
          return jsonResponse({ error: "Invalid JSON." }, 400);
        }

        const { availability, guestTimezone } = body;

        // Validate required fields
        if (!availability || !Array.isArray(availability)) {
          return jsonResponse({ error: "Availability array is required." }, 400);
        }

        if (!guestTimezone || typeof guestTimezone !== "string") {
          return jsonResponse({ error: "Guest timezone is required." }, 400);
        }

        // Reject empty submissions
        if (availability.length === 0) {
          return jsonResponse({ error: "Availability cannot be empty." }, 400);
        }

        // Validate timezone
        if (!isValidTimezone(guestTimezone)) {
          return jsonResponse({ error: `Invalid timezone identifier: ${guestTimezone}` }, 400);
        }

        // Validate availability ranges are non-overlapping
        const sortedRanges = [...availability].sort((a, b) => 
          Date.parse(a.startUtc) - Date.parse(b.startUtc)
        );

        for (let i = 0; i < sortedRanges.length; i++) {
          const range = sortedRanges[i];
          const startMs = Date.parse(range.startUtc);
          const endMs = Date.parse(range.endUtc);

          // Validate UTC timestamps
          if (Number.isNaN(startMs) || Number.isNaN(endMs)) {
            return jsonResponse({ error: "Invalid UTC timestamp format." }, 400);
          }

          // Validate start < end
          if (startMs >= endMs) {
            return jsonResponse({ error: "Start time must be before end time." }, 400);
          }

          // Check for overlaps with subsequent ranges
          if (i < sortedRanges.length - 1) {
            const nextRange = sortedRanges[i + 1];
            const nextStartMs = Date.parse(nextRange.startUtc);

            if (endMs > nextStartMs) {
              return jsonResponse({ error: "Availability ranges must not overlap." }, 400);
            }
          }
        }

        // Validate ranges fall within allowed windows (after timezone conversion)
        const allowedWindows = data.allowedTimeWindows.length > 0 
          ? data.allowedTimeWindows 
          : [{ startTime: "00:00", endTime: "23:59" }];

        for (const range of availability) {
          // Convert to host timezone to check against allowed windows
          const startInHostTz = utcToTimezone(range.startUtc, data.hostTimezone);
          const endInHostTz = utcToTimezone(range.endUtc, data.hostTimezone);

          // Check if the date is within allowed date range
          if (startInHostTz.date < data.allowedDateStart || startInHostTz.date > data.allowedDateEnd) {
            return jsonResponse({ 
              error: `Availability must fall within allowed date range (${data.allowedDateStart} to ${data.allowedDateEnd}).` 
            }, 400);
          }

          // Check if the time falls within at least one allowed window
          const startTimeMinutes = timeToMinutes(startInHostTz.time);
          const endTimeMinutes = timeToMinutes(endInHostTz.time);

          let withinWindow = false;
          for (const window of allowedWindows) {
            const windowStartMinutes = timeToMinutes(window.startTime);
            const windowEndMinutes = timeToMinutes(window.endTime);

            // Check if the entire range falls within this window
            if (startTimeMinutes >= windowStartMinutes && endTimeMinutes <= windowEndMinutes) {
              withinWindow = true;
              break;
            }
          }

          if (!withinWindow) {
            return jsonResponse({ 
              error: "Availability must fall within allowed time windows." 
            }, 400);
          }
        }

        // Get existing submissions
        const submissionsData = await this.state.storage.get<GroupSubmissionsData>("group-submissions");
        const submissions = submissionsData?.submissions ?? [];

        // Check if guest has already submitted
        const existingIndex = submissions.findIndex((s) => s.guestToken === guestToken);
        const now = new Date().toISOString();

        const newSubmission: GuestSubmission = {
          guestToken,
          availability,
          guestTimezone,
          submittedAt: existingIndex >= 0 ? submissions[existingIndex].submittedAt : now,
          updatedAt: existingIndex >= 0 ? now : undefined,
        };

        // Update or add submission
        if (existingIndex >= 0) {
          submissions[existingIndex] = newSubmission;
        } else {
          submissions.push(newSubmission);
        }

        // Store updated submissions
        await this.state.storage.put("group-submissions", { submissions });

        // Invalidate aggregation cache
        await this.state.storage.delete("aggregated-cache");
        await this.state.storage.delete("cache-timestamp");

        // Broadcast WebSocket notification to admin clients
        this.broadcastToAdmins({
          type: "guest-submission",
          action: existingIndex >= 0 ? "updated" : "new",
          guestName: guest.name,
          guestToken,
          submittedAt: newSubmission.submittedAt,
        });

        // Send host notification email (if enabled and host email is set)
        if (this.env.EMAIL_CONFIRM_ENABLED === 'true' && data.hostEmail) {
          const origin = new URL(request.url).origin;
          sendGroupGuestSubmissionNotification(this.env, {
            requestId: data.id,
            hostName: data.hostName,
            hostEmail: data.hostEmail,
            guestName: guest.name,
            adminUrl: `${origin}/ga/${data.id}?admin=${data.adminToken}`,
            submittedAt: newSubmission.submittedAt,
            isUpdate: existingIndex >= 0,
          }).catch(() => undefined);
        }

        return jsonResponse({ ok: true });
      }

      // ── Group availability: GET /aggregated (admin view of aggregated availability) ──
      if (pathname === "/aggregated" && request.method === "GET") {
        const data = await this.state.storage.get<RequestData>("request");
        if (!data || data.type !== "group-availability") {
          return jsonResponse({ error: "Group availability request not found." }, 404);
        }

        // Validate admin token
        if (!adminToken || adminToken !== data.adminToken) {
          return jsonResponse({ error: "Unauthorized." }, 403);
        }

        // Get optional minParticipation query parameter
        const minParticipationParam = url.searchParams.get("minParticipation");
        const minParticipation = minParticipationParam ? parseInt(minParticipationParam, 10) : undefined;

        // Check cache validity
        const cacheTimestamp = await this.state.storage.get<string>("cache-timestamp");
        const cachedAggregated = await this.state.storage.get<AggregatedAvailability>("aggregated-cache");

        let aggregated: AggregatedAvailability;

        // If cache is valid, use it
        if (cacheTimestamp && cachedAggregated) {
          aggregated = cachedAggregated;
        } else {
          // Cache invalid or missing, recompute
          const submissionsData = await this.state.storage.get<GroupSubmissionsData>("group-submissions");
          const submissions = submissionsData?.submissions ?? [];


          aggregated = aggregateAvailability(submissions);

          // Cache the result
          await this.state.storage.put("aggregated-cache", aggregated);
          await this.state.storage.put("cache-timestamp", new Date().toISOString());
        }

        // Filter by minParticipation if provided
        let filteredSlots = aggregated.slots;
        if (minParticipation !== undefined && !Number.isNaN(minParticipation)) {
          filteredSlots = aggregated.slots.filter((slot) => slot.participantCount >= minParticipation);
        }

        // Build guest submission status
        const guests = data.guests ?? [];
        const submissionsData = await this.state.storage.get<GroupSubmissionsData>("group-submissions");
        const submissions = submissionsData?.submissions ?? [];

        const guestStatus = guests.map((guest) => {
          const submission = submissions.find((s) => s.guestToken === guest.token);
          return {
            token: guest.token,
            name: guest.name,
            email: guest.email,
            status: submission ? "submitted" : "pending",
            submittedAt: submission?.submittedAt,
            updatedAt: submission?.updatedAt,
          };
        });

        return jsonResponse({
          slots: filteredSlots,
          totalGuests: aggregated.totalGuests,
          submittedCount: aggregated.submittedCount,
          maxParticipation: aggregated.maxParticipation,
          guestStatus,
        });
      }

      return jsonResponse({ error: "Not found." }, 404);
    }

  private broadcastToAdmins(message: unknown) {
    const payload = JSON.stringify(message);
    for (const [sessionId, ws] of this.adminConnections) {
      try {
        ws.send(payload);
      } catch {
        this.adminConnections.delete(sessionId);
      }
    }
  }
}

import type { Env, AllowedWindow, RequestData, SubmissionData, ConfirmedSlot, GroupBooking, GroupBookingsData } from "./types";
import { readJson, jsonResponse, normalizeTimeWindows, validateTimeWindows, isDateString, generateSlots, randomToken, generateICS, notifyHost } from "./utils";
import { sendConfirmationEmail } from "./email";

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
      const body = await readJson<Partial<RequestData>>(request);
      if (!body) {
        return jsonResponse({ error: "Invalid JSON." }, 400);
      }

      const updated: RequestData = {
        ...data,
        hostName: (body.hostName ?? data.hostName).trim(),
        guestName: (body.guestName ?? data.guestName).trim(),
        guestEmail: (body.guestEmail ?? data.guestEmail).trim(),
        hostTimezone: (body.hostTimezone ?? data.hostTimezone).trim(),
        allowedDateStart: (body.allowedDateStart ?? data.allowedDateStart).trim(),
        allowedDateEnd: (body.allowedDateEnd ?? data.allowedDateEnd).trim(),
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

    if (pathname === "/request" && request.method === "DELETE") {
      const data = await this.state.storage.get<RequestData>("request");
      if (!data) {
        return jsonResponse({ error: "Request not found." }, 404);
      }
      if (!adminToken || adminToken !== data.adminToken) {
        return jsonResponse({ error: "Unauthorized." }, 403);
      }
      await this.state.storage.deleteAll();
      return jsonResponse({ ok: true });
    }

    if (pathname === "/request" && request.method === "GET") {
      const data = await this.state.storage.get<RequestData>("request");
      if (!data) {
        return jsonResponse({ error: "Request not found." }, 404);
      }
      const submission = await this.state.storage.get<SubmissionData>("submission");
      const confirmed = await this.state.storage.get<ConfirmedSlot>("confirmed");
      const isAdmin = adminToken && adminToken === data.adminToken;
      return jsonResponse({
        id: data.id,
        hostName: data.hostName,
        guestName: data.guestName,
        guestEmail: isAdmin ? data.guestEmail : undefined,
        hostTimezone: data.hostTimezone,
        allowedDateStart: data.allowedDateStart,
        allowedDateEnd: data.allowedDateEnd,
        allowedTimeWindows: data.allowedTimeWindows,
        createdAt: data.createdAt,
        hasSubmission: Boolean(submission),
        isAdmin,
        confirmedSlot: confirmed ?? null,
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
      const title = (body.title ?? "").trim() || `Meeting: ${data.hostName} + ${data.guestName}`;
      const confirmed: ConfirmedSlot = {
        startUtc: body.startUtc,
        endUtc: body.endUtc,
        title,
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
        guestName: data.guestName,
        submittedAt: payload.submittedAt,
      });
      await notifyHost(this.env, data, payload).catch(() => undefined);
      return jsonResponse({ ok: true });
    }

    // ── Group booking: GET /slots ──
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

    // ── Group booking: POST /book ──
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

    // ── Group booking: DELETE /book (admin cancel) ──
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

    // ── Group booking: GET /bookings (admin only) ──
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

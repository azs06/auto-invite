import type { Env, AllowedWindow, RequestData, SubmissionData, GuestInfo } from "./types";
import { readJson, jsonResponse, normalizeTimeWindows, validateTimeWindows, isDateString, randomToken, proxyToDurableObject, escapeHtml, isValidTimezone } from "./utils";
import { sendInviteEmail } from "./email";

export async function handleCreateRequest(request: Request, env: Env, origin: string) {
  const body = await readJson<{
    type?: "individual" | "group";
    hostName?: string;
    guestName?: string;
    guestEmail?: string;
    hostTimezone?: string;
    allowedDateStart?: string;
    allowedDateEnd?: string;
    allowedTimeWindows?: AllowedWindow[];
    eventTitle?: string;
    slotDurationMinutes?: number;
    bufferMinutes?: number;
  }>(request);

  if (!body) {
    return jsonResponse({ error: "Invalid JSON." }, 400);
  }

  const requestType = body.type ?? "individual";
  const isGroup = requestType === "group";

  const hostName = (body.hostName ?? "").trim();
  const guestName = isGroup ? "" : (body.guestName ?? "").trim();
  const guestEmail = isGroup ? "" : (body.guestEmail ?? "").trim();
  const hostTimezone = (body.hostTimezone ?? "").trim();
  const allowedDateStart = (body.allowedDateStart ?? "").trim();
  const allowedDateEnd = (body.allowedDateEnd ?? "").trim();
  const allowedTimeWindows = normalizeTimeWindows(body.allowedTimeWindows ?? []);

  const errors: string[] = [];
  if (!hostName) errors.push("Your name is required.");
  if (!isGroup) {
    if (!guestName) errors.push("Guest name is required.");
    if (!guestEmail) errors.push("Guest email is required.");
  }
  if (!hostTimezone) errors.push("Host timezone is required.");
  if (!isDateString(allowedDateStart)) errors.push("Valid start date is required.");
  if (!isDateString(allowedDateEnd)) errors.push("Valid end date is required.");
  if (allowedDateStart && allowedDateEnd && allowedDateStart > allowedDateEnd) {
    errors.push("Start date must be on or before end date.");
  }

  if (!validateTimeWindows(allowedTimeWindows)) {
    errors.push("Time windows must be valid and ordered.");
  }

  if (isGroup) {
    const eventTitle = (body.eventTitle ?? "").trim();
    if (!eventTitle) errors.push("Event title is required.");
    const slotDuration = body.slotDurationMinutes ?? 0;
    if (![30, 45, 60, 90, 120].includes(slotDuration)) {
      errors.push("Slot duration must be 30, 45, 60, 90, or 120 minutes.");
    }
    const buffer = body.bufferMinutes ?? 0;
    if (![0, 5, 10, 15].includes(buffer)) {
      errors.push("Buffer must be 0, 5, 10, or 15 minutes.");
    }
  }

  if (errors.length) {
    return jsonResponse({ error: errors.join(" ") }, 400);
  }

  const id = randomToken();
  const adminToken = randomToken(24);
  const requestData: RequestData = {
    id,
    adminToken,
    hostName,
    guestName,
    guestEmail,
    hostTimezone,
    allowedDateStart,
    allowedDateEnd,
    allowedTimeWindows,
    createdAt: new Date().toISOString(),
    type: requestType,
    ...(isGroup && {
      eventTitle: (body.eventTitle ?? "").trim(),
      slotDurationMinutes: body.slotDurationMinutes,
      bufferMinutes: body.bufferMinutes ?? 0,
    }),
  };

  const stub = env.AVAILABILITY.get(env.AVAILABILITY.idFromName(id));
  const response = await stub.fetch("https://do/request", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(requestData),
  });

  if (!response.ok) {
    return response;
  }

  if (isGroup) {
    return jsonResponse({
      requestId: id,
      guestUrl: `${origin}/g/${id}`,
      adminUrl: `${origin}/g/${id}?admin=${adminToken}`,
    });
  }

  // Send invite email to guest (non-blocking, if enabled)
  if (env.EMAIL_INVITE_ENABLED === 'true') {
    sendInviteEmail(env, {
      hostName,
      guestName,
      guestEmail,
      dateStart: allowedDateStart,
      dateEnd: allowedDateEnd,
      hostTimezone,
      guestUrl: `${origin}/r/${id}`,
    }).catch(() => undefined);
  }

  return jsonResponse({
    requestId: id,
    guestUrl: `${origin}/r/${id}`,
    adminUrl: `${origin}/r/${id}?admin=${adminToken}`,
  });
}

export async function handleSubmitAvailability(request: Request, stub: DurableObjectStub) {
  const body = await readJson<{
    availability?: { startUtc: string; endUtc: string }[];
    guestTimezone?: string;
  }>(request);

  if (!body) {
    return jsonResponse({ error: "Invalid JSON." }, 400);
  }

  const availability = body.availability ?? [];
  const guestTimezone = (body.guestTimezone ?? "").trim();

  if (!guestTimezone) {
    return jsonResponse({ error: "Guest timezone is required." }, 400);
  }

  if (!Array.isArray(availability) || availability.length === 0) {
    return jsonResponse({ error: "At least one availability entry is required." }, 400);
  }

  for (const entry of availability) {
    if (!entry.startUtc || !entry.endUtc) {
      return jsonResponse({ error: "Availability entries must include start and end." }, 400);
    }
    const start = Date.parse(entry.startUtc);
    const end = Date.parse(entry.endUtc);
    if (Number.isNaN(start) || Number.isNaN(end) || end <= start) {
      return jsonResponse({ error: "Availability entries must be valid UTC times." }, 400);
    }
  }

  const payload: SubmissionData = {
    availability,
    guestTimezone,
    submittedAt: new Date().toISOString(),
  };

  return proxyToDurableObject(stub, "/submit", new Request("https://do/submit", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  }));
}
export async function handleCreateGroupRequest(request: Request, env: Env, origin: string) {
  const body = await readJson<{
    hostName?: string;
    hostEmail?: string;
    hostTimezone?: string;
    guests?: { name: string; email: string }[];
    allowedDateStart?: string;
    allowedDateEnd?: string;
    allowedTimeWindows?: AllowedWindow[];
    participationThreshold?: number;
  }>(request);

  if (!body) {
    return jsonResponse({ error: "Invalid JSON." }, 400);
  }

  const hostName = escapeHtml((body.hostName ?? "").trim());
  const hostEmail = (body.hostEmail ?? "").trim().toLowerCase();
  const hostTimezone = (body.hostTimezone ?? "").trim();
  const allowedDateStart = (body.allowedDateStart ?? "").trim();
  const allowedDateEnd = (body.allowedDateEnd ?? "").trim();
  const allowedTimeWindows = normalizeTimeWindows(body.allowedTimeWindows ?? []);
  const guests = body.guests ?? [];

  const errors: string[] = [];

  // Validate required fields
  if (!hostName) errors.push("Host name is required.");
  if (!hostTimezone) errors.push("Host timezone is required.");
  if (hostTimezone && !isValidTimezone(hostTimezone)) errors.push(`Invalid timezone identifier: ${hostTimezone}`);
  if (!isDateString(allowedDateStart)) errors.push("Valid start date is required.");
  if (!isDateString(allowedDateEnd)) errors.push("Valid end date is required.");

  // Validate date range
  if (allowedDateStart && allowedDateEnd && allowedDateStart > allowedDateEnd) {
    errors.push("Start date must be on or before end date.");
  }

  // Validate date range does not exceed 60 days (Requirement 1.6)
  if (allowedDateStart && allowedDateEnd) {
    const start = new Date(allowedDateStart);
    const end = new Date(allowedDateEnd);
    const diffDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays > 60) {
      errors.push("Date range cannot exceed 60 days.");
    }
  }

  // Validate time windows (Requirement 1.7)
  if (!validateTimeWindows(allowedTimeWindows)) {
    errors.push("Time windows must be valid and ordered.");
  }

  // Validate minimum guest count (Requirement 1.1)
  if (!Array.isArray(guests) || guests.length < 3) {
    errors.push("Minimum 3 guests required for group availability requests.");
  }

  // Validate maximum guest count (Requirement 14.5)
  if (guests.length > 50) {
    errors.push("Maximum 50 guests allowed per request.");
  }

  // Validate guest data and email uniqueness
  const emailSet = new Set<string>();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  for (const guest of guests) {
    const name = (guest.name ?? "").trim();
    const email = (guest.email ?? "").trim().toLowerCase();

    if (!name) {
      errors.push("All guest names are required.");
      break;
    }

    // Validate email format (Requirement 13.6)
    if (!email || !emailRegex.test(email)) {
      errors.push(`Invalid email format: ${guest.email || "(empty)"}`);
      break;
    }

    // Check for duplicate emails
    if (emailSet.has(email)) {
      errors.push(`Duplicate email address: ${email}`);
      break;
    }

    emailSet.add(email);
  }

  if (errors.length) {
    return jsonResponse({ error: errors.join(" ") }, 400);
  }

  // Generate tokens (Requirements 1.3, 1.4, 2.1)
  const id = randomToken();
  const adminToken = randomToken(24);
  const invitedAt = new Date().toISOString();

  // Generate unique guest tokens and build GuestInfo array
  const guestInfos = guests.map((guest) => ({
    token: randomToken(16),
    name: escapeHtml(guest.name.trim()),
    email: guest.email.trim().toLowerCase(),
    invitedAt,
  }));

  // Create request data (Requirement 1.5)
  const requestData: RequestData = {
    id,
    adminToken,
    hostName,
    hostTimezone,
    allowedDateStart,
    allowedDateEnd,
    allowedTimeWindows,
    createdAt: invitedAt,
    type: "group-availability",
    guests: guestInfos,
    participationThreshold: body.participationThreshold ?? guests.length,
    confirmed: false,
    ...(hostEmail ? { hostEmail } : {}),
  };

  // Store in Durable Object
  const stub = env.AVAILABILITY.get(env.AVAILABILITY.idFromName(id));
  const response = await stub.fetch("https://do/request", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(requestData),
  });

  if (!response.ok) {
    return response;
  }

  // Generate guest URLs (Requirement 1.4)
  const guestUrls = guestInfos.map((guest) => ({
    name: guest.name,
    email: guest.email,
    url: `${origin}/ga/${id}?guest=${guest.token}`,
  }));

  return jsonResponse({
    requestId: id,
    adminUrl: `${origin}/ga/${id}?admin=${adminToken}`,
    guestUrls,
  });
}

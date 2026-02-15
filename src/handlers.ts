import type { Env, AllowedWindow, RequestData, SubmissionData } from "./types";
import { readJson, jsonResponse, normalizeTimeWindows, validateTimeWindows, isDateString, randomToken, proxyToDurableObject } from "./utils";
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

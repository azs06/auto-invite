import type { Env, AllowedWindow, RequestData, SubmissionData, GeneratedSlot } from "./types";

export async function proxyToDurableObject(
  stub: DurableObjectStub,
  path: string,
  request: Request
) {
  const init: RequestInit = {
    method: request.method,
    headers: request.headers,
  };

  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = request.body;
  }

  return stub.fetch(`https://do${path}`, init);
}

export async function readJson<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

export function normalizeTimeWindows(windows: AllowedWindow[]) {
  const trimmed = windows
    .map((window) => ({
      startTime: (window.startTime ?? "").trim(),
      endTime: (window.endTime ?? "").trim(),
    }))
    .filter((window) => window.startTime && window.endTime);

  return trimmed.length
    ? trimmed
    : [{ startTime: "00:00", endTime: "23:59" }];
}

export function validateTimeWindows(windows: AllowedWindow[]) {
  if (!Array.isArray(windows) || windows.length === 0) {
    return false;
  }
  return windows.every((window) => {
    if (!isTimeString(window.startTime) || !isTimeString(window.endTime)) {
      return false;
    }
    return timeToMinutes(window.startTime) < timeToMinutes(window.endTime);
  });
}

export function isDateString(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function isTimeString(value: string) {
  if (!/^\d{2}:\d{2}$/.test(value)) return false;
  const [hours, minutes] = value.split(":").map(Number);
  return hours >= 0 && hours < 24 && minutes >= 0 && minutes < 60;
}

export function timeToMinutes(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function formatPartsServer(date: Date, timeZone: string) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = dtf.formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    date: `${values.year}-${values.month}-${values.day}`,
    time: `${values.hour}:${values.minute}`,
  };
}

function getTimeZoneOffsetServer(timeZone: string, date: Date): number {
  const utc = formatPartsServer(date, "UTC");
  const zoned = formatPartsServer(date, timeZone);
  const utcMs = Date.UTC(
    Number(utc.date.slice(0, 4)),
    Number(utc.date.slice(5, 7)) - 1,
    Number(utc.date.slice(8, 10)),
    Number(utc.time.slice(0, 2)),
    Number(utc.time.slice(3, 5))
  );
  const zonedMs = Date.UTC(
    Number(zoned.date.slice(0, 4)),
    Number(zoned.date.slice(5, 7)) - 1,
    Number(zoned.date.slice(8, 10)),
    Number(zoned.time.slice(0, 2)),
    Number(zoned.time.slice(3, 5))
  );
  return (zonedMs - utcMs) / 60000;
}

function zonedTimeToUtcServer(dateStr: string, timeStr: string, timeZone: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  const [hour, minute] = timeStr.split(":").map(Number);
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const offset = getTimeZoneOffsetServer(timeZone, utcGuess);
  return new Date(utcGuess.getTime() - offset * 60000);
}

export function generateSlots(data: RequestData): GeneratedSlot[] {
  const { allowedDateStart, allowedDateEnd, allowedTimeWindows, hostTimezone,
    slotDurationMinutes = 60, bufferMinutes = 0 } = data;

  const windows = allowedTimeWindows.length
    ? allowedTimeWindows
    : [{ startTime: "00:00", endTime: "23:59" }];

  const slots: GeneratedSlot[] = [];
  let currentDate = allowedDateStart;

  while (currentDate <= allowedDateEnd) {
    for (const window of windows) {
      const windowStartMinutes = timeToMinutes(window.startTime);
      const windowEndMinutes = timeToMinutes(window.endTime);
      let cursor = windowStartMinutes;

      while (cursor + slotDurationMinutes <= windowEndMinutes) {
        const startHour = Math.floor(cursor / 60);
        const startMin = cursor % 60;
        const endCursor = cursor + slotDurationMinutes;
        const endHour = Math.floor(endCursor / 60);
        const endMin = endCursor % 60;

        const startTime = `${String(startHour).padStart(2, "0")}:${String(startMin).padStart(2, "0")}`;
        const endTime = `${String(endHour).padStart(2, "0")}:${String(endMin).padStart(2, "0")}`;

        const startUtc = zonedTimeToUtcServer(currentDate, startTime, hostTimezone);
        const endUtc = zonedTimeToUtcServer(currentDate, endTime, hostTimezone);

        slots.push({
          startUtc: startUtc.toISOString(),
          endUtc: endUtc.toISOString(),
        });

        cursor += slotDurationMinutes + bufferMinutes;
      }
    }
    // Advance to next date
    const [y, m, d] = currentDate.split("-").map(Number);
    const next = new Date(Date.UTC(y, m - 1, d));
    next.setUTCDate(next.getUTCDate() + 1);
    currentDate = next.toISOString().slice(0, 10);
  }

  return slots;
}

export function randomToken(bytes = 16) {
  const data = new Uint8Array(bytes);
  crypto.getRandomValues(data);
  let binary = "";
  data.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function generateICS(request: RequestData, submission: SubmissionData): string {
  const formatICSDate = (isoString: string) => {
    return isoString.replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  };

  const escapeICS = (text: string) => {
    return text.replace(/[\\;,\n]/g, (match) => {
      if (match === "\n") return "\\n";
      return "\\" + match;
    });
  };

  const events = submission.availability.map((slot, index) => {
    const uid = `${request.id}-${index}@auto-invite`;
    const dtstamp = formatICSDate(new Date().toISOString());
    const dtstart = formatICSDate(slot.startUtc);
    const dtend = formatICSDate(slot.endUtc);
    const summary = `Available: ${escapeICS(request.guestName)}`;
    const description = escapeICS(
      `Guest availability submitted via Auto Invite.\\n` +
      `Guest: ${request.guestName} (${request.guestEmail})\\n` +
      `Guest timezone: ${submission.guestTimezone}\\n` +
      `Submitted: ${submission.submittedAt}`
    );

    return [
      "BEGIN:VEVENT",
      `UID:${uid}`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART:${dtstart}`,
      `DTEND:${dtend}`,
      `SUMMARY:${summary}`,
      `DESCRIPTION:${description}`,
      "STATUS:TENTATIVE",
      "TRANSP:TRANSPARENT",
      "END:VEVENT",
    ].join("\r\n");
  });

  const calendar = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Auto Invite//Availability Export//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeICS(request.guestName)} Availability`,
    ...events,
    "END:VCALENDAR",
  ].join("\r\n");

  return calendar;
}

export async function notifyHost(env: Env, request: RequestData, submission: SubmissionData) {
  if (!env.NOTIFY_WEBHOOK_URL) return;
  await fetch(env.NOTIFY_WEBHOOK_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      requestId: request.id,
      guestName: request.guestName,
      guestEmail: request.guestEmail,
      submittedAt: submission.submittedAt,
      updatedAt: submission.updatedAt,
    }),
  });
}

export function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
    },
  });
}

export function htmlResponse(html: string, status = 200) {
  return new Response(html, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
    },
  });
}

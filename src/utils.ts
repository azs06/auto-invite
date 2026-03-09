import type { Env, AllowedWindow, RequestData, IndividualRequestData, GroupEventRequestData, GroupAvailabilityRequestData, SubmissionData, GeneratedSlot, GuestSubmission, TimeSlot, AggregatedAvailability, GuestInfo, GroupSubmissionsData, ConfirmedSlot } from "./types";

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

export function generateSlots(data: GroupEventRequestData): GeneratedSlot[] {
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

export function generateGuestToken() {
  return `guest_${randomToken(16)}`;
}

export function generateICS(request: IndividualRequestData, submission: SubmissionData): string {
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

export async function notifyHost(env: Env, request: IndividualRequestData, submission: SubmissionData) {
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

/**
 * Escapes HTML special characters in a string to prevent XSS attacks.
 * Sanitizes user-supplied input before rendering in HTML or storing.
 *
 * Validates: Requirements 13.7
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
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

// ============================================================================
// DST-Aware Timezone Conversion Functions
// ============================================================================

/**
 * Validates that a timezone identifier is a valid IANA timezone name.
 * Uses Intl.DateTimeFormat to check if the timezone is recognized.
 * 
 * @param timezone - The IANA timezone identifier to validate (e.g., "America/New_York")
 * @returns true if the timezone is valid, false otherwise
 * 
 * Validates: Requirements 12.5
 */
export function isValidTimezone(timezone: string): boolean {
  if (!timezone || typeof timezone !== 'string') {
    return false;
  }
  
  try {
    // Attempt to create a DateTimeFormat with the timezone
    // This will throw if the timezone is invalid
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

/**
 * Converts a date and time from one timezone to another, accounting for DST.
 * 
 * @param dateStr - Date string in YYYY-MM-DD format
 * @param timeStr - Time string in HH:MM format
 * @param fromTimezone - Source IANA timezone identifier
 * @param toTimezone - Target IANA timezone identifier
 * @returns Object with date and time strings in the target timezone
 * 
 * Validates: Requirements 12.3, 12.4
 */
export function convertTimeBetweenTimezones(
  dateStr: string,
  timeStr: string,
  fromTimezone: string,
  toTimezone: string
): { date: string; time: string } {
  // Parse the input date and time
  const [year, month, day] = dateStr.split('-').map(Number);
  const [hour, minute] = timeStr.split(':').map(Number);
  
  // Create a UTC date representing the time in the source timezone
  const utcDate = zonedTimeToUtcServer(dateStr, timeStr, fromTimezone);
  
  // Format the UTC date in the target timezone
  return formatPartsServer(utcDate, toTimezone);
}

/**
 * Converts a UTC ISO string to a specific timezone, returning date and time parts.
 * Handles DST transitions correctly.
 * 
 * @param utcIsoString - UTC timestamp in ISO format (e.g., "2024-03-10T14:30:00Z")
 * @param timezone - Target IANA timezone identifier
 * @returns Object with date and time strings in the target timezone
 * 
 * Validates: Requirements 12.3, 12.4
 */
export function utcToTimezone(
  utcIsoString: string,
  timezone: string
): { date: string; time: string } {
  const date = new Date(utcIsoString);
  return formatPartsServer(date, timezone);
}

/**
 * Converts a date and time in a specific timezone to UTC ISO string.
 * Handles DST transitions correctly.
 * 
 * @param dateStr - Date string in YYYY-MM-DD format
 * @param timeStr - Time string in HH:MM format
 * @param timezone - Source IANA timezone identifier
 * @returns UTC timestamp in ISO format
 * 
 * Validates: Requirements 12.3, 12.4
 */
export function timezoneToUtc(
  dateStr: string,
  timeStr: string,
  timezone: string
): string {
  return zonedTimeToUtcServer(dateStr, timeStr, timezone).toISOString();
}

/**
 * Gets the UTC offset in minutes for a specific timezone at a given date.
 * This accounts for DST - the offset may vary depending on the date.
 * 
 * @param timezone - IANA timezone identifier
 * @param date - The date to check the offset for (defaults to current date)
 * @returns Offset in minutes (positive for east of UTC, negative for west)
 * 
 * Validates: Requirements 12.3
 */
export function getTimezoneOffset(timezone: string, date: Date = new Date()): number {
  return getTimeZoneOffsetServer(timezone, date);
}

/**
 * Checks if a date falls within a DST transition period for a given timezone.
 * This is useful for warning users about potential time ambiguities.
 * 
 * @param dateStr - Date string in YYYY-MM-DD format
 * @param timezone - IANA timezone identifier
 * @returns true if the date is near a DST transition (within 1 day)
 * 
 * Validates: Requirements 12.3
 */
export function isDstTransitionDate(dateStr: string, timezone: string): boolean {
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  
  // Check offset at noon on this date
  const currentOffset = getTimeZoneOffsetServer(timezone, date);
  
  // Check offset 24 hours before
  const dayBefore = new Date(date.getTime() - 24 * 60 * 60 * 1000);
  const beforeOffset = getTimeZoneOffsetServer(timezone, dayBefore);
  
  // Check offset 24 hours after
  const dayAfter = new Date(date.getTime() + 24 * 60 * 60 * 1000);
  const afterOffset = getTimeZoneOffsetServer(timezone, dayAfter);
  
  // If offsets differ, we're near a DST transition
  return currentOffset !== beforeOffset || currentOffset !== afterOffset;
}

/**
 * Formats a UTC ISO string as a human-readable string in a specific timezone.
 * 
 * @param utcIsoString - UTC timestamp in ISO format
 * @param timezone - Target IANA timezone identifier
 * @param includeTimezone - Whether to include timezone abbreviation (default: true)
 * @returns Formatted string like "2024-03-10 14:30 EDT"
 * 
 * Validates: Requirements 12.4
 */
export function formatInTimezone(
  utcIsoString: string,
  timezone: string,
  includeTimezone: boolean = true
): string {
  const date = new Date(utcIsoString);
  const { date: dateStr, time: timeStr } = formatPartsServer(date, timezone);
  
  if (!includeTimezone) {
    return `${dateStr} ${timeStr}`;
  }
  
  // Get timezone abbreviation (e.g., "EST", "EDT", "PST")
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    timeZoneName: 'short',
  });
  const parts = formatter.formatToParts(date);
  const tzName = parts.find(part => part.type === 'timeZoneName')?.value || timezone;
  
  return `${dateStr} ${timeStr} ${tzName}`;
}

// ============================================================================
// Availability Aggregation Functions
// ============================================================================

/**
 * Helper function to check if a guest is available during a specific time interval.
 * A guest is available if the interval [startMs, endMs] is fully contained within
 * at least one of their submitted availability ranges.
 * 
 * @param submission - Guest submission with availability ranges
 * @param startMs - Start of interval in milliseconds since epoch
 * @param endMs - End of interval in milliseconds since epoch
 * @returns true if the guest is available for the entire interval
 */
function isAvailableDuring(
  submission: GuestSubmission,
  startMs: number,
  endMs: number
): boolean {
  for (const range of submission.availability) {
    const rangeStart = Date.parse(range.startUtc);
    const rangeEnd = Date.parse(range.endUtc);
    
    // Check if [startMs, endMs] is fully contained within [rangeStart, rangeEnd]
    if (rangeStart <= startMs && endMs <= rangeEnd) {
      return true;
    }
  }
  return false;
}

/**
 * Aggregates availability from multiple guest submissions to identify overlapping time slots.
 * 
 * Algorithm:
 * 1. Collect all unique time boundaries from all submissions
 * 2. Sort boundaries chronologically
 * 3. For each interval between consecutive boundaries:
 *    - Count how many guests are available for the entire interval
 *    - Track which guests are available
 * 4. Filter out intervals shorter than minimum duration (30 minutes)
 * 5. Sort slots by participation count (descending), then by start time (ascending)
 * 
 * @param submissions - Array of guest submissions with availability ranges
 * @param minDuration - Minimum slot duration in minutes (default: 30)
 * @returns Aggregated availability with slots sorted by participation
 * 
 * Validates: Requirements 5.2, 5.3, 6.1, 6.3, 6.6
 */
export function aggregateAvailability(
  submissions: GuestSubmission[],
  minDuration: number = 30
): AggregatedAvailability {
  // Handle empty submissions
  if (submissions.length === 0) {
    return {
      slots: [],
      totalGuests: 0,
      submittedCount: 0,
      maxParticipation: 0,
    };
  }
  
  // 1. Collect all unique time boundaries from submissions
  const boundaries = new Set<number>();
  for (const sub of submissions) {
    for (const range of sub.availability) {
      boundaries.add(Date.parse(range.startUtc));
      boundaries.add(Date.parse(range.endUtc));
    }
  }
  
  // 2. Sort boundaries chronologically
  const sortedBoundaries = Array.from(boundaries).sort((a, b) => a - b);
  
  // 3. For each interval between boundaries, count participants
  const slots: TimeSlot[] = [];
  const minDurationMs = minDuration * 60 * 1000;
  
  for (let i = 0; i < sortedBoundaries.length - 1; i++) {
    const start = sortedBoundaries[i];
    const end = sortedBoundaries[i + 1];
    
    // Skip intervals shorter than minimum duration
    if (end - start < minDurationMs) continue;
    
    // Count how many guests are available in this interval
    const participants: string[] = [];
    for (const sub of submissions) {
      if (isAvailableDuring(sub, start, end)) {
        participants.push(sub.guestToken);
      }
    }
    
    // Only include slots with at least one participant
    if (participants.length > 0) {
      slots.push({
        startUtc: new Date(start).toISOString(),
        endUtc: new Date(end).toISOString(),
        participantCount: participants.length,
        participantTokens: participants,
      });
    }
  }
  
  // 4. Sort by participation count (descending), then by start time (ascending)
  slots.sort((a, b) => {
    if (b.participantCount !== a.participantCount) {
      return b.participantCount - a.participantCount;
    }
    return Date.parse(a.startUtc) - Date.parse(b.startUtc);
  });
  
  // Calculate metadata
  const maxParticipation = slots.length > 0 
    ? Math.max(...slots.map(s => s.participantCount))
    : 0;
  
  return {
    slots,
    totalGuests: submissions.length,
    submittedCount: submissions.length,
    maxParticipation,
  };
}

/**
 * Generates an iCalendar (.ics) file for a group-availability request.
 * Includes one VEVENT per availability range per guest, plus the confirmed
 * meeting slot (if present) as a separate VEVENT.
 *
 * Validates: Requirements 10.1, 10.2, 10.3, 10.4, 10.5
 */
export function generateGroupICS(
  request: GroupAvailabilityRequestData,
  submissionsData: GroupSubmissionsData,
  confirmedSlot: ConfirmedSlot | null
): string {
  const formatICSDate = (isoString: string) =>
    isoString.replace(/[-:]/g, "").replace(/\.\d{3}/, "");

  const escapeICS = (text: string) =>
    text.replace(/[\\;,\n]/g, (match) => (match === "\n" ? "\\n" : "\\" + match));

  const guests: GuestInfo[] = request.guests;
  const guestByToken = new Map(guests.map((g) => [g.token, g]));

  const events: string[] = [];

  // One event per availability range per guest
  for (const sub of submissionsData.submissions) {
    const guest = guestByToken.get(sub.guestToken);
    const guestName = guest?.name ?? sub.guestToken;
    const guestEmail = guest?.email ?? "";

    sub.availability.forEach((range, index) => {
      const uid = `${request.id}-${sub.guestToken}-${index}@auto-invite`;
      const dtstamp = formatICSDate(new Date().toISOString());
      const dtstart = formatICSDate(range.startUtc);
      const dtend = formatICSDate(range.endUtc);
      const summary = `Available: ${escapeICS(guestName)}`;
      const descParts = [
        `Guest availability submitted via Auto Invite.`,
        `Guest: ${guestName}${guestEmail ? ` (${guestEmail})` : ""}`,
        `Guest timezone: ${sub.guestTimezone}`,
        `Submitted: ${sub.submittedAt}`,
      ];
      if (sub.updatedAt) descParts.push(`Updated: ${sub.updatedAt}`);
      const description = escapeICS(descParts.join("\\n"));

      events.push(
        [
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
        ].join("\r\n")
      );
    });
  }

  // Confirmed meeting slot (if present)
  if (confirmedSlot) {
    const uid = `${request.id}-confirmed@auto-invite`;
    const dtstamp = formatICSDate(new Date().toISOString());
    const dtstart = formatICSDate(confirmedSlot.startUtc);
    const dtend = formatICSDate(confirmedSlot.endUtc);
    const summary = escapeICS(confirmedSlot.title);
    const descParts = [`Confirmed meeting via Auto Invite.`];
    if (confirmedSlot.description) descParts.push(escapeICS(confirmedSlot.description));
    descParts.push(`Confirmed at: ${confirmedSlot.confirmedAt}`);
    const description = descParts.join("\\n");

    const lines = [
      "BEGIN:VEVENT",
      `UID:${uid}`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART:${dtstart}`,
      `DTEND:${dtend}`,
      `SUMMARY:${summary}`,
      `DESCRIPTION:${description}`,
      "STATUS:CONFIRMED",
      "TRANSP:OPAQUE",
    ];
    if (confirmedSlot.location) {
      lines.push(`LOCATION:${escapeICS(confirmedSlot.location)}`);
    }
    lines.push("END:VEVENT");
    events.push(lines.join("\r\n"));
  }

  const calName = escapeICS(`${request.hostName} Group Availability`);
  const calendar = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Auto Invite//Availability Export//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${calName}`,
    ...events,
    "END:VCALENDAR",
  ].join("\r\n");

  return calendar;
}

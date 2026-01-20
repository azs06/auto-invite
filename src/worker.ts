export interface Env {
  AVAILABILITY: DurableObjectNamespace;
  NOTIFY_WEBHOOK_URL?: string;
}

type AllowedWindow = {
  startTime: string;
  endTime: string;
};

type RequestData = {
  id: string;
  adminToken: string;
  hostName: string;
  guestName: string;
  guestEmail: string;
  hostTimezone: string;
  allowedDateStart: string;
  allowedDateEnd: string;
  allowedTimeWindows: AllowedWindow[];
  createdAt: string;
};

type SubmissionData = {
  availability: { startUtc: string; endUtc: string }[];
  guestTimezone: string;
  submittedAt: string;
  updatedAt?: string;
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const { pathname } = url;

    if (pathname === "/" || pathname === "") {
      return Response.redirect(`${url.origin}/new`, 302);
    }

    if (pathname === "/new" && request.method === "GET") {
      return htmlResponse(renderNewPage());
    }

    if (pathname.startsWith("/r/") && request.method === "GET") {
      return htmlResponse(renderRequestPage());
    }

    if (pathname === "/api/request" && request.method === "POST") {
      return handleCreateRequest(request, env, url.origin);
    }

    if (pathname.startsWith("/api/request/")) {
      const parts = pathname.split("/").filter(Boolean);
      const requestId = parts[2];
      const extra = parts[3] ?? "";

      if (!requestId) {
        return jsonResponse({ error: "Missing request id." }, 400);
      }

      const stub = env.AVAILABILITY.get(env.AVAILABILITY.idFromName(requestId));

      if (!extra && request.method === "GET") {
        return proxyToDurableObject(stub, `/request${url.search}`, request);
      }

      if (!extra && request.method === "PUT") {
        return proxyToDurableObject(stub, `/request${url.search}`, request);
      }

      if (!extra && request.method === "DELETE") {
        return proxyToDurableObject(stub, `/request${url.search}`, request);
      }

      if (extra === "availability" && request.method === "GET") {
        return proxyToDurableObject(stub, `/submission${url.search}`, request);
      }

      if (extra === "export.ics" && request.method === "GET") {
        return proxyToDurableObject(stub, `/export.ics${url.search}`, request);
      }

      if (extra === "submit" && request.method === "POST") {
        return handleSubmitAvailability(request, stub);
      }
    }

    // WebSocket upgrade for real-time admin notifications
    if (pathname.startsWith("/ws/") && request.method === "GET") {
      const parts = pathname.split("/").filter(Boolean);
      const requestId = parts[1];
      if (!requestId) {
        return jsonResponse({ error: "Missing request id." }, 400);
      }
      if (request.headers.get("Upgrade") !== "websocket") {
        return new Response("Expected Upgrade: websocket", { status: 426 });
      }
      const stub = env.AVAILABILITY.get(env.AVAILABILITY.idFromName(requestId));
      return proxyToDurableObject(stub, `/ws${url.search}`, request);
    }

    return jsonResponse({ error: "Not found." }, 404);
  },
};

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

async function handleCreateRequest(request: Request, env: Env, origin: string) {
  const body = await readJson<{
    hostName?: string;
    guestName?: string;
    guestEmail?: string;
    hostTimezone?: string;
    allowedDateStart?: string;
    allowedDateEnd?: string;
    allowedTimeWindows?: AllowedWindow[];
  }>(request);

  if (!body) {
    return jsonResponse({ error: "Invalid JSON." }, 400);
  }

  const hostName = (body.hostName ?? "").trim();
  const guestName = (body.guestName ?? "").trim();
  const guestEmail = (body.guestEmail ?? "").trim();
  const hostTimezone = (body.hostTimezone ?? "").trim();
  const allowedDateStart = (body.allowedDateStart ?? "").trim();
  const allowedDateEnd = (body.allowedDateEnd ?? "").trim();
  const allowedTimeWindows = normalizeTimeWindows(body.allowedTimeWindows ?? []);

  const errors: string[] = [];
  if (!hostName) errors.push("Your name is required.");
  if (!guestName) errors.push("Guest name is required.");
  if (!guestEmail) errors.push("Guest email is required.");
  if (!hostTimezone) errors.push("Host timezone is required.");
  if (!isDateString(allowedDateStart)) errors.push("Valid start date is required.");
  if (!isDateString(allowedDateEnd)) errors.push("Valid end date is required.");
  if (allowedDateStart && allowedDateEnd && allowedDateStart > allowedDateEnd) {
    errors.push("Start date must be on or before end date.");
  }

  if (!validateTimeWindows(allowedTimeWindows)) {
    errors.push("Time windows must be valid and ordered.");
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

  return jsonResponse({
    requestId: id,
    guestUrl: `${origin}/r/${id}`,
    adminUrl: `${origin}/r/${id}?admin=${adminToken}`,
  });
}

async function handleSubmitAvailability(request: Request, stub: DurableObjectStub) {
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

async function proxyToDurableObject(
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

function isDateString(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isTimeString(value: string) {
  if (!/^\d{2}:\d{2}$/.test(value)) return false;
  const [hours, minutes] = value.split(":").map(Number);
  return hours >= 0 && hours < 24 && minutes >= 0 && minutes < 60;
}

function timeToMinutes(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function randomToken(bytes = 16) {
  const data = new Uint8Array(bytes);
  crypto.getRandomValues(data);
  let binary = "";
  data.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function generateICS(request: RequestData, submission: SubmissionData): string {
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

async function notifyHost(env: Env, request: RequestData, submission: SubmissionData) {
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

async function readJson<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
    },
  });
}

function htmlResponse(html: string, status = 200) {
  return new Response(html, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
    },
  });
}

function renderNewPage() {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Auto Invite - Schedule Across Timezones</title>
    <meta name="description" content="Collect guest availability across timezones with ease" />
    ${sharedStyles()}
  </head>
  <body>
    <main class="shell">
      <header class="hero">
        <p class="eyebrow">Auto Invite</p>
        <h1>Create an availability request</h1>
        <p class="subhead">Send a guest a personalized link to share their availability in their local timezone.</p>
      </header>

      <form id="request-form" class="panel">
        <div class="panel-header">
          <h2>Request Details</h2>
        </div>

        <div class="form-section">
          <label>
            Your name
            <input name="hostName" required placeholder="Enter your name" autocomplete="name" />
          </label>
        </div>

        <div class="form-section">
          <div class="grid two">
            <label>
              Guest name
              <input name="guestName" required placeholder="Who are you inviting?" />
            </label>
            <label>
              Guest email
              <input name="guestEmail" type="email" required placeholder="guest@example.com" autocomplete="email" />
            </label>
          </div>
        </div>

        <div class="form-section">
          <div class="grid two">
            <label>
              Your timezone
              <input name="hostTimezone" id="host-timezone" required readonly />
            </label>
            <label>
              Date range
              <div class="date-range-inline">
                <input name="allowedDateStart" type="date" required />
                <span class="muted">to</span>
                <input name="allowedDateEnd" type="date" required />
              </div>
            </label>
          </div>
        </div>

        <div class="panel subtle compact">
          <div class="panel-header">
            <h3>Time Windows</h3>
            <button class="secondary" type="button" id="add-window">Add window</button>
          </div>
          <label class="checkbox-row">
            <input type="checkbox" id="full-day" />
            Allow full day (no time restrictions)
          </label>
          <div id="windows" class="stack"></div>
          <p class="hint">Define when guests can select availability in your timezone.</p>
        </div>

        <div id="request-error" class="message error hidden"></div>
        <button class="primary" type="submit">Generate Invite Link</button>
      </form>

      <section id="links" class="panel hidden">
        <div class="panel-header">
          <h2>Your Links Are Ready</h2>
        </div>
        <div class="stack">
          <div class="card">
            <p class="label">Guest link</p>
            <div class="copy-row">
              <a id="guest-link" target="_blank" rel="noreferrer"></a>
              <button type="button" class="copy-btn" data-copy="guest-link" title="Copy to clipboard">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                </svg>
                <span>Copy</span>
              </button>
            </div>
            <p class="hint">Share this with your guest</p>
          </div>
          <div class="card">
            <p class="label">Admin link</p>
            <div class="copy-row">
              <a id="admin-link" target="_blank" rel="noreferrer"></a>
              <button type="button" class="copy-btn" data-copy="admin-link" title="Copy to clipboard">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                </svg>
                <span>Copy</span>
              </button>
            </div>
            <p class="hint">Keep this link to view responses</p>
          </div>
        </div>
      </section>

      <section id="invite-history" class="panel hidden">
        <div class="panel-header">
          <h2>Recent Invites</h2>
          <button class="ghost danger" type="button" id="clear-invites">Clear all</button>
        </div>
        <div id="invite-list" class="stack"></div>
      </section>
    </main>

    <script type="module">
      const form = document.getElementById("request-form");
      const hostTimezone = document.getElementById("host-timezone");
      const windowsContainer = document.getElementById("windows");
      const addWindowButton = document.getElementById("add-window");
      const linksSection = document.getElementById("links");
      const guestLink = document.getElementById("guest-link");
      const adminLink = document.getElementById("admin-link");
      const requestError = document.getElementById("request-error");
      const inviteHistory = document.getElementById("invite-history");
      const inviteList = document.getElementById("invite-list");
      const clearInvites = document.getElementById("clear-invites");
      const dateStartInput = form.querySelector('input[name="allowedDateStart"]');
      const dateEndInput = form.querySelector('input[name="allowedDateEnd"]');
      const fullDayToggle = document.getElementById("full-day");

      const STORAGE_KEY = "autoInviteRequests";

      hostTimezone.value = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

      function showError(message) {
        requestError.textContent = message;
        requestError.classList.remove("hidden");
      }

      function clearError() {
        requestError.textContent = "";
        requestError.classList.add("hidden");
      }

      function loadInvites() {
        try {
          const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
          return Array.isArray(stored) ? stored : [];
        } catch {
          return [];
        }
      }

      function saveInvites(invites) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(invites));
      }

      function renderInvites(invites) {
        inviteList.innerHTML = "";
        if (!invites.length) {
          inviteHistory.classList.add("hidden");
          return;
        }
        inviteHistory.classList.remove("hidden");
        invites.forEach((invite) => {
          const row = document.createElement("div");
          row.className = "row split card";
          row.innerHTML = \`
            <div>
              <p class="label">\${invite.guestName} (\${invite.guestEmail})</p>
              <p class="hint">Created \${new Date(invite.createdAt).toLocaleString()}</p>
            </div>
            <div class="stack">
              <a href="\${invite.guestUrl}" target="_blank" rel="noreferrer">Guest link</a>
              <a href="\${invite.adminUrl}" target="_blank" rel="noreferrer">Admin link</a>
              <button class="ghost danger" type="button" data-remove="\${invite.requestId}">Remove</button>
            </div>
          \`;
          inviteList.appendChild(row);
        });
      }

      function addInvite(invite) {
        const invites = loadInvites();
        invites.unshift(invite);
        saveInvites(invites);
        renderInvites(invites);
      }

      function removeInvite(requestId) {
        const invites = loadInvites().filter((item) => item.requestId !== requestId);
        saveInvites(invites);
        renderInvites(invites);
      }

      inviteList.addEventListener("click", (event) => {
        const target = event.target;
        if (target instanceof HTMLButtonElement && target.dataset.remove) {
          removeInvite(target.dataset.remove);
        }
      });

      clearInvites.addEventListener("click", () => {
        saveInvites([]);
        renderInvites([]);
      });

      dateStartInput.addEventListener("change", () => {
        if (!dateEndInput.value || dateEndInput.value < dateStartInput.value) {
          dateEndInput.value = dateStartInput.value;
        }
      });

      dateEndInput.addEventListener("change", () => {
        if (dateEndInput.value < dateStartInput.value) {
          dateStartInput.value = dateEndInput.value;
        }
      });

      function addWindowRow(start = "", end = "") {
        const row = document.createElement("div");
        row.className = "row";
        row.innerHTML = \`
          <input type="time" class="time" value="\${start}" />
          <span class="muted">to</span>
          <input type="time" class="time" value="\${end}" />
          <button type="button" class="ghost">Remove</button>
        \`;
        row.querySelector("button").addEventListener("click", () => row.remove());
        windowsContainer.appendChild(row);
      }

      addWindowButton.addEventListener("click", () => {
        if (fullDayToggle.checked) {
          fullDayToggle.checked = false;
          applyFullDayToggle();
        }
        addWindowRow();
      });
      addWindowRow("09:00", "17:00");
      renderInvites(loadInvites());

      function applyFullDayToggle() {
        if (fullDayToggle.checked) {
          windowsContainer.innerHTML = "";
          addWindowButton.disabled = true;
          windowsContainer.classList.add("disabled");
        } else {
          addWindowButton.disabled = false;
          windowsContainer.classList.remove("disabled");
          if (!windowsContainer.children.length) {
            addWindowRow("09:00", "17:00");
          }
        }
      }

      fullDayToggle.addEventListener("change", applyFullDayToggle);
      applyFullDayToggle();

      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        clearError();
        const formData = new FormData(form);
        const timeRows = Array.from(windowsContainer.querySelectorAll(".row"));
        const allowedTimeWindows = fullDayToggle.checked
          ? []
          : timeRows
          .map((row) => {
            const inputs = row.querySelectorAll("input");
            return {
              startTime: inputs[0].value,
              endTime: inputs[1].value,
            };
          })
          .filter((window) => window.startTime && window.endTime);

        const payload = {
          hostName: formData.get("hostName"),
          guestName: formData.get("guestName"),
          guestEmail: formData.get("guestEmail"),
          hostTimezone: formData.get("hostTimezone"),
          allowedDateStart: formData.get("allowedDateStart"),
          allowedDateEnd: formData.get("allowedDateEnd"),
          allowedTimeWindows,
        };

        const response = await fetch("/api/request", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          showError(data.error || "Something went wrong.");
          return;
        }

        const data = await response.json();
        guestLink.textContent = data.guestUrl;
        guestLink.href = data.guestUrl;
        adminLink.textContent = data.adminUrl;
        adminLink.href = data.adminUrl;
        linksSection.classList.remove("hidden");
        linksSection.scrollIntoView({ behavior: "smooth", block: "start" });

        addInvite({
          requestId: data.requestId,
          guestName: payload.guestName,
          guestEmail: payload.guestEmail,
          guestUrl: data.guestUrl,
          adminUrl: data.adminUrl,
          createdAt: new Date().toISOString(),
        });
      });

      // Copy to clipboard functionality
      document.querySelectorAll(".copy-btn").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const targetId = btn.dataset.copy;
          const targetEl = document.getElementById(targetId);
          const text = targetEl?.href || targetEl?.textContent || "";

          try {
            await navigator.clipboard.writeText(text);
            btn.classList.add("copied");
            btn.querySelector("span").textContent = "Copied!";
            setTimeout(() => {
              btn.classList.remove("copied");
              btn.querySelector("span").textContent = "Copy";
            }, 2000);
          } catch (err) {
            console.error("Failed to copy:", err);
          }
        });
      });
    </script>
  </body>
</html>`;
}

function renderRequestPage() {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Auto Invite - Share Your Availability</title>
    <meta name="description" content="Select your available times across timezones" />
    ${sharedStyles()}
  </head>
  <body>
    <main class="shell">
      <header class="hero">
        <p class="eyebrow">Auto Invite</p>
        <h1>Share your availability</h1>
        <p class="subhead">Select the times that work for you in your local timezone.</p>
      </header>

      <section id="state" class="panel subtle">
        <p style="color: var(--ink-secondary);">Loading request...</p>
      </section>

      <section id="guest-panel" class="panel hidden">
        <div class="panel-header">
          <h2>Select Your Times</h2>
          <span id="guest-timezone" class="pill"></span>
        </div>
        <p id="guest-intro" class="subhead"></p>
        <div id="timezone-offset" class="timezone-offset-card hidden">
          <div class="timezone-offset-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"></circle>
              <polyline points="12 6 12 12 16 14"></polyline>
            </svg>
          </div>
          <div class="timezone-offset-content">
            <span id="timezone-offset-text"></span>
            <span id="timezone-offset-detail" class="timezone-offset-detail"></span>
          </div>
        </div>
        <div id="guest-notice" class="message success hidden"></div>
        <div id="guest-error" class="message error hidden"></div>
        <div id="date-list" class="date-grid"></div>
        <button id="submit-availability" class="primary">Submit Availability</button>
      </section>

      <section id="host-panel" class="panel hidden">
        <div class="panel-header">
          <h2>Guest Availability</h2>
          <span id="host-timezone" class="pill"></span>
        </div>
        <div id="notification-banner" class="message success hidden"></div>
        <div id="host-details" class="stack" style="margin-bottom: 1.5rem;"></div>
        <div id="availability-list" class="stack"></div>
        <div id="availability-overview" class="availability-overview hidden">
          <h3>Availability Overview</h3>
          <div id="best-times" class="best-times"></div>
          <div id="timeline-view" class="timeline-view"></div>
        </div>
        <button id="export-ics" class="secondary hidden" style="margin-top: 1rem;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: middle; margin-right: 0.5rem;">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="7 10 12 15 17 10"></polyline>
            <line x1="12" y1="15" x2="12" y2="3"></line>
          </svg>
          Export to Calendar (.ics)
        </button>
        <div class="panel subtle" style="margin-top: 2rem;">
          <div class="panel-header">
            <h3>Edit Request</h3>
            <span class="pill">Admin</span>
          </div>
          <form id="edit-form" class="stack">
            <label>
              Your name
              <input id="edit-host-name" required />
            </label>
            <div class="grid two">
              <label>
                Guest name
                <input id="edit-guest-name" required />
              </label>
              <label>
                Guest email
                <input id="edit-guest-email" type="email" required />
              </label>
            </div>
            <div class="grid two">
              <label>
                Your timezone
                <input id="edit-host-timezone" required />
              </label>
              <label>
                Date range
                <div class="inline">
                  <input id="edit-date-start" type="date" required />
                  <span class="muted">to</span>
                  <input id="edit-date-end" type="date" required />
                </div>
              </label>
            </div>
            <div class="panel subtle compact">
              <div class="panel-header">
                <h4>Time Windows</h4>
                <button class="secondary" type="button" id="edit-add-window">Add window</button>
              </div>
              <label class="checkbox-row">
                <input type="checkbox" id="edit-full-day" />
                Allow full day (no time restrictions)
              </label>
              <div id="edit-windows" class="stack"></div>
            </div>
            <div id="edit-error" class="message error hidden"></div>
            <div id="edit-success" class="message success hidden"></div>
            <div class="row">
              <button class="secondary" type="submit">Save Changes</button>
              <button class="ghost danger" type="button" id="delete-request">Delete Request</button>
            </div>
          </form>
        </div>
      </section>
    </main>

    <script type="module">
      const state = document.getElementById("state");
      const guestPanel = document.getElementById("guest-panel");
      const hostPanel = document.getElementById("host-panel");
      const guestTimezoneBadge = document.getElementById("guest-timezone");
      const guestIntro = document.getElementById("guest-intro");
      const timezoneOffsetCard = document.getElementById("timezone-offset");
      const timezoneOffsetText = document.getElementById("timezone-offset-text");
      const timezoneOffsetDetail = document.getElementById("timezone-offset-detail");
      const hostTimezoneBadge = document.getElementById("host-timezone");
      const hostDetails = document.getElementById("host-details");
      const availabilityList = document.getElementById("availability-list");
      const availabilityOverview = document.getElementById("availability-overview");
      const bestTimesContainer = document.getElementById("best-times");
      const timelineView = document.getElementById("timeline-view");
      const exportIcsButton = document.getElementById("export-ics");
      const dateList = document.getElementById("date-list");
      const submitButton = document.getElementById("submit-availability");
      const guestError = document.getElementById("guest-error");
      const guestNotice = document.getElementById("guest-notice");
      const editForm = document.getElementById("edit-form");
      const editHostName = document.getElementById("edit-host-name");
      const editGuestName = document.getElementById("edit-guest-name");
      const editGuestEmail = document.getElementById("edit-guest-email");
      const editHostTimezone = document.getElementById("edit-host-timezone");
      const editDateStart = document.getElementById("edit-date-start");
      const editDateEnd = document.getElementById("edit-date-end");
      const editWindows = document.getElementById("edit-windows");
      const editAddWindow = document.getElementById("edit-add-window");
      const editError = document.getElementById("edit-error");
      const editSuccess = document.getElementById("edit-success");
      const deleteButton = document.getElementById("delete-request");
      const editFullDayToggle = document.getElementById("edit-full-day");
      const notificationBanner = document.getElementById("notification-banner");

      const requestId = location.pathname.split("/")[2];
      const adminToken = new URLSearchParams(location.search).get("admin");
      const guestTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
      let currentRequest = null;

      function formatParts(date, timeZone) {
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
          date: \`\${values.year}-\${values.month}-\${values.day}\`,
          time: \`\${values.hour}:\${values.minute}\`,
        };
      }

      function getTimeZoneOffset(timeZone, date) {
        const utc = formatParts(date, "UTC");
        const zoned = formatParts(date, timeZone);
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

      function zonedTimeToUtc(dateStr, timeStr, timeZone) {
        const [year, month, day] = dateStr.split("-").map(Number);
        const [hour, minute] = timeStr.split(":").map(Number);
        const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute));
        const offset = getTimeZoneOffset(timeZone, utcGuess);
        return new Date(utcGuess.getTime() - offset * 60000);
      }

      function addDays(dateStr, days) {
        const [year, month, day] = dateStr.split("-").map(Number);
        const date = new Date(Date.UTC(year, month - 1, day));
        date.setUTCDate(date.getUTCDate() + days);
        return date.toISOString().slice(0, 10);
      }

      function timeToMinutes(value) {
        const [hours, minutes] = value.split(":").map(Number);
        return hours * 60 + minutes;
      }

      function withinAllowed(date, startTime, endTime, allowedWindows) {
        return allowedWindows.some((window) => {
          return (
            timeToMinutes(startTime) >= timeToMinutes(window.startTime) &&
            timeToMinutes(endTime) <= timeToMinutes(window.endTime)
          );
        });
      }

      function buildAllowedByDate(request, guestTz) {
        const map = {};
        const windows = request.allowedTimeWindows.length
          ? request.allowedTimeWindows
          : [{ startTime: "00:00", endTime: "23:59" }];
        let current = request.allowedDateStart;

        while (current <= request.allowedDateEnd) {
          windows.forEach((window) => {
            const startUtc = zonedTimeToUtc(current, window.startTime, request.hostTimezone);
            const endUtc = zonedTimeToUtc(current, window.endTime, request.hostTimezone);
            if (endUtc <= startUtc) return;
            const startGuest = formatParts(startUtc, guestTz);
            const endGuest = formatParts(endUtc, guestTz);

            if (startGuest.date === endGuest.date) {
              map[startGuest.date] = map[startGuest.date] || [];
              map[startGuest.date].push({
                startTime: startGuest.time,
                endTime: endGuest.time,
              });
            } else {
              map[startGuest.date] = map[startGuest.date] || [];
              map[startGuest.date].push({
                startTime: startGuest.time,
                endTime: "23:59",
              });
              map[endGuest.date] = map[endGuest.date] || [];
              map[endGuest.date].push({
                startTime: "00:00",
                endTime: endGuest.time,
              });
            }
          });
          current = addDays(current, 1);
        }

        Object.keys(map).forEach((date) => {
          map[date].sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
        });

        return map;
      }

      function formatRange(startUtc, endUtc, timeZone) {
        const start = formatParts(new Date(startUtc), timeZone);
        const end = formatParts(new Date(endUtc), timeZone);
        if (start.date === end.date) {
          return \`\${start.date} \${start.time} - \${end.time}\`;
        }
        return \`\${start.date} \${start.time} -> \${end.date} \${end.time}\`;
      }

      function formatDayName(dateStr) {
        const [year, month, day] = dateStr.split("-").map(Number);
        const date = new Date(year, month - 1, day);
        return new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(date);
      }

      function formatDateRangeMessage(hostName, startDate, endDate) {
        const startDay = formatDayName(startDate);
        const endDay = formatDayName(endDate);
        if (startDate === endDate) {
          return \`\${hostName} wants to know your availability on \${startDay}.\`;
        }
        return \`\${hostName} wants to know your availability from \${startDay} to \${endDay}.\`;
      }

      function displayTimezoneOffset(hostTimezone, hostName) {
        const now = new Date();
        const guestOffset = getTimeZoneOffset(guestTimezone, now);
        const hostOffset = getTimeZoneOffset(hostTimezone, now);
        const diffMinutes = guestOffset - hostOffset;
        const diffHours = Math.abs(diffMinutes) / 60;

        let offsetText = "";
        let detailText = "";

        if (diffMinutes === 0) {
          offsetText = "You're in the same timezone";
          detailText = \`Both you and \${hostName} are in \${guestTimezone.replace(/_/g, " ")}\`;
          timezoneOffsetCard.classList.add("same-tz");
        } else {
          const hours = Math.floor(diffHours);
          const mins = Math.round((diffHours - hours) * 60);
          const hourText = hours === 1 ? "hour" : "hours";
          const minText = mins > 0 ? \` \${mins} min\` : "";
          const direction = diffMinutes > 0 ? "ahead of" : "behind";

          offsetText = \`You are \${hours}\${minText} \${hourText} \${direction} \${hostName}\`;
          detailText = \`Your time: \${guestTimezone.replace(/_/g, " ")} · Host: \${hostTimezone.replace(/_/g, " ")}\`;
          timezoneOffsetCard.classList.remove("same-tz");
        }

        timezoneOffsetText.textContent = offsetText;
        timezoneOffsetDetail.textContent = detailText;
        timezoneOffsetCard.classList.remove("hidden");
      }

      function renderGuestCard(date, allowedWindows) {
        const card = document.createElement("div");
        card.className = "date-card";
        const allowedList = allowedWindows
          .map((window) => \`\${window.startTime} - \${window.endTime}\`)
          .join(", ");
        card.innerHTML = \`
          <div class="date-header">
            <div>
              <h3>\${date}</h3>
              <p class="hint">Allowed: \${allowedList}</p>
            </div>
            <button class="secondary" type="button">Add time</button>
          </div>
          <div class="stack" data-date="\${date}"></div>
        \`;
        const addButton = card.querySelector("button");
        const list = card.querySelector("[data-date]");
        addButton.addEventListener("click", () => addRangeRow(list, allowedWindows));
        addRangeRow(list, allowedWindows);
        return card;
      }

      function addRangeRow(container, allowedWindows) {
        const row = document.createElement("div");
        row.className = "row";

        const select = document.createElement("select");
        select.className = "window-select";
        allowedWindows.forEach((window, index) => {
          const option = document.createElement("option");
          option.value = String(index);
          option.textContent = \`\${window.startTime} - \${window.endTime}\`;
          select.appendChild(option);
        });

        const startInput = document.createElement("input");
        startInput.type = "time";
        startInput.className = "time";

        const endInput = document.createElement("input");
        endInput.type = "time";
        endInput.className = "time";

        const removeButton = document.createElement("button");
        removeButton.type = "button";
        removeButton.className = "ghost";
        removeButton.textContent = "Remove";
        removeButton.addEventListener("click", () => row.remove());

        const separator = document.createElement("span");
        separator.className = "muted";
        separator.textContent = "to";

        function applyWindow(window) {
          startInput.min = window.startTime;
          startInput.max = window.endTime;
          endInput.min = window.startTime;
          endInput.max = window.endTime;
          if (!startInput.value || startInput.value < window.startTime || startInput.value > window.endTime) {
            startInput.value = window.startTime;
          }
          if (!endInput.value || endInput.value < startInput.value || endInput.value > window.endTime) {
            endInput.value = window.endTime;
          }
          endInput.min = startInput.value;
        }

        select.addEventListener("change", () => {
          const window = allowedWindows[Number(select.value)];
          applyWindow(window);
        });

        startInput.addEventListener("change", () => {
          const window = allowedWindows[Number(select.value)];
          endInput.min = startInput.value || window.startTime;
          if (endInput.value < endInput.min) {
            endInput.value = endInput.min;
          }
        });

        applyWindow(allowedWindows[0]);

        row.appendChild(select);
        row.appendChild(startInput);
        row.appendChild(separator);
        row.appendChild(endInput);
        row.appendChild(removeButton);
        container.appendChild(row);
      }

      function addEditWindowRow(start = "", end = "") {
        const row = document.createElement("div");
        row.className = "row";
        row.innerHTML = \`
          <input type="time" class="time" value="\${start}" />
          <span class="muted">to</span>
          <input type="time" class="time" value="\${end}" />
          <button type="button" class="ghost">Remove</button>
        \`;
        row.querySelector("button").addEventListener("click", () => row.remove());
        editWindows.appendChild(row);
      }

      function applyEditFullDayToggle() {
        if (editFullDayToggle.checked) {
          editWindows.innerHTML = "";
          editAddWindow.disabled = true;
          editWindows.classList.add("disabled");
        } else {
          editAddWindow.disabled = false;
          editWindows.classList.remove("disabled");
          if (!editWindows.children.length) {
            addEditWindowRow("09:00", "17:00");
          }
        }
      }

      function showGuestError(message) {
        guestError.textContent = message;
        guestError.classList.remove("hidden");
      }

      function clearGuestError() {
        guestError.textContent = "";
        guestError.classList.add("hidden");
      }

      function showGuestNotice(message) {
        guestNotice.textContent = message;
        guestNotice.classList.remove("hidden");
      }

      function clearGuestNotice() {
        guestNotice.textContent = "";
        guestNotice.classList.add("hidden");
      }

      function showEditError(message) {
        editError.textContent = message;
        editError.classList.remove("hidden");
        editSuccess.classList.add("hidden");
      }

      function showEditSuccess(message) {
        editSuccess.textContent = message;
        editSuccess.classList.remove("hidden");
        editError.classList.add("hidden");
      }

      function clearEditMessages() {
        editError.textContent = "";
        editSuccess.textContent = "";
        editError.classList.add("hidden");
        editSuccess.classList.add("hidden");
      }

      function showNotificationBanner(message) {
        notificationBanner.textContent = message;
        notificationBanner.classList.remove("hidden");
        setTimeout(() => notificationBanner.classList.add("hidden"), 5000);
      }

      function connectWebSocket() {
        if (!adminToken) return;
        const wsUrl = new URL("/ws/" + requestId, location.origin);
        wsUrl.protocol = location.protocol === "https:" ? "wss:" : "ws:";
        wsUrl.searchParams.set("admin", adminToken);

        const ws = new WebSocket(wsUrl.toString());

        ws.addEventListener("message", async (event) => {
          const msg = JSON.parse(event.data);
          if (msg.type === "submission") {
            showNotificationBanner(
              msg.guestName + (msg.action === "new" ? " submitted" : " updated") + " their availability"
            );
            if (currentRequest) {
              await loadSubmission(currentRequest);
            }
          }
        });

        ws.addEventListener("close", () => {
          setTimeout(connectWebSocket, 3000);
        });
      }

      function renderHostDetails(request) {
        hostDetails.innerHTML = \`
          <div class="row"><strong>Guest:</strong> \${request.guestName} (\${request.guestEmail})</div>
          <div class="row"><strong>Date range:</strong> \${request.allowedDateStart} to \${request.allowedDateEnd}</div>
        \`;
      }

      function populateEditForm(request) {
        const isFullDay =
          request.allowedTimeWindows.length === 1 &&
          request.allowedTimeWindows[0].startTime === "00:00" &&
          request.allowedTimeWindows[0].endTime === "23:59";
        editHostName.value = request.hostName;
        editGuestName.value = request.guestName;
        editGuestEmail.value = request.guestEmail;
        editHostTimezone.value = request.hostTimezone;
        editDateStart.value = request.allowedDateStart;
        editDateEnd.value = request.allowedDateEnd;
        editWindows.innerHTML = "";
        editFullDayToggle.checked = isFullDay;
        if (!isFullDay) {
          request.allowedTimeWindows.forEach((window) => {
            addEditWindowRow(window.startTime, window.endTime);
          });
        }
        applyEditFullDayToggle();
      }

      function loadInvitesFromStorage() {
        try {
          const stored = JSON.parse(localStorage.getItem("autoInviteRequests") || "[]");
          return Array.isArray(stored) ? stored : [];
        } catch {
          return [];
        }
      }

      function removeInviteFromStorage(id) {
        const invites = loadInvitesFromStorage().filter((item) => item.requestId !== id);
        localStorage.setItem("autoInviteRequests", JSON.stringify(invites));
      }

      async function loadRequest() {
        const url = adminToken
          ? \`/api/request/\${requestId}?admin=\${encodeURIComponent(adminToken)}\`
          : \`/api/request/\${requestId}\`;
        const response = await fetch(url);
        if (!response.ok) {
          state.textContent = "Request not found.";
          return;
        }
        const request = await response.json();
        state.textContent = "";
        state.classList.add("hidden");

        if (adminToken && request.isAdmin) {
          hostPanel.classList.remove("hidden");
          hostTimezoneBadge.textContent = \`Host: \${request.hostTimezone}\`;
          currentRequest = request;
          renderHostDetails(request);
          populateEditForm(request);
          await loadSubmission(request);
          connectWebSocket();
        } else {
          guestPanel.classList.remove("hidden");
          guestTimezoneBadge.textContent = \`Your timezone: \${guestTimezone.replace(/_/g, " ")}\`;
          guestIntro.textContent = formatDateRangeMessage(
            request.hostName,
            request.allowedDateStart,
            request.allowedDateEnd
          );
          displayTimezoneOffset(request.hostTimezone, request.hostName);
          clearGuestNotice();
          if (request.hasSubmission) {
            showGuestNotice("You already submitted availability. Submitting again will replace it.");
          }
          renderGuestSelection(request);
        }
      }

      async function loadSubmission(request) {
        const response = await fetch(
          \`/api/request/\${requestId}/availability?admin=\${encodeURIComponent(adminToken)}\`
        );
        if (!response.ok) {
          availabilityList.textContent = "No submission yet.";
          exportIcsButton.classList.add("hidden");
          return;
        }
        const submission = await response.json();
        const items = submission.availability
          .slice()
          .sort((a, b) => a.startUtc.localeCompare(b.startUtc));
        const submittedAt = new Date(submission.submittedAt).toLocaleString();
        const updatedAt = submission.updatedAt ? new Date(submission.updatedAt).toLocaleString() : "";
        const updatedLine = updatedAt
          ? '<div class="row"><strong>Updated:</strong> ' + updatedAt + "</div>"
          : "";
        const meta = document.createElement("div");
        meta.className = "stack";
        meta.innerHTML = \`
          <div class="row"><strong>Submitted:</strong> \${submittedAt}</div>
          \${updatedLine}
        \`;
        availabilityList.innerHTML = "";
        availabilityList.appendChild(meta);
        const list = document.createElement("div");
        list.className = "stack";
        items.forEach((entry) => {
          const row = document.createElement("div");
          row.className = "row split";
          row.innerHTML = \`
            <div>
              <p class="label">Host time</p>
              <p>\${formatRange(entry.startUtc, entry.endUtc, request.hostTimezone)}</p>
            </div>
            <div>
              <p class="label">Guest time</p>
              <p>\${formatRange(entry.startUtc, entry.endUtc, submission.guestTimezone)}</p>
            </div>
          \`;
          list.appendChild(row);
        });
        availabilityList.appendChild(list);

        // Show export button and set up click handler
        exportIcsButton.classList.remove("hidden");
        exportIcsButton.onclick = () => {
          window.location.href = \`/api/request/\${requestId}/export.ics?admin=\${encodeURIComponent(adminToken)}\`;
        };

        // Render availability overview
        renderAvailabilityOverview(items, request.hostTimezone);
      }

      function renderAvailabilityOverview(items, hostTimezone) {
        if (!items.length) {
          availabilityOverview.classList.add("hidden");
          return;
        }

        // Group items by date
        const byDate = {};
        items.forEach((item) => {
          const startDate = formatParts(new Date(item.startUtc), hostTimezone).date;
          if (!byDate[startDate]) byDate[startDate] = [];
          byDate[startDate].push(item);
        });

        // Calculate duration for each slot and find best times
        const slotsWithDuration = items.map((item) => {
          const start = new Date(item.startUtc);
          const end = new Date(item.endUtc);
          const durationMs = end - start;
          const durationHours = durationMs / (1000 * 60 * 60);
          return { ...item, durationMs, durationHours };
        });

        // Sort by duration to find best times
        const sortedByDuration = [...slotsWithDuration].sort((a, b) => b.durationMs - a.durationMs);
        const bestSlots = sortedByDuration.slice(0, 3);

        // Render best times
        bestTimesContainer.innerHTML = "";
        bestSlots.forEach((slot) => {
          const startParts = formatParts(new Date(slot.startUtc), hostTimezone);
          const endParts = formatParts(new Date(slot.endUtc), hostTimezone);
          const hours = Math.floor(slot.durationHours);
          const mins = Math.round((slot.durationHours - hours) * 60);
          const durationText = mins > 0 ? \`\${hours}h \${mins}m\` : \`\${hours}h\`;

          const card = document.createElement("div");
          card.className = "best-time-card";
          card.innerHTML = \`
            <span class="duration">\${durationText}</span>
            <div class="time-info">
              <span class="time-range">\${startParts.time} - \${endParts.time}</span>
              <span class="time-date">\${formatDayName(startParts.date)}, \${startParts.date}</span>
            </div>
          \`;
          bestTimesContainer.appendChild(card);
        });

        // Render timeline view
        const dates = Object.keys(byDate).sort();
        timelineView.innerHTML = "";

        // Add hour labels
        const hoursRow = document.createElement("div");
        hoursRow.className = "timeline-hours";
        hoursRow.innerHTML = \`
          <span>00:00</span>
          <span>06:00</span>
          <span>12:00</span>
          <span>18:00</span>
          <span>24:00</span>
        \`;
        timelineView.appendChild(hoursRow);

        dates.forEach((date) => {
          const daySlots = byDate[date];
          const row = document.createElement("div");
          row.className = "timeline-day";

          const label = document.createElement("div");
          label.className = "timeline-label";
          const dayName = formatDayName(date);
          label.textContent = \`\${dayName.slice(0, 3)} \${date.slice(5)}\`;

          const bar = document.createElement("div");
          bar.className = "timeline-bar";

          daySlots.forEach((slot) => {
            const startParts = formatParts(new Date(slot.startUtc), hostTimezone);
            const endParts = formatParts(new Date(slot.endUtc), hostTimezone);
            const startMins = timeToMinutes(startParts.time);
            const endMins = timeToMinutes(endParts.time);

            const left = (startMins / 1440) * 100;
            const width = ((endMins - startMins) / 1440) * 100;

            const slotEl = document.createElement("div");
            slotEl.className = "timeline-slot";
            slotEl.style.left = \`\${left}%\`;
            slotEl.style.width = \`\${Math.max(width, 0.5)}%\`;
            slotEl.title = \`\${startParts.time} - \${endParts.time}\`;
            bar.appendChild(slotEl);
          });

          row.appendChild(label);
          row.appendChild(bar);
          timelineView.appendChild(row);
        });

        availabilityOverview.classList.remove("hidden");
      }

      function renderGuestSelection(request) {
        const allowedByDate = buildAllowedByDate(request, guestTimezone);
        const dates = Object.keys(allowedByDate).sort();
        dateList.innerHTML = "";
        if (!dates.length) {
          dateList.textContent = "No available dates were found.";
          return;
        }
        dates.forEach((date) => {
          dateList.appendChild(renderGuestCard(date, allowedByDate[date]));
        });

        submitButton.onclick = async () => {
          clearGuestError();
          let selections = [];
          try {
            dates.forEach((date) => {
              const container = dateList.querySelector(\`[data-date="\${date}"]\`);
              const rows = container.querySelectorAll(".row");
              rows.forEach((row) => {
                const inputs = row.querySelectorAll("input");
                const startTime = inputs[0].value;
                const endTime = inputs[1].value;
                if (!startTime || !endTime) return;
                if (timeToMinutes(endTime) <= timeToMinutes(startTime)) {
                  throw new Error("Each time range must have an end after the start.");
                }
                if (!withinAllowed(date, startTime, endTime, allowedByDate[date])) {
                  throw new Error(\`Time range \${startTime}-\${endTime} on \${date} is outside allowed windows.\`);
                }
                const startUtc = zonedTimeToUtc(date, startTime, guestTimezone).toISOString();
                const endUtc = zonedTimeToUtc(date, endTime, guestTimezone).toISOString();
                selections.push({ startUtc, endUtc });
              });
            });
          } catch (error) {
            showGuestError(error.message || "Please fix the highlighted time ranges.");
            return;
          }

          if (!selections.length) {
            showGuestError("Add at least one availability range before submitting.");
            return;
          }

          const response = await fetch(\`/api/request/\${requestId}/submit\`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ availability: selections, guestTimezone }),
          });
          if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            showGuestError(data.error || "Unable to submit availability.");
            return;
          }
          state.classList.remove("hidden");
          state.textContent = "Thanks! Your availability has been sent.";
          guestPanel.classList.add("hidden");
        };
      }

      editAddWindow.addEventListener("click", () => {
        if (editFullDayToggle.checked) {
          editFullDayToggle.checked = false;
          applyEditFullDayToggle();
        }
        addEditWindowRow();
      });
      editFullDayToggle.addEventListener("change", applyEditFullDayToggle);

      editDateStart.addEventListener("change", () => {
        if (!editDateEnd.value || editDateEnd.value < editDateStart.value) {
          editDateEnd.value = editDateStart.value;
        }
      });

      editDateEnd.addEventListener("change", () => {
        if (editDateEnd.value < editDateStart.value) {
          editDateStart.value = editDateEnd.value;
        }
      });

      editForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (!currentRequest) return;
        clearEditMessages();
        const timeRows = Array.from(editWindows.querySelectorAll(".row"));
        const allowedTimeWindows = editFullDayToggle.checked
          ? []
          : timeRows
              .map((row) => {
                const inputs = row.querySelectorAll("input");
                return { startTime: inputs[0].value, endTime: inputs[1].value };
              })
              .filter((window) => window.startTime && window.endTime);

        const payload = {
          hostName: editHostName.value,
          guestName: editGuestName.value,
          guestEmail: editGuestEmail.value,
          hostTimezone: editHostTimezone.value,
          allowedDateStart: editDateStart.value,
          allowedDateEnd: editDateEnd.value,
          allowedTimeWindows,
        };

        const response = await fetch(\`/api/request/\${requestId}?admin=\${encodeURIComponent(adminToken)}\`, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          showEditError(data.error || "Unable to update the request.");
          return;
        }
        const normalizedWindows = allowedTimeWindows.length
          ? allowedTimeWindows
          : [{ startTime: "00:00", endTime: "23:59" }];
        currentRequest = { ...currentRequest, ...payload, allowedTimeWindows: normalizedWindows };
        hostTimezoneBadge.textContent = \`Host: \${currentRequest.hostTimezone}\`;
        renderHostDetails(currentRequest);
        showEditSuccess("Request updated.");
      });

      deleteButton.addEventListener("click", async () => {
        if (!currentRequest) return;
        const confirmed = confirm("Delete this request? This cannot be undone.");
        if (!confirmed) return;
        clearEditMessages();
        const response = await fetch(\`/api/request/\${requestId}?admin=\${encodeURIComponent(adminToken)}\`, {
          method: "DELETE",
        });
        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          showEditError(data.error || "Unable to delete the request.");
          return;
        }
        removeInviteFromStorage(requestId);
        hostPanel.classList.add("hidden");
        state.classList.remove("hidden");
        state.textContent = "Request deleted.";
      });

      loadRequest();
    </script>
  </body>
</html>`;
}

function sharedStyles() {
  return `<style>
    @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600;700&family=DM+Sans:wght@400;500;600;700&display=swap');

    :root {
      color-scheme: dark;
      --bg: #0d1117;
      --bg-elevated: #161b22;
      --bg-card: #1c2128;
      --bg-input: #0d1117;
      --ink: #e6edf3;
      --ink-secondary: #8b949e;
      --ink-muted: #6e7681;
      --accent: #d4a855;
      --accent-soft: rgba(212, 168, 85, 0.15);
      --accent-glow: rgba(212, 168, 85, 0.4);
      --line: #30363d;
      --line-accent: #d4a855;
      --error: #f85149;
      --error-soft: rgba(248, 81, 73, 0.15);
      --success: #3fb950;
      --success-soft: rgba(63, 185, 80, 0.15);
      --shadow: 0 16px 70px rgba(0, 0, 0, 0.5);
      --shadow-sm: 0 4px 20px rgba(0, 0, 0, 0.3);
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      font-family: "DM Sans", -apple-system, BlinkMacSystemFont, sans-serif;
      color: var(--ink);
      background: var(--bg);
      min-height: 100vh;
      line-height: 1.6;
      position: relative;
    }

    body::before {
      content: "";
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background:
        radial-gradient(ellipse 80% 50% at 50% -20%, rgba(212, 168, 85, 0.08), transparent),
        radial-gradient(ellipse 60% 40% at 100% 0%, rgba(212, 168, 85, 0.05), transparent),
        repeating-linear-gradient(
          0deg,
          transparent,
          transparent 100px,
          rgba(212, 168, 85, 0.02) 100px,
          rgba(212, 168, 85, 0.02) 101px
        ),
        repeating-linear-gradient(
          90deg,
          transparent,
          transparent 100px,
          rgba(212, 168, 85, 0.02) 100px,
          rgba(212, 168, 85, 0.02) 101px
        );
      pointer-events: none;
      z-index: -1;
    }

    h1, h2, h3, h4 {
      font-family: "Cormorant Garamond", Georgia, serif;
      font-weight: 600;
      letter-spacing: -0.01em;
      margin: 0 0 0.5rem;
      line-height: 1.2;
    }

    h1 {
      font-size: 2.75rem;
      font-weight: 700;
      background: linear-gradient(135deg, var(--ink) 0%, var(--accent) 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }

    h2 {
      font-size: 1.5rem;
      color: var(--ink);
    }

    h3 {
      font-size: 1.25rem;
      color: var(--ink);
    }

    h4 {
      font-size: 1.1rem;
      color: var(--ink-secondary);
    }

    p {
      margin: 0;
    }

    a {
      color: var(--accent);
      text-decoration: none;
      word-break: break-all;
      transition: opacity 0.2s ease;
    }

    a:hover {
      opacity: 0.8;
      text-decoration: underline;
    }

    .shell {
      max-width: 880px;
      margin: 0 auto;
      padding: 3rem 1.5rem 5rem;
      display: flex;
      flex-direction: column;
      gap: 2rem;
      animation: fadeIn 0.6s ease-out;
    }

    @keyframes fadeIn {
      from {
        opacity: 0;
        transform: translateY(12px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .hero {
      background: var(--bg-card);
      padding: 2.5rem;
      border-radius: 1.5rem;
      border: 1px solid var(--line);
      box-shadow: var(--shadow);
      position: relative;
      overflow: hidden;
    }

    .hero::before {
      content: "";
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 3px;
      background: linear-gradient(90deg, var(--accent), transparent);
    }

    .hero::after {
      content: "";
      position: absolute;
      top: 2rem;
      right: 2rem;
      width: 120px;
      height: 120px;
      border: 1px solid var(--line);
      border-radius: 50%;
      opacity: 0.3;
    }

    .eyebrow {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      text-transform: uppercase;
      font-size: 0.7rem;
      font-weight: 700;
      letter-spacing: 0.25em;
      color: var(--accent);
      margin-bottom: 1rem;
    }

    .eyebrow::before {
      content: "";
      width: 24px;
      height: 1px;
      background: var(--accent);
    }

    .subhead {
      color: var(--ink-secondary);
      font-size: 1.1rem;
      margin-top: 0.75rem;
      max-width: 480px;
    }

    .panel {
      background: var(--bg-card);
      border-radius: 1.25rem;
      padding: 2rem;
      border: 1px solid var(--line);
      box-shadow: var(--shadow-sm);
      animation: slideUp 0.5s ease-out;
      animation-fill-mode: backwards;
    }

    .panel:nth-child(2) { animation-delay: 0.1s; }
    .panel:nth-child(3) { animation-delay: 0.2s; }
    .panel:nth-child(4) { animation-delay: 0.3s; }

    @keyframes slideUp {
      from {
        opacity: 0;
        transform: translateY(20px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .panel.subtle {
      background: var(--bg-elevated);
      box-shadow: none;
      border-color: var(--line);
    }

    .panel.compact {
      padding: 1.25rem;
    }

    .panel.compact .panel-header {
      align-items: flex-start;
      margin-bottom: 0.75rem;
    }

    .panel.compact .panel-header h2,
    .panel.compact .panel-header h3,
    .panel.compact .panel-header h4 {
      margin: 0;
    }

    .card {
      background: var(--bg-elevated);
      border: 1px solid var(--line);
      border-radius: 1rem;
      padding: 1rem;
    }

    .panel-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 1rem;
      margin-bottom: 1.5rem;
    }

    .form-section {
      margin-bottom: 1.75rem;
    }

    .form-section:last-of-type {
      margin-bottom: 1.25rem;
    }

    .form-section .grid {
      margin-bottom: 0;
    }

    .grid {
      display: grid;
      gap: 1.25rem;
      margin-bottom: 1.25rem;
    }

    .grid.two {
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    }

    .date-range-inline {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .date-range-inline input[type="date"] {
      flex: 1;
      min-width: 0;
      max-width: 140px;
      padding: 0.85rem 0.6rem;
    }

    label {
      display: grid;
      gap: 0.5rem;
      font-weight: 500;
      font-size: 0.875rem;
      color: var(--ink-secondary);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .checkbox-row {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      font-weight: 500;
      font-size: 0.9rem;
      color: var(--ink-secondary);
      text-transform: none;
      letter-spacing: 0;
      margin: 0.5rem 0;
      cursor: pointer;
    }

    .checkbox-row input[type="checkbox"] {
      width: 18px;
      height: 18px;
      accent-color: var(--accent);
      cursor: pointer;
    }

    input, select {
      padding: 0.85rem 1rem;
      border-radius: 0.75rem;
      border: 1px solid var(--line);
      font-family: inherit;
      font-size: 1rem;
      background: var(--bg-input);
      color: var(--ink);
      transition: all 0.2s ease;
    }

    input::placeholder {
      color: var(--ink-muted);
    }

    input:focus, select:focus {
      outline: none;
      border-color: var(--accent);
      box-shadow: 0 0 0 3px var(--accent-soft);
    }

    select {
      cursor: pointer;
    }

    .inline {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      flex-wrap: wrap;
    }

    .stack {
      display: grid;
      gap: 1rem;
    }

    .row {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      flex-wrap: wrap;
    }

    .row.split {
      justify-content: space-between;
      align-items: flex-start;
      gap: 2rem;
      padding: 1.25rem;
      background: var(--bg-elevated);
      border-radius: 1rem;
      border: 1px solid var(--line);
    }

    .message {
      padding: 1rem 1.25rem;
      border-radius: 0.875rem;
      font-weight: 500;
      font-size: 0.95rem;
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .message.error {
      background: var(--error-soft);
      color: var(--error);
      border: 1px solid rgba(248, 81, 73, 0.3);
    }

    .message.success {
      background: var(--success-soft);
      color: var(--success);
      border: 1px solid rgba(63, 185, 80, 0.3);
    }

    .time {
      min-width: 140px;
    }

    .window-select {
      min-width: 180px;
    }

    .panel > * + button,
    .panel form > * + button {
      margin-top: 1rem;
    }

    button {
      border: none;
      padding: 0.9rem 1.75rem;
      border-radius: 0.75rem;
      font-family: inherit;
      cursor: pointer;
      font-weight: 600;
      font-size: 0.95rem;
      transition: all 0.25s ease;
      position: relative;
      overflow: hidden;
    }

    button.primary {
      background: linear-gradient(135deg, var(--accent) 0%, #c49545 100%);
      color: var(--bg);
      box-shadow: 0 4px 20px var(--accent-soft);
    }

    button.primary:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 30px var(--accent-glow);
    }

    button.primary:active {
      transform: translateY(0);
    }

    button.secondary {
      background: var(--accent-soft);
      color: var(--accent);
      border: 1px solid rgba(212, 168, 85, 0.3);
    }

    button.secondary:hover {
      background: rgba(212, 168, 85, 0.25);
      border-color: var(--accent);
    }

    button.ghost {
      background: transparent;
      color: var(--ink-muted);
      padding: 0.5rem 0.75rem;
    }

    button.ghost:hover {
      color: var(--ink-secondary);
      background: var(--bg-elevated);
    }

    button.ghost.danger {
      color: var(--error);
    }

    button.ghost.danger:hover {
      background: var(--error-soft);
    }

    button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
      transform: none !important;
    }

    .pill {
      background: var(--accent-soft);
      color: var(--accent);
      padding: 0.4rem 1rem;
      border-radius: 999px;
      font-size: 0.8rem;
      font-weight: 600;
      letter-spacing: 0.02em;
      border: 1px solid rgba(212, 168, 85, 0.3);
    }

    .label {
      text-transform: uppercase;
      font-size: 0.7rem;
      font-weight: 600;
      letter-spacing: 0.1em;
      color: var(--ink-muted);
      margin-bottom: 0.25rem;
    }

    .hint {
      color: var(--ink-muted);
      font-size: 0.85rem;
      margin-top: 0.5rem;
    }

    .muted {
      color: var(--ink-muted);
      font-size: 0.9rem;
    }

    .timezone-offset-card {
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 1rem 1.25rem;
      margin: 1.25rem 0;
      background: linear-gradient(135deg, rgba(212, 168, 85, 0.1) 0%, rgba(212, 168, 85, 0.05) 100%);
      border: 1px solid rgba(212, 168, 85, 0.25);
      border-radius: 1rem;
      animation: slideIn 0.4s ease-out;
    }

    @keyframes slideIn {
      from {
        opacity: 0;
        transform: translateX(-10px);
      }
      to {
        opacity: 1;
        transform: translateX(0);
      }
    }

    .timezone-offset-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 40px;
      height: 40px;
      background: var(--accent-soft);
      border-radius: 50%;
      color: var(--accent);
      flex-shrink: 0;
    }

    .timezone-offset-content {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }

    #timezone-offset-text {
      font-weight: 600;
      color: var(--ink);
      font-size: 1rem;
    }

    .timezone-offset-detail {
      font-size: 0.85rem;
      color: var(--ink-muted);
    }

    .timezone-offset-card.same-tz {
      background: linear-gradient(135deg, rgba(63, 185, 80, 0.1) 0%, rgba(63, 185, 80, 0.05) 100%);
      border-color: rgba(63, 185, 80, 0.25);
    }

    .timezone-offset-card.same-tz .timezone-offset-icon {
      background: var(--success-soft);
      color: var(--success);
    }

    .copy-row {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      margin: 0.5rem 0;
    }

    .copy-row a {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .copy-btn {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      padding: 0.5rem 0.75rem;
      background: var(--bg-elevated);
      border: 1px solid var(--line);
      border-radius: 0.5rem;
      color: var(--ink-secondary);
      font-size: 0.8rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s ease;
      flex-shrink: 0;
    }

    .copy-btn:hover {
      background: var(--accent-soft);
      border-color: var(--accent);
      color: var(--accent);
    }

    .copy-btn.copied {
      background: var(--success-soft);
      border-color: var(--success);
      color: var(--success);
    }

    .copy-btn svg {
      flex-shrink: 0;
    }

    /* Availability Overview */
    .availability-overview {
      margin-top: 2rem;
      padding-top: 1.5rem;
      border-top: 1px solid var(--line);
    }

    .availability-overview h3 {
      font-family: "Cormorant Garamond", Georgia, serif;
      font-size: 1.25rem;
      margin-bottom: 1rem;
      color: var(--ink);
    }

    .best-times {
      display: flex;
      flex-wrap: wrap;
      gap: 0.75rem;
      margin-bottom: 1.5rem;
    }

    .best-time-card {
      background: linear-gradient(135deg, rgba(63, 185, 80, 0.15) 0%, rgba(63, 185, 80, 0.05) 100%);
      border: 1px solid rgba(63, 185, 80, 0.3);
      border-radius: 0.75rem;
      padding: 0.75rem 1rem;
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .best-time-card .duration {
      background: var(--success-soft);
      color: var(--success);
      padding: 0.25rem 0.5rem;
      border-radius: 0.5rem;
      font-size: 0.75rem;
      font-weight: 700;
    }

    .best-time-card .time-info {
      display: flex;
      flex-direction: column;
      gap: 0.15rem;
    }

    .best-time-card .time-range {
      font-weight: 600;
      color: var(--ink);
      font-size: 0.9rem;
    }

    .best-time-card .time-date {
      font-size: 0.8rem;
      color: var(--ink-muted);
    }

    .timeline-view {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .timeline-day {
      display: flex;
      align-items: center;
      gap: 1rem;
    }

    .timeline-label {
      width: 100px;
      font-size: 0.85rem;
      color: var(--ink-secondary);
      flex-shrink: 0;
    }

    .timeline-bar {
      flex: 1;
      height: 32px;
      background: var(--bg-elevated);
      border-radius: 0.5rem;
      position: relative;
      overflow: hidden;
      border: 1px solid var(--line);
    }

    .timeline-slot {
      position: absolute;
      top: 4px;
      bottom: 4px;
      background: linear-gradient(135deg, var(--accent) 0%, #c49545 100%);
      border-radius: 0.25rem;
      min-width: 4px;
    }

    .timeline-slot:hover {
      filter: brightness(1.1);
    }

    .timeline-hours {
      display: flex;
      justify-content: space-between;
      padding: 0.25rem 0;
      margin-left: 116px;
    }

    .timeline-hours span {
      font-size: 0.7rem;
      color: var(--ink-muted);
    }

    .date-grid {
      display: grid;
      gap: 1.25rem;
    }

    .date-card {
      border: 1px solid var(--line);
      border-radius: 1rem;
      padding: 1.5rem;
      background: var(--bg-elevated);
      display: grid;
      gap: 1rem;
      transition: border-color 0.2s ease;
    }

    .date-card:hover {
      border-color: rgba(212, 168, 85, 0.3);
    }

    .date-card h3 {
      font-family: "DM Sans", sans-serif;
      font-size: 1rem;
      font-weight: 600;
      color: var(--ink);
      margin: 0;
    }

    .date-header {
      display: flex;
      justify-content: space-between;
      gap: 1rem;
      align-items: flex-start;
    }

    .hidden {
      display: none !important;
    }

    .disabled {
      opacity: 0.4;
      pointer-events: none;
    }

    /* Scrollbar styling */
    ::-webkit-scrollbar {
      width: 8px;
      height: 8px;
    }

    ::-webkit-scrollbar-track {
      background: var(--bg);
    }

    ::-webkit-scrollbar-thumb {
      background: var(--line);
      border-radius: 4px;
    }

    ::-webkit-scrollbar-thumb:hover {
      background: var(--ink-muted);
    }

    /* Selection styling */
    ::selection {
      background: var(--accent-soft);
      color: var(--ink);
    }

    @media (max-width: 720px) {
      .shell {
        padding: 1.5rem 1rem 3rem;
      }

      .hero {
        padding: 1.75rem;
      }

      .hero::after {
        display: none;
      }

      h1 {
        font-size: 2rem;
      }

      .panel {
        padding: 1.5rem;
      }

      .panel-header {
        flex-direction: column;
        align-items: flex-start;
        gap: 0.75rem;
      }

      .row.split {
        flex-direction: column;
        gap: 1rem;
      }

      button {
        width: 100%;
      }

      .date-header {
        flex-direction: column;
      }
    }
  </style>`;
}

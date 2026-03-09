import { sharedStyles } from "./shared-styles";

export function renderRequestPage() {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Auto Invite - Share Your Availability</title>
    <meta name="description" content="Select your available times across timezones" />
    ${sharedStyles()}
    <style>
      .guest-status-list { display: grid; gap: 0.5rem; }
      .guest-status-row {
        display: flex; align-items: center; justify-content: space-between;
        padding: 0.6rem 0.75rem; background: var(--bg-elevated);
        border: 1px solid var(--line); border-radius: 0.75rem; font-size: 0.9rem;
      }
      .guest-status-row .name { font-weight: 600; color: var(--ink); }
      .guest-status-row .status-pill {
        padding: 0.2rem 0.6rem; border-radius: 999px; font-size: 0.75rem; font-weight: 600;
      }
      .status-submitted { background: var(--success-soft); color: var(--success); }
      .status-pending { background: rgba(139,148,158,0.15); color: var(--ink-muted); }
      .agg-grid { display: grid; gap: 0.75rem; margin: 1rem 0; }
      .agg-day { margin-bottom: 1rem; }
      .agg-day h4 { font-family: "DM Sans", sans-serif; font-size: 0.95rem; margin-bottom: 0.5rem; color: var(--ink); }
      .agg-slots { display: grid; gap: 0.4rem; }
      .agg-slot {
        display: flex; align-items: center; gap: 0.75rem; padding: 0.6rem 0.75rem;
        border-radius: 0.75rem; border: 1px solid var(--line); cursor: pointer;
        transition: all 0.2s ease; position: relative;
      }
      .agg-slot:hover { border-color: var(--accent); transform: translateX(2px); }
      .agg-slot.selected { border-color: var(--accent); background: var(--accent-soft); }
      .agg-slot .slot-time { font-weight: 600; font-size: 0.9rem; color: var(--ink); }
      .agg-slot .slot-count {
        padding: 0.15rem 0.5rem; border-radius: 999px; font-size: 0.75rem; font-weight: 700;
      }
      .count-full { background: var(--success-soft); color: var(--success); }
      .count-high { background: rgba(212,168,85,0.2); color: var(--accent); }
      .count-low { background: rgba(139,148,158,0.15); color: var(--ink-muted); }
      .agg-slot .slot-names { font-size: 0.8rem; color: var(--ink-muted); flex: 1; }
      .filter-row { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 1rem; flex-wrap: wrap; }
      .filter-row label { display: flex; align-items: center; gap: 0.5rem; text-transform: none; letter-spacing: 0; font-size: 0.85rem; }
      .filter-row select { padding: 0.4rem 0.6rem; font-size: 0.85rem; min-width: auto; }
      .confirm-form { display: grid; gap: 0.75rem; margin-top: 1rem; }
    </style>
  </head>
  <body>
    <main class="shell">
      <header class="hero">
        <a href="/new" class="eyebrow" style="text-decoration:none;">Auto Invite</a>
        <h1 id="page-title">Share your availability</h1>
        <p id="page-subhead" class="subhead">Select the times that work for you in your local timezone.</p>
      </header>

      <section id="state" class="panel subtle">
        <p style="color: var(--ink-secondary);">Loading request...</p>
      </section>

      <!-- ════════ GROUP GUEST PANEL ════════ -->
      <section id="group-guest-panel" class="panel hidden">
        <div class="panel-header">
          <h2>Select Your Available Times</h2>
          <span id="group-guest-timezone" class="pill"></span>
        </div>
        <section id="group-confirmed-guest" class="panel subtle hidden">
          <div class="panel-header"><h3>Meeting confirmed</h3></div>
          <div id="group-confirmed-guest-details" class="stack"></div>
        </section>
        <p id="group-guest-intro" class="subhead"></p>
        <div id="group-timezone-offset" class="timezone-offset-card hidden">
          <div class="timezone-offset-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"></circle>
              <polyline points="12 6 12 12 16 14"></polyline>
            </svg>
          </div>
          <div class="timezone-offset-content">
            <span id="group-timezone-offset-text"></span>
            <span id="group-timezone-offset-detail" class="timezone-offset-detail"></span>
          </div>
        </div>
        <div id="group-guest-notice" class="message success hidden"></div>
        <div id="group-guest-error" class="message error hidden"></div>
        <div id="group-date-list" class="date-grid"></div>
        <button id="group-submit-availability" class="primary">Submit Availability</button>
      </section>

      <!-- ════════ GROUP ADMIN PANEL ════════ -->
      <section id="group-admin-panel" class="panel hidden">
        <div class="panel-header">
          <h2>Group Availability Dashboard</h2>
          <span id="group-admin-timezone" class="pill"></span>
        </div>
        <div id="group-notification-banner" class="message success hidden"></div>

        <div class="panel subtle compact" style="margin-bottom:1.5rem;">
          <div class="panel-header">
            <h3>Guest Status</h3>
            <span id="guest-summary" class="muted"></span>
          </div>
          <div id="guest-status-list" class="guest-status-list"></div>
        </div>

        <div class="panel subtle compact" style="margin-bottom:1.5rem;">
          <div class="panel-header">
            <h3>Aggregated Availability</h3>
          </div>
          <div class="filter-row">
            <label>
              Min participants:
              <select id="min-participation-filter"></select>
            </label>
            <button class="secondary" type="button" id="refresh-aggregated">Refresh</button>
          </div>
          <div id="agg-grid" class="agg-grid">
            <p class="muted">Loading aggregated availability...</p>
          </div>
        </div>

        <section id="group-confirmed-host" class="panel subtle hidden" style="margin-bottom:1.5rem;">
          <div class="panel-header"><h3>Confirmed Meeting</h3></div>
          <div id="group-confirmed-host-details" class="stack"></div>
        </section>

        <div class="panel subtle compact" id="group-confirm-section">
          <div class="panel-header">
            <h3>Confirm Meeting</h3>
            <span class="pill">Admin</span>
          </div>
          <p id="selected-slot-info" class="muted">Click a time slot above to select it.</p>
          <div class="confirm-form">
            <label>
              Meeting title
              <input id="group-meeting-title" placeholder="Team Sync" />
            </label>
            <label>
              Location or video link
              <input id="group-meeting-location" placeholder="Zoom link or address" />
            </label>
            <label>
              Notes
              <textarea id="group-meeting-description" rows="2" placeholder="Optional agenda"></textarea>
            </label>
            <div id="group-confirm-error" class="message error hidden"></div>
            <div id="group-confirm-status" class="message success hidden"></div>
            <button class="primary" type="button" id="group-confirm-btn" disabled>Confirm Selected Slot</button>
          </div>
        </div>

        <button id="group-export-ics" class="secondary" style="margin-top:1rem;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;margin-right:0.5rem;">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="7 10 12 15 17 10"></polyline>
            <line x1="12" y1="15" x2="12" y2="3"></line>
          </svg>
          Export to Calendar (.ics)
        </button>

        <div class="panel subtle" style="margin-top:1.5rem;">
          <div class="panel-header">
            <h3>Manage Request</h3>
            <span class="pill">Admin</span>
          </div>
          <div id="group-edit-error" class="message error hidden"></div>
          <button class="ghost danger" type="button" id="group-delete-request">Delete Request</button>
        </div>
      </section>

      <!-- ════════ INDIVIDUAL GUEST PANEL ════════ -->
      <section id="guest-panel" class="panel hidden">
        <div class="panel-header">
          <h2>Select Your Times</h2>
          <span id="guest-timezone" class="pill"></span>
        </div>
        <section id="confirmed-guest" class="panel subtle hidden">
          <div class="panel-header">
            <h3>Meeting confirmed</h3>
            <a id="confirmed-guest-link" class="button secondary" target="_blank" rel="noreferrer">
              Add to Google Calendar
            </a>
          </div>
          <div id="confirmed-guest-details" class="stack"></div>
        </section>
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

      <!-- ════════ INDIVIDUAL HOST PANEL ════════ -->
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
        <section id="confirmed-host" class="panel subtle hidden" style="margin-top: 1.5rem;">
          <div class="panel-header">
            <h3>Confirmed meeting</h3>
            <a id="confirmed-host-link" class="button secondary" target="_blank" rel="noreferrer">
              Add to Google Calendar
            </a>
          </div>
          <div id="confirmed-host-details" class="stack"></div>
        </section>
        <button id="export-ics" class="secondary hidden" style="margin-top: 1rem;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: middle; margin-right: 0.5rem;">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="7 10 12 15 17 10"></polyline>
            <line x1="12" y1="15" x2="12" y2="3"></line>
          </svg>
          Export to Calendar (.ics)
        </button>
        <div class="panel subtle" style="margin-top: 1.5rem;">
          <div class="panel-header">
            <h3>Calendar details</h3>
            <span class="pill">Admin</span>
          </div>
          <div class="stack">
            <label>
              Meeting title
              <input id="meeting-title" placeholder="Meeting with guest" />
            </label>
            <label>
              Location or video link
              <input id="meeting-location" placeholder="Zoom link or address" />
            </label>
            <label>
              Notes
              <textarea id="meeting-description" rows="3" placeholder="Optional agenda"></textarea>
            </label>
          </div>
          <div id="confirm-status" class="message success hidden" style="margin-top: 1rem;"></div>
        </div>
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
      // ── Common elements ──
      const state = document.getElementById("state");
      const pageTitle = document.getElementById("page-title");
      const pageSubhead = document.getElementById("page-subhead");

      const requestId = location.pathname.split("/")[2];
      const params = new URLSearchParams(location.search);
      const adminToken = params.get("admin");
      const guestToken = params.get("guest");
      const guestTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

      // ── Shared helpers ──
      function formatParts(date, timeZone) {
        const dtf = new Intl.DateTimeFormat("en-US", {
          timeZone, year: "numeric", month: "2-digit", day: "2-digit",
          hour: "2-digit", minute: "2-digit", hour12: false,
        });
        const parts = dtf.formatToParts(date);
        const v = Object.fromEntries(parts.map((p) => [p.type, p.value]));
        return { date: v.year + "-" + v.month + "-" + v.day, time: v.hour + ":" + v.minute };
      }

      function getTimeZoneOffset(timeZone, date) {
        const utc = formatParts(date, "UTC");
        const zoned = formatParts(date, timeZone);
        const utcMs = Date.UTC(+utc.date.slice(0,4), +utc.date.slice(5,7)-1, +utc.date.slice(8,10), +utc.time.slice(0,2), +utc.time.slice(3,5));
        const zonedMs = Date.UTC(+zoned.date.slice(0,4), +zoned.date.slice(5,7)-1, +zoned.date.slice(8,10), +zoned.time.slice(0,2), +zoned.time.slice(3,5));
        return (zonedMs - utcMs) / 60000;
      }

      function zonedTimeToUtc(dateStr, timeStr, tz) {
        const [y, m, d] = dateStr.split("-").map(Number);
        const [h, mi] = timeStr.split(":").map(Number);
        const utcGuess = new Date(Date.UTC(y, m-1, d, h, mi));
        const offset = getTimeZoneOffset(tz, utcGuess);
        return new Date(utcGuess.getTime() - offset * 60000);
      }

      function addDays(dateStr, days) {
        const [y, m, d] = dateStr.split("-").map(Number);
        const dt = new Date(Date.UTC(y, m-1, d));
        dt.setUTCDate(dt.getUTCDate() + days);
        return dt.toISOString().slice(0, 10);
      }

      function timeToMinutes(v) { const [h, m] = v.split(":").map(Number); return h * 60 + m; }

      function formatRange(startUtc, endUtc, tz) {
        const s = formatParts(new Date(startUtc), tz);
        const e = formatParts(new Date(endUtc), tz);
        return s.date === e.date ? s.date + " " + s.time + " - " + e.time : s.date + " " + s.time + " -> " + e.date + " " + e.time;
      }

      function formatDayName(dateStr) {
        const [y, m, d] = dateStr.split("-").map(Number);
        return new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(new Date(y, m-1, d));
      }

      function toGoogleCalendarDate(iso) { return iso.replace(/[-:]/g, "").replace(/\\.\\d{3}Z$/, "Z"); }

      function buildGoogleCalendarUrl(slot) {
        const p = new URLSearchParams({ action: "TEMPLATE", text: slot.title, dates: toGoogleCalendarDate(slot.startUtc) + "/" + toGoogleCalendarDate(slot.endUtc), details: slot.description || "", location: slot.location || "" });
        return "https://calendar.google.com/calendar/render?" + p.toString();
      }

      function buildAllowedByDate(request, tz) {
        const map = {};
        const windows = request.allowedTimeWindows.length ? request.allowedTimeWindows : [{ startTime: "00:00", endTime: "23:59" }];
        let current = request.allowedDateStart;
        while (current <= request.allowedDateEnd) {
          windows.forEach((w) => {
            const startUtc = zonedTimeToUtc(current, w.startTime, request.hostTimezone);
            const endUtc = zonedTimeToUtc(current, w.endTime, request.hostTimezone);
            if (endUtc <= startUtc) return;
            const sg = formatParts(startUtc, tz);
            const eg = formatParts(endUtc, tz);
            if (sg.date === eg.date) {
              map[sg.date] = map[sg.date] || [];
              map[sg.date].push({ startTime: sg.time, endTime: eg.time });
            } else {
              map[sg.date] = map[sg.date] || [];
              map[sg.date].push({ startTime: sg.time, endTime: "23:59" });
              map[eg.date] = map[eg.date] || [];
              map[eg.date].push({ startTime: "00:00", endTime: eg.time });
            }
          });
          current = addDays(current, 1);
        }
        Object.keys(map).forEach((d) => map[d].sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime)));
        return map;
      }

      function displayTimezoneOffsetIn(cardEl, textEl, detailEl, hostTz, hostName) {
        const now = new Date();
        const gOff = getTimeZoneOffset(guestTimezone, now);
        const hOff = getTimeZoneOffset(hostTz, now);
        const diff = gOff - hOff;
        const hours = Math.floor(Math.abs(diff) / 60);
        const mins = Math.round(Math.abs(diff) % 60);
        if (diff === 0) {
          textEl.textContent = "You're in the same timezone";
          detailEl.textContent = "Both you and " + hostName + " are in " + guestTimezone.replace(/_/g, " ");
          cardEl.classList.add("same-tz");
        } else {
          const dir = diff > 0 ? "ahead of" : "behind";
          const minText = mins > 0 ? " " + mins + " min" : "";
          textEl.textContent = "You are " + hours + minText + " " + (hours === 1 ? "hour" : "hours") + " " + dir + " " + hostName;
          detailEl.textContent = "Your time: " + guestTimezone.replace(/_/g, " ") + " · Host: " + hostTz.replace(/_/g, " ");
          cardEl.classList.remove("same-tz");
        }
        cardEl.classList.remove("hidden");
      }

      // ══════════════════════════════════════════════
      //  GROUP GUEST FLOW (guestToken present)
      // ══════════════════════════════════════════════
      async function initGroupGuest() {
        pageTitle.textContent = "Share your availability";
        pageSubhead.textContent = "Select the times that work for you in your local timezone.";

        const url = "/api/request/" + requestId + "?guest=" + encodeURIComponent(guestToken);
        const resp = await fetch(url);
        if (!resp.ok) {
          state.textContent = "Request not found or invalid guest link.";
          return;
        }
        const data = await resp.json();
        state.classList.add("hidden");

        const panel = document.getElementById("group-guest-panel");
        panel.classList.remove("hidden");
        document.getElementById("group-guest-timezone").textContent = "Your timezone: " + guestTimezone.replace(/_/g, " ");

        const startDay = formatDayName(data.allowedDateStart);
        const endDay = formatDayName(data.allowedDateEnd);
        const intro = data.allowedDateStart === data.allowedDateEnd
          ? data.hostName + " wants to know your availability on " + startDay + "."
          : data.hostName + " wants to know your availability from " + startDay + " to " + endDay + ".";
        document.getElementById("group-guest-intro").textContent = intro;

        displayTimezoneOffsetIn(
          document.getElementById("group-timezone-offset"),
          document.getElementById("group-timezone-offset-text"),
          document.getElementById("group-timezone-offset-detail"),
          data.hostTimezone, data.hostName
        );

        const noticeEl = document.getElementById("group-guest-notice");
        if (data.hasSubmitted) {
          noticeEl.textContent = "You already submitted availability. Submitting again will replace it.";
          noticeEl.classList.remove("hidden");
        }

        renderGroupGuestDates(data);
      }

      function renderGroupGuestDates(data) {
        const allowedByDate = buildAllowedByDate(data, guestTimezone);
        const dates = Object.keys(allowedByDate).sort();
        const dateList = document.getElementById("group-date-list");
        const errorEl = document.getElementById("group-guest-error");
        dateList.innerHTML = "";

        if (!dates.length) {
          dateList.textContent = "No available dates found.";
          return;
        }

        dates.forEach((date) => {
          const card = document.createElement("div");
          card.className = "date-card";
          const allowedList = allowedByDate[date].map((w) => w.startTime + " - " + w.endTime).join(", ");
          card.innerHTML = '<div class="date-header"><div><h3>' + date + '</h3><p class="hint">' + data.hostName + "\\'s window: " + allowedList + "</p></div>" +
            '<button class="secondary" type="button">Add time</button></div><div class="stack" data-date="' + date + '"></div>';
          const addBtn = card.querySelector("button");
          const list = card.querySelector("[data-date]");
          addBtn.addEventListener("click", () => addGuestRangeRow(list, allowedByDate[date]));
          addGuestRangeRow(list, allowedByDate[date]);
          dateList.appendChild(card);
        });

        document.getElementById("group-submit-availability").onclick = async () => {
          errorEl.classList.add("hidden");
          let selections = [];
          try {
            dates.forEach((date) => {
              const container = dateList.querySelector('[data-date="' + date + '"]');
              container.querySelectorAll(".row").forEach((row) => {
                const inputs = row.querySelectorAll("input");
                const st = inputs[0].value;
                const en = inputs[1].value;
                if (!st || !en) return;
                if (timeToMinutes(en) <= timeToMinutes(st)) throw new Error("End must be after start.");
                selections.push({
                  startUtc: zonedTimeToUtc(date, st, guestTimezone).toISOString(),
                  endUtc: zonedTimeToUtc(date, en, guestTimezone).toISOString(),
                });
              });
            });
          } catch (e) {
            errorEl.textContent = e.message;
            errorEl.classList.remove("hidden");
            return;
          }
          if (!selections.length) {
            errorEl.textContent = "Add at least one availability range before submitting.";
            errorEl.classList.remove("hidden");
            return;
          }

          const resp = await fetch("/api/request/" + requestId + "/guest-submit?guest=" + encodeURIComponent(guestToken), {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ availability: selections, guestTimezone }),
          });

          if (!resp.ok) {
            const d = await resp.json().catch(() => ({}));
            errorEl.textContent = d.error || "Unable to submit.";
            errorEl.classList.remove("hidden");
            return;
          }
          state.classList.remove("hidden");
          state.textContent = "Thanks! Your availability has been sent.";
          document.getElementById("group-guest-panel").classList.add("hidden");
        };
      }

      function addGuestRangeRow(container, allowedWindows) {
        const row = document.createElement("div");
        row.className = "row";

        const select = document.createElement("select");
        select.className = "window-select";
        allowedWindows.forEach((w, i) => {
          const opt = document.createElement("option");
          opt.value = String(i);
          opt.textContent = w.startTime + " - " + w.endTime;
          select.appendChild(opt);
        });

        const startInput = document.createElement("input");
        startInput.type = "time"; startInput.className = "time";
        const sep = document.createElement("span");
        sep.className = "muted"; sep.textContent = "to";
        const endInput = document.createElement("input");
        endInput.type = "time"; endInput.className = "time";
        const removeBtn = document.createElement("button");
        removeBtn.type = "button"; removeBtn.className = "ghost"; removeBtn.textContent = "Remove";
        removeBtn.addEventListener("click", () => row.remove());

        function applyWindow(w) {
          startInput.min = w.startTime; startInput.max = w.endTime;
          endInput.min = w.startTime; endInput.max = w.endTime;
          if (!startInput.value || startInput.value < w.startTime || startInput.value > w.endTime) startInput.value = w.startTime;
          if (!endInput.value || endInput.value < startInput.value || endInput.value > w.endTime) endInput.value = w.endTime;
          endInput.min = startInput.value;
        }

        select.addEventListener("change", () => applyWindow(allowedWindows[Number(select.value)]));
        startInput.addEventListener("change", () => {
          const w = allowedWindows[Number(select.value)];
          endInput.min = startInput.value || w.startTime;
          if (endInput.value < endInput.min) endInput.value = endInput.min;
        });
        applyWindow(allowedWindows[0]);

        row.appendChild(select);
        row.appendChild(startInput);
        row.appendChild(sep);
        row.appendChild(endInput);
        row.appendChild(removeBtn);
        container.appendChild(row);
      }

      // ══════════════════════════════════════════════
      //  GROUP ADMIN FLOW
      // ══════════════════════════════════════════════
      let groupRequestData = null;
      let selectedSlot = null;

      async function initGroupAdmin(requestData) {
        groupRequestData = requestData;
        pageTitle.textContent = "Group Availability Dashboard";
        pageSubhead.textContent = "View aggregated availability and confirm the best meeting time.";

        const panel = document.getElementById("group-admin-panel");
        panel.classList.remove("hidden");
        document.getElementById("group-admin-timezone").textContent = "Host: " + requestData.hostTimezone;

        await loadAggregatedData();
        connectGroupAdminWebSocket();

        // Export button
        document.getElementById("group-export-ics").onclick = () => {
          window.location.href = "/api/request/" + requestId + "/export.ics?admin=" + encodeURIComponent(adminToken);
        };

        // Confirm button
        document.getElementById("group-confirm-btn").addEventListener("click", confirmGroupSlot);

        // Refresh button
        document.getElementById("refresh-aggregated").addEventListener("click", loadAggregatedData);

        // Delete button
        document.getElementById("group-delete-request").addEventListener("click", async () => {
          if (!confirm("Delete this request? This cannot be undone.")) return;
          const errEl = document.getElementById("group-edit-error");
          const resp = await fetch("/api/request/" + requestId + "?admin=" + encodeURIComponent(adminToken), { method: "DELETE" });
          if (!resp.ok) {
            const d = await resp.json().catch(() => ({}));
            errEl.textContent = d.error || "Unable to delete.";
            errEl.classList.remove("hidden");
            return;
          }
          panel.classList.add("hidden");
          state.classList.remove("hidden");
          state.textContent = "Request deleted.";
        });

        // Min participation filter change
        document.getElementById("min-participation-filter").addEventListener("change", loadAggregatedData);
      }

      async function loadAggregatedData() {
        const minFilter = document.getElementById("min-participation-filter").value || "";
        let url = "/api/request/" + requestId + "/aggregated?admin=" + encodeURIComponent(adminToken);
        if (minFilter) url += "&minParticipation=" + minFilter;

        const resp = await fetch(url);
        if (!resp.ok) {
          document.getElementById("agg-grid").innerHTML = '<p class="muted">Unable to load aggregated data.</p>';
          return;
        }
        const data = await resp.json();

        // Render guest status
        renderGuestStatus(data.guestStatus || [], data.totalGuests, data.submittedCount);

        // Update filter options
        updateFilterOptions(data.totalGuests);

        // Render aggregated slots
        renderAggregatedSlots(data.slots || [], data.totalGuests, data.guestStatus || []);

        // Show confirmed meeting if present
        if (groupRequestData && groupRequestData.confirmed) {
          document.getElementById("group-confirm-section").classList.add("hidden");
        }
      }

      function renderGuestStatus(guestStatus, total, submitted) {
        document.getElementById("guest-summary").textContent = submitted + "/" + total + " submitted";
        const list = document.getElementById("guest-status-list");
        list.innerHTML = "";
        guestStatus.forEach((g) => {
          const row = document.createElement("div");
          row.className = "guest-status-row";
          const statusClass = g.status === "submitted" ? "status-submitted" : "status-pending";
          const timeInfo = g.submittedAt ? " · " + new Date(g.submittedAt).toLocaleString() : "";
          row.innerHTML = '<span class="name">' + g.name + ' <span class="muted" style="font-weight:400;font-size:0.8rem;">' + g.email + '</span></span>' +
            '<span class="status-pill ' + statusClass + '">' + g.status + timeInfo + '</span>';
          list.appendChild(row);
        });
      }

      function updateFilterOptions(totalGuests) {
        const select = document.getElementById("min-participation-filter");
        const current = select.value;
        select.innerHTML = '<option value="">All</option>';
        for (let i = 1; i <= totalGuests; i++) {
          const opt = document.createElement("option");
          opt.value = String(i);
          opt.textContent = i + (i === totalGuests ? " (all)" : "");
          select.appendChild(opt);
        }
        if (current) select.value = current;
      }

      function renderAggregatedSlots(slots, totalGuests, guestStatus) {
        const grid = document.getElementById("agg-grid");
        grid.innerHTML = "";

        if (!slots.length) {
          grid.innerHTML = '<p class="muted">No overlapping availability found yet.</p>';
          return;
        }

        // Group slots by date in host timezone
        const byDate = {};
        slots.forEach((slot) => {
          const sp = formatParts(new Date(slot.startUtc), groupRequestData.hostTimezone);
          if (!byDate[sp.date]) byDate[sp.date] = [];
          byDate[sp.date].push(slot);
        });

        // Build a token-to-name map from guestStatus
        const nameMap = {};
        guestStatus.forEach((g) => { nameMap[g.token] = g.name; });

        Object.keys(byDate).sort().forEach((date) => {
          const dayDiv = document.createElement("div");
          dayDiv.className = "agg-day";
          dayDiv.innerHTML = '<h4>' + formatDayName(date) + ', ' + date + '</h4>';
          const slotsDiv = document.createElement("div");
          slotsDiv.className = "agg-slots";

          byDate[date].forEach((slot) => {
            const sp = formatParts(new Date(slot.startUtc), groupRequestData.hostTimezone);
            const ep = formatParts(new Date(slot.endUtc), groupRequestData.hostTimezone);
            const names = (slot.participantTokens || []).map((t) => nameMap[t] || t).join(", ");
            const countClass = slot.participantCount === totalGuests ? "count-full"
              : slot.participantCount >= totalGuests * 0.5 ? "count-high" : "count-low";

            const el = document.createElement("div");
            el.className = "agg-slot";
            el.setAttribute("data-start", slot.startUtc);
            el.setAttribute("data-end", slot.endUtc);
            el.innerHTML = '<span class="slot-count ' + countClass + '">' + slot.participantCount + '/' + totalGuests + '</span>' +
              '<span class="slot-time">' + sp.time + ' - ' + ep.time + '</span>' +
              '<span class="slot-names">' + names + '</span>';
            el.addEventListener("click", () => selectSlot(el, slot));
            slotsDiv.appendChild(el);
          });

          dayDiv.appendChild(slotsDiv);
          grid.appendChild(dayDiv);
        });
      }

      function selectSlot(el, slot) {
        // Deselect previous
        document.querySelectorAll(".agg-slot.selected").forEach((s) => s.classList.remove("selected"));
        el.classList.add("selected");
        selectedSlot = slot;
        const sp = formatParts(new Date(slot.startUtc), groupRequestData.hostTimezone);
        const ep = formatParts(new Date(slot.endUtc), groupRequestData.hostTimezone);
        document.getElementById("selected-slot-info").textContent = "Selected: " + sp.date + " " + sp.time + " - " + ep.time + " (" + slot.participantCount + " available)";
        document.getElementById("group-confirm-btn").disabled = false;
      }

      async function confirmGroupSlot() {
        if (!selectedSlot) return;
        const errEl = document.getElementById("group-confirm-error");
        const statusEl = document.getElementById("group-confirm-status");
        errEl.classList.add("hidden");
        statusEl.classList.add("hidden");

        const payload = {
          startUtc: selectedSlot.startUtc,
          endUtc: selectedSlot.endUtc,
          title: document.getElementById("group-meeting-title").value,
          description: document.getElementById("group-meeting-description").value,
          location: document.getElementById("group-meeting-location").value,
        };

        const resp = await fetch("/api/request/" + requestId + "/confirm?admin=" + encodeURIComponent(adminToken), {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!resp.ok) {
          const d = await resp.json().catch(() => ({}));
          errEl.textContent = d.error || "Unable to confirm.";
          errEl.classList.remove("hidden");
          return;
        }

        statusEl.textContent = "Meeting confirmed!";
        statusEl.classList.remove("hidden");
        document.getElementById("group-confirm-btn").disabled = true;

        // Show confirmed details
        const confirmedEl = document.getElementById("group-confirmed-host");
        const detailsEl = document.getElementById("group-confirmed-host-details");
        const hostTime = formatRange(payload.startUtc, payload.endUtc, groupRequestData.hostTimezone);
        detailsEl.innerHTML =
          '<div class="row"><strong>Title:</strong> ' + (payload.title || "Untitled") + '</div>' +
          '<div class="row"><strong>Time:</strong> ' + hostTime + '</div>' +
          '<div class="row"><strong>Location:</strong> ' + (payload.location || "Not set") + '</div>';
        confirmedEl.classList.remove("hidden");
        document.getElementById("group-confirm-section").classList.add("hidden");
      }

      function connectGroupAdminWebSocket() {
        const wsUrl = new URL("/ws/" + requestId, location.origin);
        wsUrl.protocol = location.protocol === "https:" ? "wss:" : "ws:";
        wsUrl.searchParams.set("admin", adminToken);

        const ws = new WebSocket(wsUrl.toString());
        const banner = document.getElementById("group-notification-banner");

        ws.addEventListener("message", async (event) => {
          const msg = JSON.parse(event.data);
          if (msg.type === "guest-submission") {
            banner.textContent = msg.guestName + (msg.action === "new" ? " submitted" : " updated") + " their availability";
            banner.classList.remove("hidden");
            setTimeout(() => banner.classList.add("hidden"), 5000);
            await loadAggregatedData();
          } else if (msg.type === "confirmation") {
            banner.textContent = "Meeting confirmed: " + msg.title;
            banner.classList.remove("hidden");
          }
        });

        ws.addEventListener("close", () => setTimeout(connectGroupAdminWebSocket, 3000));
      }

      // ══════════════════════════════════════════════
      //  INDIVIDUAL FLOW (original code)
      // ══════════════════════════════════════════════
      let currentRequest = null;

      function renderConfirmedSlot(request, slot) {
        const confirmedGuestSection = document.getElementById("confirmed-guest");
        const confirmedGuestLink = document.getElementById("confirmed-guest-link");
        const confirmedGuestDetails = document.getElementById("confirmed-guest-details");
        const confirmedHostSection = document.getElementById("confirmed-host");
        const confirmedHostLink = document.getElementById("confirmed-host-link");
        const confirmedHostDetails = document.getElementById("confirmed-host-details");

        if (!slot) {
          confirmedGuestSection.classList.add("hidden");
          confirmedHostSection.classList.add("hidden");
          return;
        }
        const hostTime = formatRange(slot.startUtc, slot.endUtc, request.hostTimezone);
        const gt = formatRange(slot.startUtc, slot.endUtc, guestTimezone);
        const html = '<div class="row"><strong>Title:</strong> ' + slot.title + '</div>' +
          '<div class="row"><strong>Host time:</strong> ' + hostTime + '</div>' +
          '<div class="row"><strong>Your time:</strong> ' + gt + '</div>' +
          '<div class="row"><strong>Location:</strong> ' + (slot.location || "Not set") + '</div>' +
          '<div class="row"><strong>Notes:</strong> ' + (slot.description || "None") + '</div>';
        const url = buildGoogleCalendarUrl(slot);
        confirmedGuestDetails.innerHTML = html;
        confirmedGuestLink.href = url;
        confirmedGuestSection.classList.remove("hidden");
        confirmedHostDetails.innerHTML = html;
        confirmedHostLink.href = url;
        confirmedHostSection.classList.remove("hidden");
      }

      async function confirmSlot(slot) {
        if (!adminToken) return;
        const meetingTitle = document.getElementById("meeting-title");
        const meetingDescription = document.getElementById("meeting-description");
        const meetingLocation = document.getElementById("meeting-location");
        const payload = {
          startUtc: slot.startUtc, endUtc: slot.endUtc,
          title: meetingTitle.value, description: meetingDescription.value, location: meetingLocation.value,
        };
        const resp = await fetch("/api/request/" + requestId + "/confirm?admin=" + encodeURIComponent(adminToken), {
          method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload),
        });
        if (!resp.ok) {
          const editError = document.getElementById("edit-error");
          editError.textContent = "Unable to confirm this slot.";
          editError.classList.remove("hidden");
          return;
        }
        const updated = { ...payload, title: payload.title || "Meeting: " + currentRequest.hostName + " + " + currentRequest.guestName, confirmedAt: new Date().toISOString() };
        currentRequest.confirmedSlot = updated;
        renderConfirmedSlot(currentRequest, updated);
        const cs = document.getElementById("confirm-status");
        cs.textContent = "Meeting confirmed and ready to add to calendar.";
        cs.classList.remove("hidden");
        setTimeout(() => cs.classList.add("hidden"), 4000);
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
            const banner = document.getElementById("notification-banner");
            banner.textContent = msg.guestName + (msg.action === "new" ? " submitted" : " updated") + " their availability";
            banner.classList.remove("hidden");
            setTimeout(() => banner.classList.add("hidden"), 5000);
            if (currentRequest) await loadSubmission(currentRequest);
          }
        });
        ws.addEventListener("close", () => setTimeout(connectWebSocket, 3000));
      }

      async function loadSubmission(request) {
        const availabilityList = document.getElementById("availability-list");
        const exportIcsButton = document.getElementById("export-ics");
        const resp = await fetch("/api/request/" + requestId + "/availability?admin=" + encodeURIComponent(adminToken));
        if (!resp.ok) {
          availabilityList.textContent = "No submission yet.";
          exportIcsButton.classList.add("hidden");
          return;
        }
        const submission = await resp.json();
        const items = submission.availability.slice().sort((a, b) => a.startUtc.localeCompare(b.startUtc));
        const submittedAt = new Date(submission.submittedAt).toLocaleString();
        const updatedAt = submission.updatedAt ? new Date(submission.updatedAt).toLocaleString() : "";
        const updatedLine = updatedAt ? '<div class="row"><strong>Updated:</strong> ' + updatedAt + '</div>' : "";
        availabilityList.innerHTML = "";
        const meta = document.createElement("div");
        meta.className = "stack";
        meta.innerHTML = '<div class="row"><strong>Submitted:</strong> ' + submittedAt + '</div>' + updatedLine;
        availabilityList.appendChild(meta);
        const list = document.createElement("div");
        list.className = "stack";
        items.forEach((entry) => {
          const row = document.createElement("div");
          row.className = "row split";
          row.innerHTML = '<div><p class="label">Host time</p><p>' + formatRange(entry.startUtc, entry.endUtc, request.hostTimezone) + '</p></div>' +
            '<div><p class="label">Guest time</p><p>' + formatRange(entry.startUtc, entry.endUtc, submission.guestTimezone) + '</p></div>' +
            '<div class="stack"><button class="secondary" type="button">Select slot</button><span class="hint">Creates a calendar link</span></div>';
          row.querySelector("button").addEventListener("click", () => confirmSlot(entry));
          list.appendChild(row);
        });
        availabilityList.appendChild(list);
        exportIcsButton.classList.remove("hidden");
        exportIcsButton.onclick = () => { window.location.href = "/api/request/" + requestId + "/export.ics?admin=" + encodeURIComponent(adminToken); };
        renderAvailabilityOverview(items, request.hostTimezone);
      }

      function renderAvailabilityOverview(items, hostTimezone) {
        const overview = document.getElementById("availability-overview");
        const bestTimesContainer = document.getElementById("best-times");
        const timelineView = document.getElementById("timeline-view");
        if (!items.length) { overview.classList.add("hidden"); return; }
        const byDate = {};
        items.forEach((item) => {
          const sd = formatParts(new Date(item.startUtc), hostTimezone).date;
          if (!byDate[sd]) byDate[sd] = [];
          byDate[sd].push(item);
        });
        const slotsWithDuration = items.map((item) => {
          const dur = new Date(item.endUtc) - new Date(item.startUtc);
          return { ...item, durationMs: dur, durationHours: dur / 3600000 };
        });
        const bestSlots = [...slotsWithDuration].sort((a, b) => b.durationMs - a.durationMs).slice(0, 3);
        bestTimesContainer.innerHTML = "";
        bestSlots.forEach((slot) => {
          const sp = formatParts(new Date(slot.startUtc), hostTimezone);
          const ep = formatParts(new Date(slot.endUtc), hostTimezone);
          const h = Math.floor(slot.durationHours);
          const m = Math.round((slot.durationHours - h) * 60);
          const card = document.createElement("div");
          card.className = "best-time-card";
          card.innerHTML = '<span class="duration">' + (m > 0 ? h + "h " + m + "m" : h + "h") + '</span>' +
            '<div class="time-info"><span class="time-range">' + sp.time + " - " + ep.time + '</span>' +
            '<span class="time-date">' + formatDayName(sp.date) + ", " + sp.date + '</span></div>';
          bestTimesContainer.appendChild(card);
        });
        const dates = Object.keys(byDate).sort();
        timelineView.innerHTML = "";
        const hoursRow = document.createElement("div");
        hoursRow.className = "timeline-hours";
        hoursRow.innerHTML = '<span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>24:00</span>';
        timelineView.appendChild(hoursRow);
        dates.forEach((date) => {
          const row = document.createElement("div"); row.className = "timeline-day";
          const label = document.createElement("div"); label.className = "timeline-label";
          label.textContent = formatDayName(date).slice(0, 3) + " " + date.slice(5);
          const bar = document.createElement("div"); bar.className = "timeline-bar";
          byDate[date].forEach((slot) => {
            const sp = formatParts(new Date(slot.startUtc), hostTimezone);
            const ep = formatParts(new Date(slot.endUtc), hostTimezone);
            const startMins = timeToMinutes(sp.time);
            const endMins = timeToMinutes(ep.time);
            const el = document.createElement("div"); el.className = "timeline-slot";
            el.style.left = (startMins / 1440) * 100 + "%";
            el.style.width = Math.max((endMins - startMins) / 1440 * 100, 0.5) + "%";
            el.title = sp.time + " - " + ep.time;
            bar.appendChild(el);
          });
          row.appendChild(label); row.appendChild(bar);
          timelineView.appendChild(row);
        });
        overview.classList.remove("hidden");
      }

      function renderGuestSelection(request) {
        const dateList = document.getElementById("date-list");
        const guestError = document.getElementById("guest-error");
        const allowedByDate = buildAllowedByDate(request, guestTimezone);
        const dates = Object.keys(allowedByDate).sort();
        dateList.innerHTML = "";
        if (!dates.length) { dateList.textContent = "No available dates were found."; return; }
        dates.forEach((date) => {
          const card = document.createElement("div"); card.className = "date-card";
          const allowedList = allowedByDate[date].map((w) => w.startTime + " - " + w.endTime).join(", ");
          card.innerHTML = '<div class="date-header"><div><h3>' + date + '</h3><p class="hint">' + request.hostName + "\\'s availability: " + allowedList + '</p></div><button class="secondary" type="button">Add time</button></div><div class="stack" data-date="' + date + '"></div>';
          const addBtn = card.querySelector("button");
          const list = card.querySelector("[data-date]");
          addBtn.addEventListener("click", () => addGuestRangeRow(list, allowedByDate[date]));
          addGuestRangeRow(list, allowedByDate[date]);
          dateList.appendChild(card);
        });

        document.getElementById("submit-availability").onclick = async () => {
          guestError.classList.add("hidden");
          let selections = [];
          try {
            dates.forEach((date) => {
              const container = dateList.querySelector('[data-date="' + date + '"]');
              container.querySelectorAll(".row").forEach((row) => {
                const inputs = row.querySelectorAll("input");
                const st = inputs[0].value;
                const en = inputs[1].value;
                if (!st || !en) return;
                if (timeToMinutes(en) <= timeToMinutes(st)) throw new Error("Each time range must have an end after the start.");
                const aw = allowedByDate[date];
                const ok = aw.some((w) => timeToMinutes(st) >= timeToMinutes(w.startTime) && timeToMinutes(en) <= timeToMinutes(w.endTime));
                if (!ok) throw new Error("Time range " + st + "-" + en + " on " + date + " is outside allowed windows.");
                selections.push({ startUtc: zonedTimeToUtc(date, st, guestTimezone).toISOString(), endUtc: zonedTimeToUtc(date, en, guestTimezone).toISOString() });
              });
            });
          } catch (e) {
            guestError.textContent = e.message;
            guestError.classList.remove("hidden");
            return;
          }
          if (!selections.length) {
            guestError.textContent = "Add at least one availability range before submitting.";
            guestError.classList.remove("hidden");
            return;
          }
          const resp = await fetch("/api/request/" + requestId + "/submit", {
            method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({ availability: selections, guestTimezone }),
          });
          if (!resp.ok) {
            const d = await resp.json().catch(() => ({}));
            guestError.textContent = d.error || "Unable to submit availability.";
            guestError.classList.remove("hidden");
            return;
          }
          state.classList.remove("hidden");
          state.textContent = "Thanks! Your availability has been sent.";
          document.getElementById("guest-panel").classList.add("hidden");
        };
      }

      // ── Individual admin: edit form setup ──
      function setupIndividualEditForm(request) {
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
        const hostTimezoneBadge = document.getElementById("host-timezone");

        function addEditWindowRow(start = "", end = "") {
          const row = document.createElement("div"); row.className = "row";
          row.innerHTML = '<input type="time" class="time" value="' + start + '" /><span class="muted">to</span><input type="time" class="time" value="' + end + '" /><button type="button" class="ghost danger">Remove</button>';
          row.querySelector("button").addEventListener("click", () => row.remove());
          editWindows.appendChild(row);
        }

        function applyEditFullDayToggle() {
          if (editFullDayToggle.checked) {
            editWindows.innerHTML = ""; editAddWindow.disabled = true; editWindows.classList.add("disabled");
          } else {
            editAddWindow.disabled = false; editWindows.classList.remove("disabled");
            if (!editWindows.children.length) addEditWindowRow("09:00", "17:00");
          }
        }

        const isFullDay = request.allowedTimeWindows.length === 1 && request.allowedTimeWindows[0].startTime === "00:00" && request.allowedTimeWindows[0].endTime === "23:59";
        editHostName.value = request.hostName;
        editGuestName.value = request.guestName;
        editGuestEmail.value = request.guestEmail;
        editHostTimezone.value = request.hostTimezone;
        editDateStart.value = request.allowedDateStart;
        editDateEnd.value = request.allowedDateEnd;
        editWindows.innerHTML = "";
        editFullDayToggle.checked = isFullDay;
        if (!isFullDay) request.allowedTimeWindows.forEach((w) => addEditWindowRow(w.startTime, w.endTime));
        applyEditFullDayToggle();

        editAddWindow.addEventListener("click", () => { if (editFullDayToggle.checked) { editFullDayToggle.checked = false; applyEditFullDayToggle(); } addEditWindowRow(); });
        editFullDayToggle.addEventListener("change", applyEditFullDayToggle);

        editDateStart.addEventListener("change", () => { if (!editDateEnd.value || editDateEnd.value < editDateStart.value) editDateEnd.value = editDateStart.value; });
        editDateEnd.addEventListener("change", () => { if (editDateEnd.value < editDateStart.value) editDateStart.value = editDateEnd.value; });

        editForm.addEventListener("submit", async (event) => {
          event.preventDefault();
          if (!currentRequest) return;
          editError.classList.add("hidden"); editSuccess.classList.add("hidden");
          const timeRows = Array.from(editWindows.querySelectorAll(".row"));
          const allowedTimeWindows = editFullDayToggle.checked ? [] : timeRows.map((r) => { const inp = r.querySelectorAll("input"); return { startTime: inp[0].value, endTime: inp[1].value }; }).filter((w) => w.startTime && w.endTime);
          const payload = { hostName: editHostName.value, guestName: editGuestName.value, guestEmail: editGuestEmail.value, hostTimezone: editHostTimezone.value, allowedDateStart: editDateStart.value, allowedDateEnd: editDateEnd.value, allowedTimeWindows };
          const resp = await fetch("/api/request/" + requestId + "?admin=" + encodeURIComponent(adminToken), { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
          if (!resp.ok) { const d = await resp.json().catch(() => ({})); editError.textContent = d.error || "Unable to update."; editError.classList.remove("hidden"); return; }
          const normalizedWindows = allowedTimeWindows.length ? allowedTimeWindows : [{ startTime: "00:00", endTime: "23:59" }];
          currentRequest = { ...currentRequest, ...payload, allowedTimeWindows: normalizedWindows };
          hostTimezoneBadge.textContent = "Host: " + currentRequest.hostTimezone;
          document.getElementById("host-details").innerHTML = '<div class="row"><strong>Guest:</strong> ' + currentRequest.guestName + " (" + currentRequest.guestEmail + ')</div><div class="row"><strong>Date range:</strong> ' + currentRequest.allowedDateStart + " to " + currentRequest.allowedDateEnd + '</div>';
          editSuccess.textContent = "Request updated."; editSuccess.classList.remove("hidden");
        });

        deleteButton.addEventListener("click", async () => {
          if (!currentRequest) return;
          if (!confirm("Delete this request? This cannot be undone.")) return;
          editError.classList.add("hidden"); editSuccess.classList.add("hidden");
          const resp = await fetch("/api/request/" + requestId + "?admin=" + encodeURIComponent(adminToken), { method: "DELETE" });
          if (!resp.ok) { const d = await resp.json().catch(() => ({})); editError.textContent = d.error || "Unable to delete."; editError.classList.remove("hidden"); return; }
          try { const invites = JSON.parse(localStorage.getItem("autoInviteRequests") || "[]"); localStorage.setItem("autoInviteRequests", JSON.stringify(invites.filter((i) => i.requestId !== requestId))); } catch {}
          document.getElementById("host-panel").classList.add("hidden");
          state.classList.remove("hidden"); state.textContent = "Request deleted.";
        });
      }

      // ── Main entry point ──
      async function loadRequest() {
        // Group guest flow
        if (guestToken && !adminToken) {
          await initGroupGuest();
          return;
        }

        // Load request data
        let url = "/api/request/" + requestId;
        if (adminToken) url += "?admin=" + encodeURIComponent(adminToken);
        const resp = await fetch(url);
        if (!resp.ok) {
          state.textContent = "Request not found.";
          return;
        }
        const request = await resp.json();
        state.textContent = "";
        state.classList.add("hidden");

        // Group admin flow
        if (adminToken && request.isAdmin && request.confirmed !== undefined) {
          // This is a group-availability request admin view
          await initGroupAdmin(request);
          return;
        }

        // Individual admin flow
        if (adminToken && request.isAdmin) {
          const hostPanel = document.getElementById("host-panel");
          hostPanel.classList.remove("hidden");
          document.getElementById("host-timezone").textContent = "Host: " + request.hostTimezone;
          currentRequest = request;
          document.getElementById("host-details").innerHTML = '<div class="row"><strong>Guest:</strong> ' + request.guestName + " (" + request.guestEmail + ')</div><div class="row"><strong>Date range:</strong> ' + request.allowedDateStart + " to " + request.allowedDateEnd + '</div>';
          setupIndividualEditForm(request);
          const meetingTitle = document.getElementById("meeting-title");
          meetingTitle.value = request.confirmedSlot?.title || "Meeting: " + request.hostName + " + " + request.guestName;
          document.getElementById("meeting-location").value = request.confirmedSlot?.location || "";
          document.getElementById("meeting-description").value = request.confirmedSlot?.description || "";
          renderConfirmedSlot(request, request.confirmedSlot);
          await loadSubmission(request);
          connectWebSocket();
          return;
        }

        // Individual guest flow
        const guestPanel = document.getElementById("guest-panel");
        guestPanel.classList.remove("hidden");
        document.getElementById("guest-timezone").textContent = "Your timezone: " + guestTimezone.replace(/_/g, " ");
        const guestIntro = document.getElementById("guest-intro");
        const startDay = formatDayName(request.allowedDateStart);
        const endDay = formatDayName(request.allowedDateEnd);
        guestIntro.textContent = request.allowedDateStart === request.allowedDateEnd
          ? request.hostName + " wants to know your availability on " + startDay + "."
          : request.hostName + " wants to know your availability from " + startDay + " to " + endDay + ".";

        displayTimezoneOffsetIn(
          document.getElementById("timezone-offset"),
          document.getElementById("timezone-offset-text"),
          document.getElementById("timezone-offset-detail"),
          request.hostTimezone, request.hostName
        );

        const guestNotice = document.getElementById("guest-notice");
        if (request.hasSubmission) {
          guestNotice.textContent = "You already submitted availability. Submitting again will replace it.";
          guestNotice.classList.remove("hidden");
        }
        renderConfirmedSlot(request, request.confirmedSlot);
        renderGuestSelection(request);
      }

      loadRequest();
    </script>
  </body>
</html>`;
}

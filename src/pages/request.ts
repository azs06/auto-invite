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
  </head>
  <body>
    <main class="shell">
      <header class="hero">
        <a href="/new" class="eyebrow" style="text-decoration:none;">Auto Invite</a>
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
      const confirmedGuestSection = document.getElementById("confirmed-guest");
      const confirmedGuestLink = document.getElementById("confirmed-guest-link");
      const confirmedGuestDetails = document.getElementById("confirmed-guest-details");
      const confirmedHostSection = document.getElementById("confirmed-host");
      const confirmedHostLink = document.getElementById("confirmed-host-link");
      const confirmedHostDetails = document.getElementById("confirmed-host-details");
      const meetingTitle = document.getElementById("meeting-title");
      const meetingLocation = document.getElementById("meeting-location");
      const meetingDescription = document.getElementById("meeting-description");
      const confirmStatus = document.getElementById("confirm-status");
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

      function toGoogleCalendarDate(isoString) {
        return isoString.replace(/[-:]/g, "").replace(/\\.\\d{3}Z$/, "Z");
      }

      function buildGoogleCalendarUrl(slot) {
        const params = new URLSearchParams({
          action: "TEMPLATE",
          text: slot.title,
          dates: toGoogleCalendarDate(slot.startUtc) + "/" + toGoogleCalendarDate(slot.endUtc),
          details: slot.description || "",
          location: slot.location || "",
        });
        return "https://calendar.google.com/calendar/render?" + params.toString();
      }

      function renderConfirmedSlot(request, slot) {
        if (!slot) {
          confirmedGuestSection.classList.add("hidden");
          confirmedHostSection.classList.add("hidden");
          return;
        }

        const hostTime = formatRange(slot.startUtc, slot.endUtc, request.hostTimezone);
        const guestTime = formatRange(slot.startUtc, slot.endUtc, guestTimezone);
        const detailsHtml = \`
          <div class="row"><strong>Title:</strong> \${slot.title}</div>
          <div class="row"><strong>Host time:</strong> \${hostTime}</div>
          <div class="row"><strong>Your time:</strong> \${guestTime}</div>
          <div class="row"><strong>Location:</strong> \${slot.location || "Not set"}</div>
          <div class="row"><strong>Notes:</strong> \${slot.description || "None"}</div>
        \`;
        const url = buildGoogleCalendarUrl(slot);
        confirmedGuestDetails.innerHTML = detailsHtml;
        confirmedGuestLink.href = url;
        confirmedGuestSection.classList.remove("hidden");
        confirmedHostDetails.innerHTML = detailsHtml;
        confirmedHostLink.href = url;
        confirmedHostSection.classList.remove("hidden");
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

      function renderGuestCard(date, allowedWindows, hostName) {
        const card = document.createElement("div");
        card.className = "date-card";
        const allowedList = allowedWindows
          .map((window) => \`\${window.startTime} - \${window.endTime}\`)
          .join(", ");
        card.innerHTML = \`
          <div class="date-header">
            <div>
              <h3>\${date}</h3>
              <p class="hint">\${hostName}'s availability: \${allowedList}</p>
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
          <button type="button" class="ghost danger">Remove</button>
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

      function showConfirmStatus(message) {
        confirmStatus.textContent = message;
        confirmStatus.classList.remove("hidden");
        setTimeout(() => confirmStatus.classList.add("hidden"), 4000);
      }

      async function confirmSlot(slot) {
        if (!adminToken) return;
        const payload = {
          startUtc: slot.startUtc,
          endUtc: slot.endUtc,
          title: meetingTitle.value,
          description: meetingDescription.value,
          location: meetingLocation.value,
        };

        const response = await fetch(
          "/api/request/" + requestId + "/confirm?admin=" + encodeURIComponent(adminToken),
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload),
          }
        );

        if (!response.ok) {
          showEditError("Unable to confirm this slot.");
          return;
        }

        const updated = {
          ...payload,
          title: payload.title || "Meeting: " + currentRequest.hostName + " + " + currentRequest.guestName,
          confirmedAt: new Date().toISOString(),
        };
        currentRequest.confirmedSlot = updated;
        renderConfirmedSlot(currentRequest, updated);
        showConfirmStatus("Meeting confirmed and ready to add to calendar.");
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
          meetingTitle.value = request.confirmedSlot?.title || "Meeting: " + request.hostName + " + " + request.guestName;
          meetingLocation.value = request.confirmedSlot?.location || "";
          meetingDescription.value = request.confirmedSlot?.description || "";
          renderConfirmedSlot(request, request.confirmedSlot);
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
          renderConfirmedSlot(request, request.confirmedSlot);
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
            <div class="stack">
              <button class="secondary" type="button">Select slot</button>
              <span class="hint">Creates a calendar link</span>
            </div>
          \`;
          row.querySelector("button").addEventListener("click", () => confirmSlot(entry));
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
          dateList.appendChild(renderGuestCard(date, allowedByDate[date], request.hostName));
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

import { sharedStyles } from "./shared-styles";

export function renderGroupBookingPage() {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Auto Invite - Group Slot Booking</title>
    <meta name="description" content="Book your time slot" />
    ${sharedStyles()}
    <style>
      .skeleton { background: linear-gradient(90deg, var(--line) 25%, var(--bg-input) 50%, var(--line) 75%); background-size: 200% 100%; animation: shimmer 1.5s infinite; }
      @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
      .slot-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 0.5rem; }
      .slot-btn {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.2rem;
        padding: 0.75rem 0.5rem;
        border: 1px solid var(--line);
        border-radius: 0.5rem;
        background: var(--bg-input);
        color: var(--ink);
        cursor: pointer;
        font-family: inherit;
        font-size: 0.85rem;
        text-align: center;
        transition: all 0.15s ease;
      }
      .slot-btn:hover:not(:disabled) { border-color: var(--accent); background: var(--accent-soft); }
      .slot-btn.selected { border-color: var(--accent); background: var(--accent-soft); box-shadow: 0 0 0 2px var(--accent-glow); }
      .slot-btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
      .slot-btn:disabled { opacity: 0.4; cursor: not-allowed; background: var(--bg-card); }
      .slot-btn .slot-time { font-weight: 600; }
      .slot-btn .slot-status { font-size: 0.75rem; color: var(--ink-secondary); margin-top: 2px; }
      .day-tab-bar { display: flex; gap: 0.25rem; overflow-x: auto; padding-bottom: 0.5rem; border-bottom: 1px solid var(--line); margin-bottom: 1rem; -webkit-mask-image: linear-gradient(to right, black 90%, transparent); mask-image: linear-gradient(to right, black 90%, transparent); }
      .day-tab {
        padding: 0.5rem 1rem;
        border: none;
        border-bottom: 2px solid transparent;
        background: none;
        color: var(--ink-secondary);
        cursor: pointer;
        font-family: inherit;
        font-size: 0.85rem;
        font-weight: 500;
        white-space: nowrap;
        transition: all 0.15s ease;
      }
      .day-tab:hover { color: var(--ink); }
      .day-tab:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
      .day-tab.active { color: var(--accent); border-bottom-color: var(--accent); }
      .day-content { display: none; }
      .day-content.active { display: block; }
      .event-card {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 0;
        background: var(--bg-card);
        border-radius: 0.75rem;
        border: 1px solid var(--line);
        margin-bottom: 1.5rem;
        overflow: hidden;
      }
      .event-card .event-detail { display: flex; flex-direction: column; gap: 0.15rem; padding: 1rem 1.25rem; border-bottom: 1px solid var(--line); }
      .event-card .event-detail:nth-child(odd) { border-right: 1px solid var(--line); }
      .event-card .event-detail:nth-last-child(1), .event-card .event-detail:nth-last-child(2) { border-bottom: none; }
      .event-card .event-label { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--ink-muted); }
      .event-card .event-value { font-size: 0.95rem; color: var(--ink); font-weight: 500; }
      .booking-form-row { display: flex; gap: 0.75rem; align-items: end; flex-wrap: wrap; margin-top: 1rem; }
      .booking-form-row label { flex: 1; min-width: 140px; }
      .booking-form-row input { width: 100%; }
      .confirmation-card {
        padding: 1.5rem;
        background: var(--success-soft);
        border: 1px solid var(--success);
        border-radius: 0.75rem;
        text-align: center;
      }
      .confirmation-card h3 { color: var(--success); margin-bottom: 0.5rem; }
      .confirmation-card .cal-link {
        display: inline-block;
        margin-top: 1rem;
        padding: 0.6rem 1.2rem;
        background: var(--accent);
        color: var(--bg);
        border-radius: 0.5rem;
        font-weight: 600;
        text-decoration: none;
      }
      .stats-row { display: flex; gap: 1rem; flex-wrap: wrap; margin-bottom: 1.5rem; }
      .stat-card { flex: 1; min-width: 120px; padding: 1rem; background: var(--bg-card); border: 1px solid var(--line); border-radius: 0.75rem; text-align: center; }
      .stat-card .stat-value { font-size: 1.75rem; font-weight: 700; color: var(--accent); font-family: "DM Sans", sans-serif; }
      .stat-card .stat-label { font-size: 0.75rem; color: var(--ink-muted); text-transform: uppercase; letter-spacing: 0.05em; }
      .bookings-table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
      .bookings-table th { text-align: left; padding: 0.6rem; border-bottom: 2px solid var(--line); color: var(--ink-muted); font-weight: 600; text-transform: uppercase; font-size: 0.7rem; letter-spacing: 0.05em; }
      .bookings-table td { padding: 0.6rem; border-bottom: 1px solid var(--line); }
      .cancel-btn { background: none; border: 1px solid var(--error); color: var(--error); padding: 0.3rem 0.6rem; border-radius: 0.35rem; cursor: pointer; font-size: 0.75rem; font-family: inherit; }
      .cancel-btn:hover { background: var(--error-soft); }
      .admin-schedule-grid { display: grid; gap: 0.75rem; }
      .admin-day-row { display: flex; gap: 0.5rem; align-items: start; }
      .admin-day-label { min-width: 100px; font-weight: 600; font-size: 0.85rem; padding-top: 0.4rem; color: var(--ink-secondary); }
      .admin-day-slots { display: grid; grid-template-columns: repeat(auto-fill, minmax(85px, 1fr)); gap: 0.35rem; flex: 1; }
      .admin-slot {
        padding: 0.35rem 0.6rem;
        border-radius: 0.35rem;
        font-size: 0.75rem;
        border: 1px solid var(--line);
        background: var(--bg-input);
        color: var(--ink-muted);
      }
      .admin-slot.booked { background: var(--accent-soft); border-color: var(--accent); color: var(--ink); }
    </style>
  </head>
  <body>
    <main class="shell">
      <header class="hero">
        <a href="/new" class="eyebrow" style="text-decoration:none;">Auto Invite</a>
        <h1 id="page-title">Group Slot Booking</h1>
        <p class="subhead" id="page-subtitle"><span class="skeleton" style="display:inline-block;width:200px;height:1em;border-radius:4px;">&nbsp;</span></p>
      </header>

      <section id="state" class="panel subtle">
        <div style="display:flex;flex-direction:column;gap:0.75rem;">
          <div class="skeleton" style="width:100%;height:80px;border-radius:0.75rem;"></div>
          <div class="skeleton" style="width:60%;height:1rem;border-radius:4px;"></div>
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:0.5rem;margin-top:0.5rem;">
            <div class="skeleton" style="height:56px;border-radius:0.5rem;"></div>
            <div class="skeleton" style="height:56px;border-radius:0.5rem;"></div>
            <div class="skeleton" style="height:56px;border-radius:0.5rem;"></div>
            <div class="skeleton" style="height:56px;border-radius:0.5rem;"></div>
          </div>
        </div>
      </section>

      <!-- Guest Booking View -->
      <section id="guest-panel" class="panel hidden">
        <div id="event-info"></div>
        <div id="day-tabs" class="day-tab-bar"></div>
        <div id="day-contents"></div>
        <div id="booking-form" class="hidden">
          <div class="booking-form-row">
            <label>
              Your name
              <input id="guest-name" required placeholder="Enter your name" autocomplete="name" />
            </label>
            <label>
              Your email
              <input id="guest-email" type="email" required placeholder="you@example.com" autocomplete="email" />
            </label>
          </div>
          <div id="booking-error" class="message error hidden" style="margin-top: 0.75rem;"></div>
          <p class="hint" id="slot-hint" style="margin-top: 0.75rem;">Select a time slot to continue</p>
          <button id="book-btn" class="primary" type="button" style="margin-top: 1rem;" disabled>Book this slot</button>
        </div>
        <div id="confirmation" class="hidden"></div>
        <div id="existing-booking" class="hidden"></div>
      </section>

      <!-- Admin Dashboard View -->
      <section id="admin-panel" class="panel hidden">
        <div class="panel-header">
          <h2>Booking Dashboard</h2>
          <span class="pill">Admin</span>
        </div>
        <div id="notification-banner" class="message success hidden"></div>
        <div id="admin-stats" class="stats-row"></div>
        <div class="panel subtle compact" style="margin-bottom: 1.5rem;">
          <div class="panel-header">
            <h3>Share Booking Link</h3>
          </div>
          <div class="copy-row">
            <a id="share-link" target="_blank" rel="noreferrer"></a>
            <button type="button" class="copy-btn" data-copy="share-link" title="Copy to clipboard">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
              <span>Copy</span>
            </button>
          </div>
        </div>
        <div class="panel subtle compact" style="margin-bottom: 1.5rem;">
          <div class="panel-header">
            <h3>Schedule Overview</h3>
          </div>
          <div id="admin-schedule"></div>
        </div>
        <div class="panel subtle compact">
          <div class="panel-header">
            <h3>Bookings</h3>
            <button id="export-csv" class="secondary" type="button">Export CSV</button>
          </div>
          <div id="admin-bookings-table"></div>
        </div>
      </section>
    </main>

    <script type="module">
      const stateEl = document.getElementById("state");
      const guestPanel = document.getElementById("guest-panel");
      const adminPanel = document.getElementById("admin-panel");
      const pageTitle = document.getElementById("page-title");
      const pageSubtitle = document.getElementById("page-subtitle");
      const eventInfo = document.getElementById("event-info");
      const dayTabs = document.getElementById("day-tabs");
      const dayContents = document.getElementById("day-contents");
      const bookingForm = document.getElementById("booking-form");
      const guestNameInput = document.getElementById("guest-name");
      const guestEmailInput = document.getElementById("guest-email");
      const bookBtn = document.getElementById("book-btn");
      const bookingError = document.getElementById("booking-error");
      const confirmationDiv = document.getElementById("confirmation");
      const existingBookingDiv = document.getElementById("existing-booking");
      const adminStats = document.getElementById("admin-stats");
      const adminSchedule = document.getElementById("admin-schedule");
      const adminBookingsTable = document.getElementById("admin-bookings-table");
      const exportCsvBtn = document.getElementById("export-csv");
      const shareLink = document.getElementById("share-link");
      const notificationBanner = document.getElementById("notification-banner");

      const requestId = location.pathname.split("/")[2];
      const adminToken = new URLSearchParams(location.search).get("admin");
      const guestTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
      let selectedSlot = null;
      let allSlotsData = null;

      // Restore name/email from localStorage
      const saved = JSON.parse(localStorage.getItem("groupBookingUser") || "{}");
      if (saved.name) guestNameInput.value = saved.name;
      if (saved.email) guestEmailInput.value = saved.email;

      function formatPartsLocal(date, timeZone) {
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
        const values = Object.fromEntries(parts.map((p) => [p.type, p.value]));
        return {
          date: values.year + "-" + values.month + "-" + values.day,
          time: values.hour + ":" + values.minute,
        };
      }

      function formatTimeForDisplay(utcIso, timeZone) {
        const d = new Date(utcIso);
        return d.toLocaleTimeString("en-US", { timeZone, hour: "2-digit", minute: "2-digit", hour12: true });
      }

      function formatDateForDisplay(utcIso, timeZone) {
        const d = new Date(utcIso);
        return d.toLocaleDateString("en-US", { timeZone, weekday: "short", month: "short", day: "numeric" });
      }

      function formatFullForDisplay(utcIso, timeZone) {
        const d = new Date(utcIso);
        return d.toLocaleString("en-US", { timeZone, weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: true });
      }

      function groupSlotsByDay(slots, timeZone) {
        const groups = {};
        slots.forEach((slot) => {
          const dateKey = formatPartsLocal(new Date(slot.startUtc), timeZone).date;
          if (!groups[dateKey]) groups[dateKey] = [];
          groups[dateKey].push(slot);
        });
        return groups;
      }

      function dayLabel(dateStr) {
        const [y, m, d] = dateStr.split("-").map(Number);
        const date = new Date(y, m - 1, d);
        return new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric" }).format(date);
      }

      function toGoogleCalendarDate(isoString) {
        return isoString.replace(/[-:]/g, "").replace(/\\.\\d{3}Z$/, "Z");
      }

      function showError(msg) {
        bookingError.textContent = msg;
        bookingError.classList.remove("hidden");
      }

      function clearError() {
        bookingError.textContent = "";
        bookingError.classList.add("hidden");
      }

      function showNotification(msg) {
        notificationBanner.textContent = msg;
        notificationBanner.classList.remove("hidden");
        setTimeout(() => notificationBanner.classList.add("hidden"), 5000);
      }

      function renderGuestView(data) {
        const { request, slots, totalSlots, bookedCount } = data;
        allSlotsData = data;

        pageTitle.textContent = request.eventTitle || "Group Slot Booking";
        pageSubtitle.innerHTML = 'Book your time slot with <strong style="color: var(--accent);">' + request.hostName + '</strong>';

        // Event info card
        const availableCount = totalSlots - bookedCount;
        eventInfo.innerHTML = '<div class="event-card">'
          + '<div class="event-detail"><span class="event-label">Event</span><span class="event-value">' + (request.eventTitle || "Meeting") + '</span></div>'
          + '<div class="event-detail"><span class="event-label">Host</span><span class="event-value">' + request.hostName + '</span></div>'
          + '<div class="event-detail"><span class="event-label">Duration</span><span class="event-value">' + request.slotDurationMinutes + ' min</span></div>'
          + '<div class="event-detail"><span class="event-label">Available</span><span class="event-value">' + availableCount + ' of ' + totalSlots + ' slots</span></div>'
          + '</div>';

        // Group slots by day in guest's timezone
        const byDay = groupSlotsByDay(slots, guestTimezone);
        const days = Object.keys(byDay).sort();

        dayTabs.innerHTML = "";
        dayContents.innerHTML = "";

        days.forEach((dateKey, idx) => {
          // Tab
          const tab = document.createElement("button");
          tab.className = "day-tab" + (idx === 0 ? " active" : "");
          tab.textContent = dayLabel(dateKey);
          tab.dataset.day = dateKey;
          tab.addEventListener("click", () => {
            dayTabs.querySelectorAll(".day-tab").forEach((t) => t.classList.remove("active"));
            dayContents.querySelectorAll(".day-content").forEach((c) => c.classList.remove("active"));
            tab.classList.add("active");
            document.getElementById("day-" + dateKey).classList.add("active");
          });
          dayTabs.appendChild(tab);

          // Content
          const content = document.createElement("div");
          content.className = "day-content" + (idx === 0 ? " active" : "");
          content.id = "day-" + dateKey;

          const grid = document.createElement("div");
          grid.className = "slot-grid";

          byDay[dateKey].forEach((slot) => {
            const btn = document.createElement("button");
            btn.className = "slot-btn";
            btn.disabled = slot.booked;
            const timeStr = formatTimeForDisplay(slot.startUtc, guestTimezone);
            const endStr = formatTimeForDisplay(slot.endUtc, guestTimezone);
            btn.innerHTML = '<div class="slot-time">' + timeStr + '</div>'
              + '<div class="slot-status">' + (slot.booked ? "Booked" : endStr) + '</div>';
            if (!slot.booked) {
              btn.addEventListener("click", () => {
                document.querySelectorAll(".slot-btn.selected").forEach((b) => b.classList.remove("selected"));
                btn.classList.add("selected");
                selectedSlot = slot;
                bookBtn.disabled = false;
                bookBtn.textContent = "Book " + timeStr + " - " + endStr;
                const hint = document.getElementById("slot-hint");
                if (hint) hint.style.display = "none";
              });
            }
            grid.appendChild(btn);
          });

          content.appendChild(grid);
          dayContents.appendChild(content);
        });

        bookingForm.classList.remove("hidden");
        guestPanel.classList.remove("hidden");
      }

      function renderConfirmation(booking, request) {
        bookingForm.classList.add("hidden");
        dayTabs.classList.add("hidden");
        dayContents.classList.add("hidden");

        const startDisplay = formatFullForDisplay(booking.slotStartUtc, guestTimezone);
        const endTime = formatTimeForDisplay(booking.slotEndUtc, guestTimezone);

        const gcalParams = new URLSearchParams({
          action: "TEMPLATE",
          text: request.eventTitle || "Meeting with " + request.hostName,
          dates: toGoogleCalendarDate(booking.slotStartUtc) + "/" + toGoogleCalendarDate(booking.slotEndUtc),
          details: "Booked via Auto Invite",
        });
        const gcalUrl = "https://calendar.google.com/calendar/render?" + gcalParams.toString();

        confirmationDiv.innerHTML = '<div class="confirmation-card">'
          + '<h3>Booking Confirmed!</h3>'
          + '<p>' + startDisplay + ' - ' + endTime + '</p>'
          + '<p style="color: var(--ink-secondary); font-size: 0.85rem; margin-top: 0.5rem;">' + guestTimezone.replace(/_/g, " ") + '</p>'
          + '<a href="' + gcalUrl + '" target="_blank" rel="noreferrer" class="cal-link">Add to Google Calendar</a>'
          + '</div>';
        confirmationDiv.classList.remove("hidden");
      }

      function renderExistingBooking(existing, request) {
        bookingForm.classList.add("hidden");
        dayTabs.classList.add("hidden");
        dayContents.classList.add("hidden");

        const startDisplay = formatFullForDisplay(existing.slotStartUtc, guestTimezone);
        const endTime = formatTimeForDisplay(existing.slotEndUtc, guestTimezone);

        const gcalParams = new URLSearchParams({
          action: "TEMPLATE",
          text: request.eventTitle || "Meeting with " + request.hostName,
          dates: toGoogleCalendarDate(existing.slotStartUtc) + "/" + toGoogleCalendarDate(existing.slotEndUtc),
          details: "Booked via Auto Invite",
        });
        const gcalUrl = "https://calendar.google.com/calendar/render?" + gcalParams.toString();

        existingBookingDiv.innerHTML = '<div class="confirmation-card">'
          + '<h3>You Already Have a Booking</h3>'
          + '<p>' + startDisplay + ' - ' + endTime + '</p>'
          + '<p style="color: var(--ink-secondary); font-size: 0.85rem; margin-top: 0.5rem;">' + guestTimezone.replace(/_/g, " ") + '</p>'
          + '<a href="' + gcalUrl + '" target="_blank" rel="noreferrer" class="cal-link">Add to Google Calendar</a>'
          + '</div>';
        existingBookingDiv.classList.remove("hidden");
      }

      // ── Admin View ──
      function renderAdminView(data) {
        const { request, slots, totalSlots, bookedCount } = data;
        allSlotsData = data;

        pageTitle.textContent = (request.eventTitle || "Group Event") + " — Admin";
        pageSubtitle.textContent = "Manage bookings and view schedule";

        // Share link
        const guestUrl = location.origin + "/g/" + requestId;
        shareLink.textContent = guestUrl;
        shareLink.href = guestUrl;

        // Stats
        const availableCount = totalSlots - bookedCount;
        adminStats.innerHTML = ''
          + '<div class="stat-card"><div class="stat-value">' + totalSlots + '</div><div class="stat-label">Total Slots</div></div>'
          + '<div class="stat-card"><div class="stat-value">' + bookedCount + '</div><div class="stat-label">Booked</div></div>'
          + '<div class="stat-card"><div class="stat-value">' + availableCount + '</div><div class="stat-label">Available</div></div>';

        // Schedule grid
        const byDay = groupSlotsByDay(slots, request.hostTimezone);
        const days = Object.keys(byDay).sort();
        let scheduleHtml = '<div class="admin-schedule-grid">';
        days.forEach((dateKey) => {
          scheduleHtml += '<div class="admin-day-row">';
          scheduleHtml += '<div class="admin-day-label">' + dayLabel(dateKey) + '</div>';
          scheduleHtml += '<div class="admin-day-slots">';
          byDay[dateKey].forEach((slot) => {
            const time = formatTimeForDisplay(slot.startUtc, request.hostTimezone);
            const cls = slot.booked ? "admin-slot booked" : "admin-slot";
            const label = slot.booked ? time + " — " + slot.bookedBy : time;
            scheduleHtml += '<span class="' + cls + '">' + label + '</span>';
          });
          scheduleHtml += '</div></div>';
        });
        scheduleHtml += '</div>';
        adminSchedule.innerHTML = scheduleHtml;

        // Bookings table
        const bookedSlots = slots.filter((s) => s.booked);
        if (bookedSlots.length === 0) {
          adminBookingsTable.innerHTML = '<p style="color: var(--ink-muted);">No bookings yet.</p>';
        } else {
          // We need full booking details — fetch from /bookings
          fetchBookingsTable(request);
        }

        adminPanel.classList.remove("hidden");
      }

      async function fetchBookingsTable(request) {
        const resp = await fetch("/api/request/" + requestId + "/bookings?admin=" + encodeURIComponent(adminToken));
        if (!resp.ok) { adminBookingsTable.innerHTML = '<p style="color: var(--ink-muted);">Unable to load bookings.</p>'; return; }
        const data = await resp.json();
        renderBookingsTable(data.bookings, request);
      }

      function renderBookingsTable(bookings, request) {
        if (!bookings.length) {
          adminBookingsTable.innerHTML = '<p style="color: var(--ink-muted);">No bookings yet.</p>';
          return;
        }
        const sorted = [...bookings].sort((a, b) => a.slotStartUtc.localeCompare(b.slotStartUtc));
        let html = '<table class="bookings-table"><thead><tr><th>Name</th><th>Email</th><th>Slot (Host TZ)</th><th>Booked</th><th></th></tr></thead><tbody>';
        sorted.forEach((b) => {
          const slotTime = formatFullForDisplay(b.slotStartUtc, request.hostTimezone);
          const endTime = formatTimeForDisplay(b.slotEndUtc, request.hostTimezone);
          const bookedAt = new Date(b.bookedAt).toLocaleString();
          html += '<tr>'
            + '<td>' + b.guestName + '</td>'
            + '<td>' + b.guestEmail + '</td>'
            + '<td>' + slotTime + ' - ' + endTime + '</td>'
            + '<td>' + bookedAt + '</td>'
            + '<td><button class="cancel-btn" data-slot="' + b.slotStartUtc + '">Cancel</button></td>'
            + '</tr>';
        });
        html += '</tbody></table>';
        adminBookingsTable.innerHTML = html;

        // Cancel buttons
        adminBookingsTable.querySelectorAll(".cancel-btn").forEach((btn) => {
          btn.addEventListener("click", async () => {
            if (!confirm("Cancel this booking?")) return;
            const resp = await fetch("/api/request/" + requestId + "/book?admin=" + encodeURIComponent(adminToken), {
              method: "DELETE",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ slotStartUtc: btn.dataset.slot }),
            });
            if (resp.ok) {
              showNotification("Booking cancelled.");
              loadPage();
            }
          });
        });
      }

      // CSV export
      exportCsvBtn.addEventListener("click", async () => {
        const resp = await fetch("/api/request/" + requestId + "/bookings?admin=" + encodeURIComponent(adminToken));
        if (!resp.ok) return;
        const data = await resp.json();
        const req = allSlotsData?.request;
        const tz = req?.hostTimezone || "UTC";
        const rows = [["Name", "Email", "Slot Start", "Slot End", "Guest Timezone", "Booked At"]];
        data.bookings.forEach((b) => {
          rows.push([b.guestName, b.guestEmail, formatFullForDisplay(b.slotStartUtc, tz), formatFullForDisplay(b.slotEndUtc, tz), b.guestTimezone, new Date(b.bookedAt).toLocaleString()]);
        });
        const csv = rows.map((r) => r.map((c) => '"' + String(c).replace(/"/g, '""') + '"').join(",")).join("\\n");
        const blob = new Blob([csv], { type: "text/csv" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "bookings.csv";
        a.click();
      });

      // Book button handler
      bookBtn.addEventListener("click", async () => {
        clearError();
        const name = guestNameInput.value.trim();
        const email = guestEmailInput.value.trim();
        if (!name || !email) { showError("Name and email are required."); return; }
        if (!selectedSlot) { showError("Please select a time slot."); return; }

        // Save to localStorage
        localStorage.setItem("groupBookingUser", JSON.stringify({ name, email }));

        bookBtn.disabled = true;
        bookBtn.textContent = "Booking...";

        const resp = await fetch("/api/request/" + requestId + "/book", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            slotStartUtc: selectedSlot.startUtc,
            slotEndUtc: selectedSlot.endUtc,
            guestName: name,
            guestEmail: email,
            guestTimezone: guestTimezone,
          }),
        });

        if (resp.ok) {
          const result = await resp.json();
          renderConfirmation(result.booking, allSlotsData.request);
          return;
        }

        const err = await resp.json().catch(() => ({}));
        if (resp.status === 409 && err.existingBooking) {
          renderExistingBooking(err.existingBooking, allSlotsData.request);
          return;
        }
        if (resp.status === 409) {
          showError(err.error || "This slot was just booked. Please choose another.");
          // Refresh slots
          bookBtn.disabled = true;
          bookBtn.textContent = "Book this slot";
          const hint = document.getElementById("slot-hint");
          if (hint) hint.style.display = "";
          selectedSlot = null;
          loadPage();
          return;
        }

        showError(err.error || "Something went wrong.");
        bookBtn.disabled = false;
        bookBtn.textContent = "Try again";
      });

      // Copy to clipboard
      document.querySelectorAll(".copy-btn").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const targetId = btn.dataset.copy;
          const targetEl = document.getElementById(targetId);
          const text = targetEl?.href || targetEl?.textContent || "";
          try {
            await navigator.clipboard.writeText(text);
            btn.querySelector("span").textContent = "Copied!";
            setTimeout(() => { btn.querySelector("span").textContent = "Copy"; }, 2000);
          } catch (err) { console.error("Copy failed:", err); }
        });
      });

      // WebSocket for admin
      function connectWebSocket() {
        if (!adminToken) return;
        const wsUrl = new URL("/ws/" + requestId, location.origin);
        wsUrl.protocol = location.protocol === "https:" ? "wss:" : "ws:";
        wsUrl.searchParams.set("admin", adminToken);
        const ws = new WebSocket(wsUrl.toString());
        ws.addEventListener("message", async (event) => {
          const msg = JSON.parse(event.data);
          if (msg.type === "booking") {
            const action = msg.action === "new" ? "booked" : "cancelled";
            showNotification(msg.guestName + " " + action + " a slot");
            loadPage();
          }
        });
        ws.addEventListener("close", () => setTimeout(connectWebSocket, 3000));
      }

      async function loadPage() {
        const url = "/api/request/" + requestId + "/slots" + (adminToken ? "?admin=" + encodeURIComponent(adminToken) : "");
        const resp = await fetch(url);
        if (!resp.ok) {
          stateEl.textContent = "Booking page not found.";
          return;
        }
        const data = await resp.json();
        stateEl.classList.add("hidden");

        if (adminToken && data.request.isAdmin) {
          renderAdminView(data);
          connectWebSocket();
        } else {
          renderGuestView(data);
        }
      }

      loadPage();
    </script>
  </body>
</html>`;
}

import { sharedStyles } from "./shared-styles";

export function renderNewGroupPage() {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Auto Invite - Create Group Booking</title>
    <meta name="description" content="Create a group slot booking for multiple guests" />
    ${sharedStyles()}
  </head>
  <body>
    <main class="shell">
      <header class="hero">
        <a href="/new" class="eyebrow" style="text-decoration:none;">Auto Invite</a>
        <h1>Create a group booking</h1>
        <p class="subhead">Define time slots for a group event. Share one link and let people self-book.</p>
      </header>

      <form id="group-form" class="panel">
        <div class="panel-header">
          <h2>Event Details</h2>
        </div>

        <div class="form-section">
          <label>
            Event title
            <input name="eventTitle" required placeholder="e.g. Team Standup" id="event-title-input" />
          </label>
        </div>

        <div class="form-section">
          <div class="panel subtle compact">
            <div class="panel-header">
              <h3>Hosts</h3>
              <button class="secondary" type="button" id="add-host">Add host</button>
            </div>
            <div id="hosts" class="stack"></div>
            <p class="hint">Add all people who will be hosting the meetings.</p>
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

        <div class="form-section">
          <div class="panel subtle compact">
            <div class="panel-header">
              <h3>Time Windows</h3>
              <button class="secondary" type="button" id="add-window">Add window</button>
            </div>
            <div id="windows" class="stack"></div>
            <p class="hint">Define when slots are available in your timezone.</p>
          </div>
        </div>

        <div class="form-section">
          <div class="grid two">
            <label>
              Slot duration
              <select name="slotDurationMinutes" required>
                <option value="30">30 minutes</option>
                <option value="45">45 minutes</option>
                <option value="60" selected>1 hour</option>
                <option value="90">90 minutes</option>
                <option value="120">2 hours</option>
              </select>
            </label>
            <label>
              Buffer between slots
              <select name="bufferMinutes">
                <option value="0" selected>None</option>
                <option value="5">5 minutes</option>
                <option value="10">10 minutes</option>
                <option value="15">15 minutes</option>
              </select>
            </label>
          </div>
        </div>

        <div id="request-error" class="message error hidden"></div>
        <button class="primary" type="submit">Create Group Booking</button>
      </form>

      <section id="links" class="panel hidden">
        <div class="panel-header">
          <h2>Your Links Are Ready</h2>
        </div>
        <div class="stack">
          <div class="card">
            <p class="label">Guest booking link</p>
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
            <p class="hint">Share this with your group</p>
          </div>
          <div class="card">
            <p class="label">Admin dashboard link</p>
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
            <p class="hint">Keep this link to manage bookings</p>
          </div>
        </div>
      </section>
    </main>

    <script type="module">
      const form = document.getElementById("group-form");
      const hostTimezone = document.getElementById("host-timezone");
      const hostsContainer = document.getElementById("hosts");
      const addHostButton = document.getElementById("add-host");
      const windowsContainer = document.getElementById("windows");
      const addWindowButton = document.getElementById("add-window");
      const linksSection = document.getElementById("links");
      const guestLink = document.getElementById("guest-link");
      const adminLink = document.getElementById("admin-link");
      const requestError = document.getElementById("request-error");
      const dateStartInput = form.querySelector('input[name="allowedDateStart"]');
      const dateEndInput = form.querySelector('input[name="allowedDateEnd"]');

      hostTimezone.value = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

      const placeholders = [
        "e.g. Team Standup",
        "e.g. 1:1 with Manager",
        "e.g. Design Review",
        "e.g. Sprint Planning",
        "e.g. Coffee Chat",
      ];
      document.getElementById("event-title-input").placeholder =
        placeholders[Math.floor(Math.random() * placeholders.length)];

      function addHostRow(name = "") {
        const row = document.createElement("div");
        row.className = "row";
        row.innerHTML = \`
          <input type="text" class="host-name" value="\${name}" placeholder="Enter host name" autocomplete="name" style="flex:1" />
          <button type="button" class="ghost danger">Remove</button>
        \`;
        row.querySelector("button").addEventListener("click", () => {
          if (hostsContainer.children.length > 1) row.remove();
        });
        hostsContainer.appendChild(row);
      }

      addHostButton.addEventListener("click", () => addHostRow());
      addHostRow(); // start with one host row

      function showError(message) {
        requestError.textContent = message;
        requestError.classList.remove("hidden");
      }

      function clearError() {
        requestError.textContent = "";
        requestError.classList.add("hidden");
      }

      function addWindowRow(start = "", end = "") {
        const row = document.createElement("div");
        row.className = "row";
        row.innerHTML = \`
          <input type="time" class="time" value="\${start}" />
          <span class="muted">to</span>
          <input type="time" class="time" value="\${end}" />
          <button type="button" class="ghost danger">Remove</button>
        \`;
        row.querySelector("button").addEventListener("click", () => row.remove());
        windowsContainer.appendChild(row);
      }

      addWindowButton.addEventListener("click", () => addWindowRow());
      addWindowRow("09:00", "17:00");

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

      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        clearError();
        const formData = new FormData(form);
        const timeRows = Array.from(windowsContainer.querySelectorAll(".row"));
        const allowedTimeWindows = timeRows
          .map((row) => {
            const inputs = row.querySelectorAll("input");
            return { startTime: inputs[0].value, endTime: inputs[1].value };
          })
          .filter((w) => w.startTime && w.endTime);

        const hostNames = Array.from(hostsContainer.querySelectorAll(".host-name"))
          .map((input) => input.value.trim())
          .filter(Boolean);
        if (!hostNames.length) {
          showError("At least one host name is required.");
          return;
        }

        const payload = {
          type: "group",
          eventTitle: formData.get("eventTitle"),
          hostName: hostNames.join(", "),
          hostTimezone: formData.get("hostTimezone"),
          allowedDateStart: formData.get("allowedDateStart"),
          allowedDateEnd: formData.get("allowedDateEnd"),
          allowedTimeWindows,
          slotDurationMinutes: Number(formData.get("slotDurationMinutes")),
          bufferMinutes: Number(formData.get("bufferMinutes")),
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
    </script>
  </body>
</html>`;
}

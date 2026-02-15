import { sharedStyles } from "./shared-styles";

export function renderNewPage() {
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
        <a href="/new" class="eyebrow" style="text-decoration:none;">Auto Invite</a>
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
        <p style="text-align: center; margin-top: 1rem; color: var(--ink-muted); font-size: 0.85rem;">
          Need to schedule with multiple people? <a href="/new/group">Create a group booking</a>
        </p>
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
          <button type="button" class="ghost danger">Remove</button>
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

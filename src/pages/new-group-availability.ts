import { sharedStyles } from "./shared-styles";

export function renderNewGroupAvailabilityPage() {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Auto Invite - Group Availability Request</title>
    <meta name="description" content="Collect availability from multiple guests to find the best meeting time" />
    ${sharedStyles()}
    <style>
      .guest-row {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        flex-wrap: wrap;
      }
      .guest-row input {
        flex: 1;
        min-width: 140px;
      }
      .guest-count {
        font-size: 0.85rem;
        color: var(--ink-muted);
      }
      .guest-count.error {
        color: var(--error);
      }
      .guest-urls {
        display: grid;
        gap: 0.75rem;
      }
      .guest-url-card {
        background: var(--bg-elevated);
        border: 1px solid var(--line);
        border-radius: 0.75rem;
        padding: 0.75rem 1rem;
      }
      .guest-url-card .guest-url-name {
        font-weight: 600;
        font-size: 0.9rem;
        color: var(--ink);
        margin-bottom: 0.25rem;
      }
      .guest-url-card .guest-url-email {
        font-size: 0.8rem;
        color: var(--ink-muted);
        margin-bottom: 0.5rem;
      }
    </style>
  </head>
  <body>
    <main class="shell">
      <header class="hero">
        <a href="/new" class="eyebrow" style="text-decoration:none;">Auto Invite</a>
        <h1>Group availability request</h1>
        <p class="subhead">Collect availability from multiple guests to find the best meeting time for everyone.</p>
      </header>

      <form id="group-form" class="panel">
        <div class="panel-header">
          <h2>Request Details</h2>
        </div>

        <div class="form-section">
          <div class="grid two">
            <label>
              Your name
              <input name="hostName" required placeholder="Enter your name" autocomplete="name" />
            </label>
            <label>
              Your email <span class="muted" style="text-transform:none;letter-spacing:0;">(optional)</span>
              <input name="hostEmail" type="email" placeholder="you@example.com" autocomplete="email" />
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

        <div class="form-section">
          <div class="panel subtle compact">
            <div class="panel-header">
              <h3>Time Windows</h3>
              <button class="secondary" type="button" id="add-window">Add window</button>
            </div>
            <div id="windows" class="stack"></div>
            <p class="hint">Define when guests can mark availability in your timezone.</p>
          </div>
        </div>

        <div class="form-section">
          <div class="panel subtle compact">
            <div class="panel-header">
              <h3>Guests</h3>
              <div style="display:flex;align-items:center;gap:0.75rem;">
                <span id="guest-count" class="guest-count">0 guests</span>
                <button class="secondary" type="button" id="add-guest">Add guest</button>
              </div>
            </div>
            <div id="guests" class="stack"></div>
            <p class="hint">Minimum 3 guests, maximum 50. Each receives a unique link.</p>
          </div>
        </div>

        <div id="request-error" class="message error hidden"></div>
        <button class="primary" type="submit" id="submit-btn">Create Group Request</button>
        <p style="text-align: center; margin-top: 1rem; color: var(--ink-muted); font-size: 0.85rem;">
          Only need one guest? <a href="/new">Create an individual request</a>
          &middot; Need slot booking? <a href="/new/group">Create a group booking</a>
        </p>
      </form>

      <section id="links" class="panel hidden">
        <div class="panel-header">
          <h2>Your Links Are Ready</h2>
        </div>
        <div class="stack">
          <div class="card">
            <p class="label">Admin dashboard</p>
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
            <p class="hint">Keep this link to manage the request and view results</p>
          </div>
          <div class="card">
            <p class="label">Guest links</p>
            <p class="hint" style="margin-bottom: 0.75rem;">Share each guest's unique link with them</p>
            <div id="guest-urls" class="guest-urls"></div>
          </div>
        </div>
      </section>
    </main>

    <script type="module">
      const form = document.getElementById("group-form");
      const hostTimezone = document.getElementById("host-timezone");
      const guestsContainer = document.getElementById("guests");
      const addGuestButton = document.getElementById("add-guest");
      const guestCountEl = document.getElementById("guest-count");
      const windowsContainer = document.getElementById("windows");
      const addWindowButton = document.getElementById("add-window");
      const linksSection = document.getElementById("links");
      const adminLink = document.getElementById("admin-link");
      const guestUrlsContainer = document.getElementById("guest-urls");
      const requestError = document.getElementById("request-error");
      const dateStartInput = form.querySelector('input[name="allowedDateStart"]');
      const dateEndInput = form.querySelector('input[name="allowedDateEnd"]');

      hostTimezone.value = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

      function updateGuestCount() {
        const count = guestsContainer.children.length;
        guestCountEl.textContent = count + (count === 1 ? " guest" : " guests");
        guestCountEl.className = count < 3 ? "guest-count error" : "guest-count";
      }

      function addGuestRow(name = "", email = "") {
        const row = document.createElement("div");
        row.className = "guest-row";
        row.innerHTML = \`
          <input type="text" class="guest-name" value="\${name}" placeholder="Guest name" autocomplete="off" required />
          <input type="email" class="guest-email" value="\${email}" placeholder="guest@example.com" autocomplete="off" required />
          <button type="button" class="ghost danger">Remove</button>
        \`;
        row.querySelector("button").addEventListener("click", () => {
          row.remove();
          updateGuestCount();
        });
        guestsContainer.appendChild(row);
        updateGuestCount();
      }

      addGuestButton.addEventListener("click", () => addGuestRow());

      // Start with 3 empty guest rows
      addGuestRow();
      addGuestRow();
      addGuestRow();

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

        const guestRows = Array.from(guestsContainer.querySelectorAll(".guest-row"));
        const guests = guestRows
          .map((row) => ({
            name: row.querySelector(".guest-name").value.trim(),
            email: row.querySelector(".guest-email").value.trim(),
          }))
          .filter((g) => g.name && g.email);

        if (guests.length < 3) {
          showError("Minimum 3 guests with name and email are required.");
          return;
        }

        const payload = {
          hostName: formData.get("hostName"),
          hostEmail: formData.get("hostEmail") || undefined,
          hostTimezone: formData.get("hostTimezone"),
          allowedDateStart: formData.get("allowedDateStart"),
          allowedDateEnd: formData.get("allowedDateEnd"),
          allowedTimeWindows,
          guests,
        };

        const submitBtn = document.getElementById("submit-btn");
        submitBtn.disabled = true;
        submitBtn.textContent = "Creating...";

        const response = await fetch("/api/group-request", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });

        submitBtn.disabled = false;
        submitBtn.textContent = "Create Group Request";

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          showError(data.error || "Something went wrong.");
          return;
        }

        const data = await response.json();
        adminLink.textContent = data.adminUrl;
        adminLink.href = data.adminUrl;

        // Render per-guest URLs
        guestUrlsContainer.innerHTML = "";
        (data.guestUrls || []).forEach((guest) => {
          const card = document.createElement("div");
          card.className = "guest-url-card";
          card.innerHTML = \`
            <div class="guest-url-name">\${guest.name}</div>
            <div class="guest-url-email">\${guest.email}</div>
            <div class="copy-row">
              <a href="\${guest.url}" target="_blank" rel="noreferrer" style="font-size:0.85rem;">\${guest.url}</a>
              <button type="button" class="copy-btn" title="Copy to clipboard">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                </svg>
                <span>Copy</span>
              </button>
            </div>
          \`;
          card.querySelector(".copy-btn").addEventListener("click", async (e) => {
            const btn = e.currentTarget;
            try {
              await navigator.clipboard.writeText(guest.url);
              btn.querySelector("span").textContent = "Copied!";
              setTimeout(() => { btn.querySelector("span").textContent = "Copy"; }, 2000);
            } catch (err) { console.error("Copy failed:", err); }
          });
          guestUrlsContainer.appendChild(card);
        });

        form.classList.add("hidden");
        linksSection.classList.remove("hidden");
        linksSection.scrollIntoView({ behavior: "smooth", block: "start" });
      });

      // Copy to clipboard for admin link
      document.querySelectorAll(".copy-btn").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const targetId = btn.dataset.copy;
          if (!targetId) return;
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

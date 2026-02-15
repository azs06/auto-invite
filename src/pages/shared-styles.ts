export function sharedStyles() {
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
      overflow: hidden;
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

    textarea {
      padding: 0.85rem 1rem;
      border-radius: 0.75rem;
      border: 1px solid var(--line);
      font-family: inherit;
      font-size: 1rem;
      background: var(--bg-input);
      color: var(--ink);
      transition: all 0.2s ease;
      resize: vertical;
    }

    input::placeholder {
      color: var(--ink-muted);
    }

    input:focus, select:focus {
      outline: none;
      border-color: var(--accent);
      box-shadow: 0 0 0 3px var(--accent-soft);
    }

    textarea:focus {
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

    button,
    a.button {
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
      display: inline-flex;
      align-items: center;
      justify-content: center;
      text-decoration: none;
    }

    button.primary {
      background: linear-gradient(135deg, var(--accent) 0%, #c49545 100%);
      color: var(--bg);
      box-shadow: 0 4px 20px var(--accent-soft);
    }

    a.button.primary {
      color: var(--bg);
    }

    button.primary:hover,
    a.button.primary:hover {
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

    a.button.secondary {
      background: var(--accent-soft);
      color: var(--accent);
      border: 1px solid rgba(212, 168, 85, 0.3);
    }

    button.secondary:hover,
    a.button.secondary:hover {
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

    form > button.primary {
      width: 100%;
      margin-top: 1.5rem;
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

      .date-range-inline {
        flex-direction: column;
        gap: 0.35rem;
      }

      .date-range-inline input[type="date"] {
        max-width: none;
        width: 100%;
      }

      .booking-form-row {
        flex-direction: column;
      }

      .booking-form-row label {
        min-width: auto;
        width: 100%;
      }
    }
  </style>`;
}

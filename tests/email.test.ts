import { afterEach, describe, expect, it, vi } from "vitest";
import {
  escapeHtml,
  formatDateRange,
  formatTimeForEmail,
  generateConfirmationICS,
  renderConfirmationEmail,
  renderInviteEmail,
  sendConfirmationEmail,
  sendEmail,
  sendInviteEmail,
  type Env,
} from "../src/worker";

function createEmailEnv(overrides?: Partial<Env>): Env {
  return {
    AVAILABILITY: {} as DurableObjectNamespace,
    RESEND_API_KEY: "re_test_key",
    EMAIL_FROM: "Test <test@example.com>",
    EMAIL_INVITE_ENABLED: "true",
    EMAIL_CONFIRM_ENABLED: "true",
    ...overrides,
  } as Env;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("escapeHtml", () => {
  it("escapes special HTML characters", () => {
    expect(escapeHtml("<script>alert('xss')</script>")).toBe(
      "&lt;script&gt;alert('xss')&lt;/script&gt;"
    );
    expect(escapeHtml('Test "quotes" & ampersand')).toBe(
      "Test &quot;quotes&quot; &amp; ampersand"
    );
  });

  it("handles empty strings", () => {
    expect(escapeHtml("")).toBe("");
  });

  it("handles strings without special characters", () => {
    expect(escapeHtml("Hello World")).toBe("Hello World");
  });
});

describe("formatDateRange", () => {
  it("formats date range with timezone", () => {
    const result = formatDateRange("2024-01-15", "2024-01-20", "America/New_York");
    // The function formats dates in UTC, so the output is consistent regardless of local timezone
    expect(result).toMatch(/\w{3}, Jan \d+/); // weekday and month
    expect(result).toContain(" - "); // range separator
    expect(result).toContain("(America/New_York)");
  });

  it("handles same start and end date", () => {
    const result = formatDateRange("2024-06-01", "2024-06-01", "UTC");
    expect(result).toMatch(/\w{3}, \w{3} \d+/); // weekday, month, day
    expect(result).toContain("(UTC)");
  });
});

describe("formatTimeForEmail", () => {
  it("formats UTC time to specified timezone", () => {
    const result = formatTimeForEmail("2024-01-15T14:30:00.000Z", "America/New_York");
    expect(result).toContain("Mon");
    expect(result).toContain("Jan");
    expect(result).toContain("15");
    expect(result).toContain("2024");
  });

  it("includes timezone name in output", () => {
    const result = formatTimeForEmail("2024-01-15T14:30:00.000Z", "UTC");
    expect(result).toContain("UTC");
  });
});

describe("renderInviteEmail", () => {
  it("renders invite email with all parameters", () => {
    const html = renderInviteEmail({
      hostName: "Alice",
      guestName: "Bob",
      dateRange: "Mon, Jan 15 - Fri, Jan 19 (UTC)",
      guestUrl: "https://example.com/r/abc123",
    });

    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("Alice");
    expect(html).toContain("Mon, Jan 15 - Fri, Jan 19 (UTC)");
    expect(html).toContain("https://example.com/r/abc123");
    expect(html).toContain("Select Your Available Times");
    expect(html).toContain("Auto Invite");
  });

  it("escapes HTML in user-provided content", () => {
    const html = renderInviteEmail({
      hostName: "<script>alert(1)</script>",
      guestName: "Bob",
      dateRange: "Test Range",
      guestUrl: "https://example.com",
    });

    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("uses dark theme colors", () => {
    const html = renderInviteEmail({
      hostName: "Host",
      guestName: "Guest",
      dateRange: "Date Range",
      guestUrl: "https://example.com",
    });

    expect(html).toContain("#0d1117"); // dark background
    expect(html).toContain("#d4a855"); // gold accent
  });
});

describe("renderConfirmationEmail", () => {
  it("renders confirmation email with all parameters", () => {
    const html = renderConfirmationEmail({
      guestName: "Bob",
      hostName: "Alice",
      title: "Project Kickoff",
      startTime: "Mon, Jan 15, 2024, 2:00 PM EST",
      endTime: "Mon, Jan 15, 2024, 3:00 PM EST",
      location: "Zoom",
      description: "Discuss project scope",
    });

    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("Your meeting is confirmed!");
    expect(html).toContain("Alice");
    expect(html).toContain("Project Kickoff");
    expect(html).toContain("Mon, Jan 15, 2024, 2:00 PM EST");
    expect(html).toContain("Zoom");
    expect(html).toContain("Discuss project scope");
  });

  it("renders without optional location and description", () => {
    const html = renderConfirmationEmail({
      guestName: "Bob",
      hostName: "Alice",
      title: "Quick Chat",
      startTime: "Mon, Jan 15, 2024, 2:00 PM EST",
      endTime: "Mon, Jan 15, 2024, 2:30 PM EST",
    });

    expect(html).toContain("Quick Chat");
    expect(html).not.toContain("Location");
    expect(html).not.toContain("Description");
  });

  it("escapes HTML in user-provided content", () => {
    const html = renderConfirmationEmail({
      guestName: "Bob",
      hostName: "<img onerror=alert(1)>",
      title: "Test",
      startTime: "Time",
      endTime: "Time",
    });

    expect(html).not.toContain("<img onerror=alert(1)>");
    expect(html).toContain("&lt;img onerror=alert(1)&gt;");
  });
});

describe("generateConfirmationICS", () => {
  it("generates valid ICS content", () => {
    const ics = generateConfirmationICS({
      requestId: "req-123",
      title: "Project Meeting",
      description: "Discuss milestones",
      location: "Conference Room A",
      startUtc: "2024-01-15T14:00:00.000Z",
      endUtc: "2024-01-15T15:00:00.000Z",
      hostName: "Alice",
      guestName: "Bob",
      guestEmail: "bob@example.com",
    });

    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("END:VCALENDAR");
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("END:VEVENT");
    expect(ics).toContain("VERSION:2.0");
    expect(ics).toContain("METHOD:REQUEST");
    expect(ics).toContain("SUMMARY:Project Meeting");
    expect(ics).toContain("DESCRIPTION:Discuss milestones");
    expect(ics).toContain("LOCATION:Conference Room A");
    expect(ics).toContain("UID:req-123-confirmed@auto-invite");
    expect(ics).toContain("ATTENDEE;CN=Bob;RSVP=TRUE:mailto:bob@example.com");
    expect(ics).toContain("STATUS:CONFIRMED");
  });

  it("uses CRLF line endings per RFC 5545", () => {
    const ics = generateConfirmationICS({
      requestId: "req-123",
      title: "Test",
      description: "",
      location: "",
      startUtc: "2024-01-15T14:00:00.000Z",
      endUtc: "2024-01-15T15:00:00.000Z",
      hostName: "Host",
      guestName: "Guest",
      guestEmail: "guest@example.com",
    });

    expect(ics).toContain("\r\n");
  });

  it("omits location when empty", () => {
    const ics = generateConfirmationICS({
      requestId: "req-123",
      title: "Test",
      description: "",
      location: "",
      startUtc: "2024-01-15T14:00:00.000Z",
      endUtc: "2024-01-15T15:00:00.000Z",
      hostName: "Host",
      guestName: "Guest",
      guestEmail: "guest@example.com",
    });

    expect(ics).not.toContain("LOCATION:");
  });

  it("uses default description when empty", () => {
    const ics = generateConfirmationICS({
      requestId: "req-123",
      title: "Test",
      description: "",
      location: "",
      startUtc: "2024-01-15T14:00:00.000Z",
      endUtc: "2024-01-15T15:00:00.000Z",
      hostName: "Alice",
      guestName: "Bob",
      guestEmail: "guest@example.com",
    });

    expect(ics).toContain("DESCRIPTION:Meeting confirmed via Auto Invite");
    expect(ics).toContain("Host: Alice");
    expect(ics).toContain("Guest: Bob");
  });

  it("escapes special ICS characters", () => {
    const ics = generateConfirmationICS({
      requestId: "req-123",
      title: "Meeting; with, special\\chars",
      description: "Line1\nLine2",
      location: "",
      startUtc: "2024-01-15T14:00:00.000Z",
      endUtc: "2024-01-15T15:00:00.000Z",
      hostName: "Host",
      guestName: "Guest",
      guestEmail: "guest@example.com",
    });

    expect(ics).toContain("SUMMARY:Meeting\\; with\\, special\\\\chars");
    expect(ics).toContain("\\n");
  });
});

describe("sendEmail", () => {
  it("returns false when API key is missing", async () => {
    const env = createEmailEnv({ RESEND_API_KEY: undefined });
    const result = await sendEmail(env, {
      to: "test@example.com",
      subject: "Test",
      html: "<p>Test</p>",
    });
    expect(result).toBe(false);
  });

  it("returns false when EMAIL_FROM is missing", async () => {
    const env = createEmailEnv({ EMAIL_FROM: undefined });
    const result = await sendEmail(env, {
      to: "test@example.com",
      subject: "Test",
      html: "<p>Test</p>",
    });
    expect(result).toBe(false);
  });

  it("sends email via Resend API", async () => {
    const env = createEmailEnv();
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "email-123" }), { status: 200 })
    );

    const result = await sendEmail(env, {
      to: "recipient@example.com",
      subject: "Test Subject",
      html: "<p>Test body</p>",
    });

    expect(result).toBe(true);
    expect(fetchSpy).toHaveBeenCalledOnce();

    const [url, options] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(options?.method).toBe("POST");
    expect(options?.headers).toEqual({
      Authorization: "Bearer re_test_key",
      "Content-Type": "application/json",
    });

    const body = JSON.parse(options?.body as string);
    expect(body.from).toBe("Test <test@example.com>");
    expect(body.to).toEqual(["recipient@example.com"]);
    expect(body.subject).toBe("Test Subject");
    expect(body.html).toBe("<p>Test body</p>");
  });

  it("sends email with attachments", async () => {
    const env = createEmailEnv();
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "email-123" }), { status: 200 })
    );

    await sendEmail(env, {
      to: "recipient@example.com",
      subject: "Test",
      html: "<p>Test</p>",
      attachments: [
        {
          filename: "meeting.ics",
          content: "dGVzdA==",
          contentType: "text/calendar",
        },
      ],
    });

    const body = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string);
    expect(body.attachments).toEqual([
      {
        filename: "meeting.ics",
        content: "dGVzdA==",
        content_type: "text/calendar",
      },
    ]);
  });

  it("returns false on API error", async () => {
    const env = createEmailEnv();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "Invalid API key" }), { status: 401 })
    );

    const result = await sendEmail(env, {
      to: "test@example.com",
      subject: "Test",
      html: "<p>Test</p>",
    });

    expect(result).toBe(false);
  });
});

describe("sendInviteEmail", () => {
  it("sends formatted invite email", async () => {
    const env = createEmailEnv();
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "email-123" }), { status: 200 })
    );

    const result = await sendInviteEmail(env, {
      hostName: "Alice",
      guestName: "Bob",
      guestEmail: "bob@example.com",
      dateStart: "2024-01-15",
      dateEnd: "2024-01-20",
      hostTimezone: "America/New_York",
      guestUrl: "https://example.com/r/abc123",
    });

    expect(result).toBe(true);
    expect(fetchSpy).toHaveBeenCalledOnce();

    const body = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string);
    expect(body.to).toEqual(["bob@example.com"]);
    expect(body.subject).toBe("Alice invited you to share your availability");
    expect(body.html).toContain("Alice");
    expect(body.html).toContain("https://example.com/r/abc123");
  });
});

describe("sendConfirmationEmail", () => {
  it("sends confirmation email with ICS attachment", async () => {
    const env = createEmailEnv();
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "email-123" }), { status: 200 })
    );

    const result = await sendConfirmationEmail(env, {
      requestId: "req-123",
      guestName: "Bob",
      guestEmail: "bob@example.com",
      hostName: "Alice",
      guestTimezone: "America/New_York",
      confirmed: {
        startUtc: "2024-01-15T14:00:00.000Z",
        endUtc: "2024-01-15T15:00:00.000Z",
        title: "Project Kickoff",
        description: "Discuss project scope",
        location: "Zoom",
        confirmedAt: "2024-01-10T10:00:00.000Z",
      },
    });

    expect(result).toBe(true);
    expect(fetchSpy).toHaveBeenCalledOnce();

    const body = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string);
    expect(body.to).toEqual(["bob@example.com"]);
    expect(body.subject).toBe("Confirmed: Project Kickoff");
    expect(body.html).toContain("Your meeting is confirmed!");
    expect(body.html).toContain("Alice");
    expect(body.attachments).toHaveLength(1);
    expect(body.attachments[0].filename).toBe("meeting.ics");
    expect(body.attachments[0].content_type).toBe("text/calendar");

    // Decode and verify ICS content
    const icsContent = atob(body.attachments[0].content);
    expect(icsContent).toContain("BEGIN:VCALENDAR");
    expect(icsContent).toContain("SUMMARY:Project Kickoff");
  });

  it("handles empty location and description", async () => {
    const env = createEmailEnv();
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "email-123" }), { status: 200 })
    );

    await sendConfirmationEmail(env, {
      requestId: "req-123",
      guestName: "Bob",
      guestEmail: "bob@example.com",
      hostName: "Alice",
      guestTimezone: "UTC",
      confirmed: {
        startUtc: "2024-01-15T14:00:00.000Z",
        endUtc: "2024-01-15T15:00:00.000Z",
        title: "Quick Call",
        description: "",
        location: "",
        confirmedAt: "2024-01-10T10:00:00.000Z",
      },
    });

    const body = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string);
    expect(body.html).not.toContain("Location");
  });
});

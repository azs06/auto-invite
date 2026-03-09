import { afterEach, describe, expect, it, vi } from "vitest";
import worker, { type Env } from "../src/worker";
import { createEnv, jsonRequest, invalidJsonRequest } from "./test-utils";

const origin = "http://localhost";

function buildGroupPayload(overrides?: Record<string, unknown>) {
  return {
    hostName: "Alice",
    hostTimezone: "UTC",
    allowedDateStart: "2024-01-15",
    allowedDateEnd: "2024-01-20",
    allowedTimeWindows: [{ startTime: "09:00", endTime: "17:00" }],
    guests: [
      { name: "Bob", email: "bob@example.com" },
      { name: "Carol", email: "carol@example.com" },
      { name: "Dave", email: "dave@example.com" },
    ],
    ...overrides,
  };
}

async function createGroupRequest(env: Env, overrides?: Record<string, unknown>) {
  const payload = buildGroupPayload(overrides);
  const response = await worker.fetch(
    jsonRequest(`${origin}/api/group-request`, "POST", payload),
    env
  );
  const data = await response.json();
  return { response, data, payload };
}

function extractAdminToken(adminUrl: string) {
  const url = new URL(adminUrl);
  return url.searchParams.get("admin") || "";
}

function extractRequestId(adminUrl: string) {
  const url = new URL(adminUrl);
  const parts = url.pathname.split("/").filter(Boolean);
  return parts[1] || "";
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("group availability: creation", () => {
  it("creates a group request and returns admin + guest URLs", async () => {
    const { env } = createEnv();
    const { response, data } = await createGroupRequest(env);
    expect(response.status).toBe(200);
    expect(data.requestId).toBeTruthy();
    expect(data.adminUrl).toContain("/ga/");
    expect(data.adminUrl).toContain("?admin=");
    expect(data.guestUrls).toHaveLength(3);
    expect(data.guestUrls[0].name).toBe("Bob");
    expect(data.guestUrls[0].email).toBe("bob@example.com");
    expect(data.guestUrls[0].url).toContain("?guest=");
  });

  it("rejects invalid JSON", async () => {
    const { env } = createEnv();
    const response = await worker.fetch(
      invalidJsonRequest(`${origin}/api/group-request`, "POST"),
      env
    );
    const data = await response.json();
    expect(response.status).toBe(400);
    expect(data.error).toBe("Invalid JSON.");
  });

  it("rejects fewer than 3 guests", async () => {
    const { env } = createEnv();
    const { response, data } = await createGroupRequest(env, {
      guests: [
        { name: "Bob", email: "bob@example.com" },
        { name: "Carol", email: "carol@example.com" },
      ],
    });
    expect(response.status).toBe(400);
    expect(data.error).toContain("Minimum 3 guests");
  });

  it("rejects more than 50 guests", async () => {
    const { env } = createEnv();
    const guests = Array.from({ length: 51 }, (_, i) => ({
      name: `Guest ${i}`,
      email: `guest${i}@example.com`,
    }));
    const { response, data } = await createGroupRequest(env, { guests });
    expect(response.status).toBe(400);
    expect(data.error).toContain("Maximum 50 guests");
  });

  it("rejects duplicate guest emails", async () => {
    const { env } = createEnv();
    const { response, data } = await createGroupRequest(env, {
      guests: [
        { name: "Bob", email: "same@example.com" },
        { name: "Carol", email: "same@example.com" },
        { name: "Dave", email: "dave@example.com" },
      ],
    });
    expect(response.status).toBe(400);
    expect(data.error).toContain("Duplicate email");
  });

  it("rejects missing host name", async () => {
    const { env } = createEnv();
    const { response, data } = await createGroupRequest(env, { hostName: "" });
    expect(response.status).toBe(400);
    expect(data.error).toContain("Host name is required.");
  });

  it("rejects invalid date range (> 60 days)", async () => {
    const { env } = createEnv();
    const { response, data } = await createGroupRequest(env, {
      allowedDateStart: "2024-01-01",
      allowedDateEnd: "2024-04-01",
    });
    expect(response.status).toBe(400);
    expect(data.error).toContain("Date range cannot exceed 60 days");
  });

  it("rejects reversed dates", async () => {
    const { env } = createEnv();
    const { response, data } = await createGroupRequest(env, {
      allowedDateStart: "2024-01-20",
      allowedDateEnd: "2024-01-15",
    });
    expect(response.status).toBe(400);
    expect(data.error).toContain("Start date must be on or before end date.");
  });

  it("rejects invalid time windows", async () => {
    const { env } = createEnv();
    const { response, data } = await createGroupRequest(env, {
      allowedTimeWindows: [{ startTime: "18:00", endTime: "09:00" }],
    });
    expect(response.status).toBe(400);
    expect(data.error).toContain("Time windows must be valid and ordered.");
  });

  it("rejects empty guest names", async () => {
    const { env } = createEnv();
    const { response, data } = await createGroupRequest(env, {
      guests: [
        { name: "", email: "bob@example.com" },
        { name: "Carol", email: "carol@example.com" },
        { name: "Dave", email: "dave@example.com" },
      ],
    });
    expect(response.status).toBe(400);
    expect(data.error).toContain("All guest names are required.");
  });

  it("rejects invalid guest emails", async () => {
    const { env } = createEnv();
    const { response, data } = await createGroupRequest(env, {
      guests: [
        { name: "Bob", email: "not-an-email" },
        { name: "Carol", email: "carol@example.com" },
        { name: "Dave", email: "dave@example.com" },
      ],
    });
    expect(response.status).toBe(400);
    expect(data.error).toContain("Invalid email format");
  });
});

describe("group availability: guest submission", () => {
  it("allows guest to submit availability via worker route", async () => {
    const { env } = createEnv();
    const { data } = await createGroupRequest(env);
    const requestId = extractRequestId(data.adminUrl);
    const guestUrl = new URL(data.guestUrls[0].url);
    const guestToken = guestUrl.searchParams.get("guest");

    const response = await worker.fetch(
      jsonRequest(
        `${origin}/api/request/${requestId}/guest-submit?guest=${guestToken}`,
        "POST",
        {
          availability: [
            { startUtc: "2024-01-15T10:00:00Z", endUtc: "2024-01-15T11:00:00Z" },
          ],
          guestTimezone: "America/New_York",
        }
      ),
      env
    );
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.ok).toBe(true);
  });

  it("rejects submission without guest token", async () => {
    const { env } = createEnv();
    const { data } = await createGroupRequest(env);
    const requestId = extractRequestId(data.adminUrl);

    const response = await worker.fetch(
      jsonRequest(`${origin}/api/request/${requestId}/guest-submit`, "POST", {
        availability: [
          { startUtc: "2024-01-15T10:00:00Z", endUtc: "2024-01-15T11:00:00Z" },
        ],
        guestTimezone: "UTC",
      }),
      env
    );
    expect(response.status).toBe(400);
  });

  it("rejects submission with invalid guest token", async () => {
    const { env } = createEnv();
    const { data } = await createGroupRequest(env);
    const requestId = extractRequestId(data.adminUrl);

    const response = await worker.fetch(
      jsonRequest(
        `${origin}/api/request/${requestId}/guest-submit?guest=bad-token`,
        "POST",
        {
          availability: [
            { startUtc: "2024-01-15T10:00:00Z", endUtc: "2024-01-15T11:00:00Z" },
          ],
          guestTimezone: "UTC",
        }
      ),
      env
    );
    expect(response.status).toBe(403);
  });

  it("rejects empty availability", async () => {
    const { env } = createEnv();
    const { data } = await createGroupRequest(env);
    const requestId = extractRequestId(data.adminUrl);
    const guestUrl = new URL(data.guestUrls[0].url);
    const guestToken = guestUrl.searchParams.get("guest");

    const response = await worker.fetch(
      jsonRequest(
        `${origin}/api/request/${requestId}/guest-submit?guest=${guestToken}`,
        "POST",
        {
          availability: [],
          guestTimezone: "UTC",
        }
      ),
      env
    );
    expect(response.status).toBe(400);
  });

  it("rejects availability outside allowed date range", async () => {
    const { env } = createEnv();
    const { data } = await createGroupRequest(env);
    const requestId = extractRequestId(data.adminUrl);
    const guestUrl = new URL(data.guestUrls[0].url);
    const guestToken = guestUrl.searchParams.get("guest");

    const response = await worker.fetch(
      jsonRequest(
        `${origin}/api/request/${requestId}/guest-submit?guest=${guestToken}`,
        "POST",
        {
          availability: [
            { startUtc: "2024-02-01T10:00:00Z", endUtc: "2024-02-01T11:00:00Z" },
          ],
          guestTimezone: "UTC",
        }
      ),
      env
    );
    expect(response.status).toBe(400);
    const result = await response.json();
    expect(result.error).toContain("allowed date range");
  });

  it("rejects availability outside allowed time windows", async () => {
    const { env } = createEnv();
    const { data } = await createGroupRequest(env);
    const requestId = extractRequestId(data.adminUrl);
    const guestUrl = new URL(data.guestUrls[0].url);
    const guestToken = guestUrl.searchParams.get("guest");

    const response = await worker.fetch(
      jsonRequest(
        `${origin}/api/request/${requestId}/guest-submit?guest=${guestToken}`,
        "POST",
        {
          availability: [
            { startUtc: "2024-01-15T02:00:00Z", endUtc: "2024-01-15T03:00:00Z" },
          ],
          guestTimezone: "UTC",
        }
      ),
      env
    );
    expect(response.status).toBe(400);
    const result = await response.json();
    expect(result.error).toContain("allowed time windows");
  });

  it("allows guest to update their submission", async () => {
    const { env } = createEnv();
    const { data } = await createGroupRequest(env);
    const requestId = extractRequestId(data.adminUrl);
    const guestUrl = new URL(data.guestUrls[0].url);
    const guestToken = guestUrl.searchParams.get("guest");

    // First submission
    await worker.fetch(
      jsonRequest(
        `${origin}/api/request/${requestId}/guest-submit?guest=${guestToken}`,
        "POST",
        {
          availability: [
            { startUtc: "2024-01-15T10:00:00Z", endUtc: "2024-01-15T11:00:00Z" },
          ],
          guestTimezone: "UTC",
        }
      ),
      env
    );

    // Updated submission
    const response = await worker.fetch(
      jsonRequest(
        `${origin}/api/request/${requestId}/guest-submit?guest=${guestToken}`,
        "POST",
        {
          availability: [
            { startUtc: "2024-01-15T14:00:00Z", endUtc: "2024-01-15T15:00:00Z" },
          ],
          guestTimezone: "UTC",
        }
      ),
      env
    );
    expect(response.status).toBe(200);
  });
});

describe("group availability: aggregated view", () => {
  it("returns aggregated availability for admin", async () => {
    const { env } = createEnv();
    const { data } = await createGroupRequest(env);
    const requestId = extractRequestId(data.adminUrl);
    const adminToken = extractAdminToken(data.adminUrl);

    // Submit for 2 guests with overlapping availability
    for (let i = 0; i < 2; i++) {
      const guestUrl = new URL(data.guestUrls[i].url);
      const guestToken = guestUrl.searchParams.get("guest");
      await worker.fetch(
        jsonRequest(
          `${origin}/api/request/${requestId}/guest-submit?guest=${guestToken}`,
          "POST",
          {
            availability: [
              { startUtc: "2024-01-15T10:00:00Z", endUtc: "2024-01-15T12:00:00Z" },
            ],
            guestTimezone: "UTC",
          }
        ),
        env
      );
    }

    const response = await worker.fetch(
      new Request(`${origin}/api/request/${requestId}/aggregated?admin=${adminToken}`),
      env
    );
    expect(response.status).toBe(200);
    const result = await response.json();
    // totalGuests = all invited guests; submittedCount = those who submitted
    expect(result.totalGuests).toBe(3);
    expect(result.submittedCount).toBe(2);
    expect(result.guestStatus).toHaveLength(3);
    expect(result.slots.length).toBeGreaterThan(0);
  });

  it("rejects aggregated view without admin token", async () => {
    const { env } = createEnv();
    const { data } = await createGroupRequest(env);
    const requestId = extractRequestId(data.adminUrl);

    const response = await worker.fetch(
      new Request(`${origin}/api/request/${requestId}/aggregated`),
      env
    );
    expect(response.status).toBe(403);
  });

  it("rejects aggregated view with wrong admin token", async () => {
    const { env } = createEnv();
    const { data } = await createGroupRequest(env);
    const requestId = extractRequestId(data.adminUrl);

    const response = await worker.fetch(
      new Request(`${origin}/api/request/${requestId}/aggregated?admin=wrong-token`),
      env
    );
    expect(response.status).toBe(403);
  });

  it("filters by minParticipation", async () => {
    const { env } = createEnv();
    const { data } = await createGroupRequest(env);
    const requestId = extractRequestId(data.adminUrl);
    const adminToken = extractAdminToken(data.adminUrl);

    // Guest 0 submits 10:00-12:00
    const guest0Url = new URL(data.guestUrls[0].url);
    await worker.fetch(
      jsonRequest(
        `${origin}/api/request/${requestId}/guest-submit?guest=${guest0Url.searchParams.get("guest")}`,
        "POST",
        {
          availability: [
            { startUtc: "2024-01-15T10:00:00Z", endUtc: "2024-01-15T12:00:00Z" },
          ],
          guestTimezone: "UTC",
        }
      ),
      env
    );

    // Guest 1 submits 11:00-13:00 (overlaps with guest 0 at 11:00-12:00)
    const guest1Url = new URL(data.guestUrls[1].url);
    await worker.fetch(
      jsonRequest(
        `${origin}/api/request/${requestId}/guest-submit?guest=${guest1Url.searchParams.get("guest")}`,
        "POST",
        {
          availability: [
            { startUtc: "2024-01-15T11:00:00Z", endUtc: "2024-01-15T13:00:00Z" },
          ],
          guestTimezone: "UTC",
        }
      ),
      env
    );

    // With minParticipation=2, should only get slots where both are available
    const response = await worker.fetch(
      new Request(
        `${origin}/api/request/${requestId}/aggregated?admin=${adminToken}&minParticipation=2`
      ),
      env
    );
    expect(response.status).toBe(200);
    const result = await response.json();
    // All returned slots should have at least 2 participants
    for (const slot of result.slots) {
      expect(slot.participantCount).toBeGreaterThanOrEqual(2);
    }
  });

  it("shows guest submission status", async () => {
    const { env } = createEnv();
    const { data } = await createGroupRequest(env);
    const requestId = extractRequestId(data.adminUrl);
    const adminToken = extractAdminToken(data.adminUrl);

    // Only first guest submits
    const guestUrl = new URL(data.guestUrls[0].url);
    await worker.fetch(
      jsonRequest(
        `${origin}/api/request/${requestId}/guest-submit?guest=${guestUrl.searchParams.get("guest")}`,
        "POST",
        {
          availability: [
            { startUtc: "2024-01-15T10:00:00Z", endUtc: "2024-01-15T11:00:00Z" },
          ],
          guestTimezone: "UTC",
        }
      ),
      env
    );

    const response = await worker.fetch(
      new Request(`${origin}/api/request/${requestId}/aggregated?admin=${adminToken}`),
      env
    );
    const result = await response.json();
    const statuses = result.guestStatus;
    expect(statuses.find((g: { name: string }) => g.name === "Bob").status).toBe("submitted");
    expect(statuses.find((g: { name: string }) => g.name === "Carol").status).toBe("pending");
    expect(statuses.find((g: { name: string }) => g.name === "Dave").status).toBe("pending");
  });
});

describe("group availability: confirmation", () => {
  async function setupWithSubmissions(env: Env) {
    const { data } = await createGroupRequest(env);
    const requestId = extractRequestId(data.adminUrl);
    const adminToken = extractAdminToken(data.adminUrl);

    // All 3 guests submit overlapping availability
    for (const guest of data.guestUrls) {
      const guestUrl = new URL(guest.url);
      const guestToken = guestUrl.searchParams.get("guest");
      await worker.fetch(
        jsonRequest(
          `${origin}/api/request/${requestId}/guest-submit?guest=${guestToken}`,
          "POST",
          {
            availability: [
              { startUtc: "2024-01-15T10:00:00Z", endUtc: "2024-01-15T12:00:00Z" },
            ],
            guestTimezone: "UTC",
          }
        ),
        env
      );
    }

    return { data, requestId, adminToken };
  }

  it("confirms a meeting slot", async () => {
    const { env } = createEnv();
    const { requestId, adminToken } = await setupWithSubmissions(env);

    const response = await worker.fetch(
      jsonRequest(
        `${origin}/api/request/${requestId}/confirm?admin=${adminToken}`,
        "POST",
        {
          startUtc: "2024-01-15T10:00:00Z",
          endUtc: "2024-01-15T11:00:00Z",
          title: "Team Sync",
          description: "Weekly alignment",
          location: "https://meet.example.com",
        }
      ),
      env
    );
    expect(response.status).toBe(200);
  });

  it("rejects confirmation without admin token", async () => {
    const { env } = createEnv();
    const { requestId } = await setupWithSubmissions(env);

    const response = await worker.fetch(
      jsonRequest(`${origin}/api/request/${requestId}/confirm`, "POST", {
        startUtc: "2024-01-15T10:00:00Z",
        endUtc: "2024-01-15T11:00:00Z",
        title: "Team Sync",
      }),
      env
    );
    expect(response.status).toBe(403);
  });

  it("rejects confirmation without title", async () => {
    const { env } = createEnv();
    const { requestId, adminToken } = await setupWithSubmissions(env);

    const response = await worker.fetch(
      jsonRequest(
        `${origin}/api/request/${requestId}/confirm?admin=${adminToken}`,
        "POST",
        {
          startUtc: "2024-01-15T10:00:00Z",
          endUtc: "2024-01-15T11:00:00Z",
        }
      ),
      env
    );
    expect(response.status).toBe(400);
    const result = await response.json();
    expect(result.error).toContain("Meeting title is required");
  });

  it("rejects double confirmation", async () => {
    const { env } = createEnv();
    const { requestId, adminToken } = await setupWithSubmissions(env);

    // First confirm
    await worker.fetch(
      jsonRequest(
        `${origin}/api/request/${requestId}/confirm?admin=${adminToken}`,
        "POST",
        {
          startUtc: "2024-01-15T10:00:00Z",
          endUtc: "2024-01-15T11:00:00Z",
          title: "Team Sync",
        }
      ),
      env
    );

    // Second confirm should fail
    const response = await worker.fetch(
      jsonRequest(
        `${origin}/api/request/${requestId}/confirm?admin=${adminToken}`,
        "POST",
        {
          startUtc: "2024-01-15T10:00:00Z",
          endUtc: "2024-01-15T11:00:00Z",
          title: "Another Meeting",
        }
      ),
      env
    );
    expect(response.status).toBe(409);
    const result = await response.json();
    expect(result.error).toContain("already been confirmed");
  });

  it("rejects submission after confirmation", async () => {
    const { env } = createEnv();
    const { data, requestId, adminToken } = await setupWithSubmissions(env);

    // Confirm
    await worker.fetch(
      jsonRequest(
        `${origin}/api/request/${requestId}/confirm?admin=${adminToken}`,
        "POST",
        {
          startUtc: "2024-01-15T10:00:00Z",
          endUtc: "2024-01-15T11:00:00Z",
          title: "Team Sync",
        }
      ),
      env
    );

    // Guest tries to submit after confirmation
    const guestUrl = new URL(data.guestUrls[0].url);
    const guestToken = guestUrl.searchParams.get("guest");
    const response = await worker.fetch(
      jsonRequest(
        `${origin}/api/request/${requestId}/guest-submit?guest=${guestToken}`,
        "POST",
        {
          availability: [
            { startUtc: "2024-01-15T14:00:00Z", endUtc: "2024-01-15T15:00:00Z" },
          ],
          guestTimezone: "UTC",
        }
      ),
      env
    );
    expect(response.status).toBe(409);
    const result = await response.json();
    expect(result.error).toContain("confirmed");
  });

  it("sends confirmation emails when enabled", async () => {
    const { env } = createEnv({
      RESEND_API_KEY: "re_test_key",
      EMAIL_FROM: "Test <test@example.com>",
      EMAIL_CONFIRM_ENABLED: "true",
    });
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "email-123" }), { status: 200 })
    );

    const { requestId, adminToken } = await setupWithSubmissions(env);

    await worker.fetch(
      jsonRequest(
        `${origin}/api/request/${requestId}/confirm?admin=${adminToken}`,
        "POST",
        {
          startUtc: "2024-01-15T10:00:00Z",
          endUtc: "2024-01-15T11:00:00Z",
          title: "Team Sync",
        }
      ),
      env
    );

    // Allow async email sends to complete
    await new Promise((r) => setTimeout(r, 50));

    const emailCalls = fetchSpy.mock.calls.filter(
      (call) => call[0] === "https://api.resend.com/emails"
    );
    // Should send one confirmation email per guest (3 guests)
    expect(emailCalls.length).toBe(3);
  });
});

describe("group availability: end-to-end flow", () => {
  it("full lifecycle: create → submit → aggregate → confirm → export", async () => {
    const { env } = createEnv();

    // Step 1: Create group request with 5 guests
    const guests = Array.from({ length: 5 }, (_, i) => ({
      name: `Guest ${i + 1}`,
      email: `guest${i + 1}@example.com`,
    }));
    const { data } = await createGroupRequest(env, { guests });
    const requestId = extractRequestId(data.adminUrl);
    const adminToken = extractAdminToken(data.adminUrl);

    expect(data.guestUrls).toHaveLength(5);

    // Step 2: 3 of 5 guests submit availability
    for (let i = 0; i < 3; i++) {
      const guestUrl = new URL(data.guestUrls[i].url);
      const guestToken = guestUrl.searchParams.get("guest");
      await worker.fetch(
        jsonRequest(
          `${origin}/api/request/${requestId}/guest-submit?guest=${guestToken}`,
          "POST",
          {
            availability: [
              { startUtc: "2024-01-16T10:00:00Z", endUtc: "2024-01-16T12:00:00Z" },
            ],
            guestTimezone: "UTC",
          }
        ),
        env
      );
    }

    // Step 3: Admin views aggregated availability
    const aggResponse = await worker.fetch(
      new Request(`${origin}/api/request/${requestId}/aggregated?admin=${adminToken}`),
      env
    );
    expect(aggResponse.status).toBe(200);
    const aggData = await aggResponse.json();
    // totalGuests = all invited guests; submittedCount = those who submitted
    expect(aggData.totalGuests).toBe(5);
    expect(aggData.submittedCount).toBe(3);
    expect(aggData.guestStatus.filter((g: { status: string }) => g.status === "submitted")).toHaveLength(3);
    expect(aggData.guestStatus.filter((g: { status: string }) => g.status === "pending")).toHaveLength(2);

    // Step 4: Admin confirms a slot
    const confirmResponse = await worker.fetch(
      jsonRequest(
        `${origin}/api/request/${requestId}/confirm?admin=${adminToken}`,
        "POST",
        {
          startUtc: "2024-01-16T10:00:00Z",
          endUtc: "2024-01-16T11:00:00Z",
          title: "Project Kickoff",
          description: "Initial planning session",
          location: "Conference Room A",
        }
      ),
      env
    );
    expect(confirmResponse.status).toBe(200);

    // Step 5: Verify request shows as confirmed
    const requestResponse = await worker.fetch(
      new Request(`${origin}/api/request/${requestId}?admin=${adminToken}`),
      env
    );
    const requestData = await requestResponse.json();
    expect(requestData.confirmed).toBe(true);
    expect(requestData.confirmedSlot.title).toBe("Project Kickoff");

    // Step 6: Export ICS
    const icsResponse = await worker.fetch(
      new Request(`${origin}/api/request/${requestId}/export.ics?admin=${adminToken}`),
      env
    );
    expect(icsResponse.status).toBe(200);
    expect(icsResponse.headers.get("content-type")).toContain("text/calendar");
    const icsText = await icsResponse.text();
    expect(icsText).toContain("BEGIN:VCALENDAR");
    expect(icsText).toContain("Project Kickoff");
  });
});

describe("group availability: guest access", () => {
  it("returns guest info when accessed with guest token", async () => {
    const { env } = createEnv();
    const { data } = await createGroupRequest(env);
    const requestId = extractRequestId(data.adminUrl);
    const guestUrl = new URL(data.guestUrls[0].url);
    const guestToken = guestUrl.searchParams.get("guest");

    const response = await worker.fetch(
      new Request(`${origin}/api/request/${requestId}/guest?guest=${guestToken}`),
      env
    );
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.guestName).toBe("Bob");
    expect(result.hostName).toBe("Alice");
  });

  it("rejects guest access with invalid token", async () => {
    const { env } = createEnv();
    const { data } = await createGroupRequest(env);
    const requestId = extractRequestId(data.adminUrl);

    const response = await worker.fetch(
      new Request(`${origin}/api/request/${requestId}/guest?guest=invalid`),
      env
    );
    expect(response.status).toBe(403);
  });
});

describe("group availability: page routes", () => {
  it("serves the group creation page at /new/group", async () => {
    const { env } = createEnv();
    const response = await worker.fetch(new Request(`${origin}/new/group`), env);
    const body = await response.text();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(body).toContain("Group availability request");
  });

  it("the /new page links to /new/group", async () => {
    const { env } = createEnv();
    const response = await worker.fetch(new Request(`${origin}/new`), env);
    const body = await response.text();
    expect(body).toContain("/new/group");
  });
});

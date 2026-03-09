import { afterEach, describe, expect, it, vi } from "vitest";
import { buildRequestPayload, createEnv, invalidJsonRequest, jsonRequest } from "./test-utils";

const origin = "http://do";

function buildRequestData(overrides?: Record<string, unknown>) {
  return {
    id: "req-1",
    adminToken: "admin-token",
    hostName: "Host",
    guestName: "Guest, Name\nLine",
    guestEmail: "guest@example.com",
    hostTimezone: "UTC",
    allowedDateStart: "2024-01-01",
    allowedDateEnd: "2024-01-01",
    allowedTimeWindows: [{ startTime: "09:00", endTime: "17:00" }],
    createdAt: new Date("2024-01-01T00:00:00Z").toISOString(),
    ...overrides,
  };
}

function buildSubmission(overrides?: Record<string, unknown>) {
  return {
    availability: [
      { startUtc: "2024-01-01T09:00:00.000Z", endUtc: "2024-01-01T10:30:00.000Z" },
    ],
    guestTimezone: "America/New_York",
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("AvailabilityRequest durable object", () => {
  it("rejects invalid JSON for request creation", async () => {
    const { namespace } = createEnv();
    const obj = namespace.getObject("req-1");
    const response = await obj.fetch(invalidJsonRequest(`${origin}/request`, "POST"));
    expect(response.status).toBe(400);
  });

  it("creates a request and rejects duplicates", async () => {
    const { namespace } = createEnv();
    const obj = namespace.getObject("req-1");
    const requestData = buildRequestData();
    const created = await obj.fetch(jsonRequest(`${origin}/request`, "POST", requestData));
    expect(created.status).toBe(200);

    const duplicate = await obj.fetch(jsonRequest(`${origin}/request`, "POST", requestData));
    expect(duplicate.status).toBe(409);
  });

  it("returns guest and admin views for request data", async () => {
    const { namespace } = createEnv();
    const obj = namespace.getObject("req-1");
    const requestData = buildRequestData();
    await obj.fetch(jsonRequest(`${origin}/request`, "POST", requestData));

    const guestResponse = await obj.fetch(new Request(`${origin}/request`));
    const guestData = await guestResponse.json();
    expect(guestData.guestEmail).toBeUndefined();
    expect(guestData.hasSubmission).toBe(false);

    const adminResponse = await obj.fetch(
      new Request(`${origin}/request?admin=${requestData.adminToken}`)
    );
    const adminData = await adminResponse.json();
    expect(adminData.guestEmail).toBe(requestData.guestEmail);
    expect(adminData.isAdmin).toBe(true);
  });

  it("validates update requests", async () => {
    const { namespace } = createEnv();
    const empty = namespace.getObject("empty");
    const noRequest = await empty.fetch(
      jsonRequest(`${origin}/request?admin=admin-token`, "PUT", buildRequestPayload())
    );
    expect(noRequest.status).toBe(404);

    const obj = namespace.getObject("req-1");
    const requestData = buildRequestData();
    await obj.fetch(jsonRequest(`${origin}/request`, "POST", requestData));

    const unauthorized = await obj.fetch(
      jsonRequest(`${origin}/request?admin=wrong`, "PUT", buildRequestPayload())
    );
    expect(unauthorized.status).toBe(403);

    const invalidJson = await obj.fetch(
      invalidJsonRequest(`${origin}/request?admin=${requestData.adminToken}`, "PUT")
    );
    expect(invalidJson.status).toBe(400);

    const invalidUpdate = await obj.fetch(
      jsonRequest(`${origin}/request?admin=${requestData.adminToken}`, "PUT", {
        ...buildRequestPayload(),
        hostName: "",
        allowedDateStart: "2024-02-02",
        allowedDateEnd: "2024-01-01",
        allowedTimeWindows: [{ startTime: "10:00", endTime: "09:00" }],
      })
    );
    expect(invalidUpdate.status).toBe(400);
  });

  it("deletes requests and enforces admin auth", async () => {
    const { namespace } = createEnv();
    const empty = namespace.getObject("empty");
    const missing = await empty.fetch(
      new Request(`${origin}/request?admin=admin-token`, { method: "DELETE" })
    );
    expect(missing.status).toBe(404);

    const obj = namespace.getObject("req-1");
    const requestData = buildRequestData();
    await obj.fetch(jsonRequest(`${origin}/request`, "POST", requestData));

    const unauthorized = await obj.fetch(
      new Request(`${origin}/request?admin=bad`, { method: "DELETE" })
    );
    expect(unauthorized.status).toBe(403);

    const deleted = await obj.fetch(
      new Request(`${origin}/request?admin=${requestData.adminToken}`, { method: "DELETE" })
    );
    expect(deleted.status).toBe(200);

    const afterDelete = await obj.fetch(new Request(`${origin}/request`));
    expect(afterDelete.status).toBe(404);
  });

  it("handles submission routes and updates", async () => {
    const { namespace } = createEnv();
    const obj = namespace.getObject("req-1");

    const missingRequest = await obj.fetch(
      jsonRequest(`${origin}/submit`, "POST", buildSubmission())
    );
    expect(missingRequest.status).toBe(404);

    const missingSubmission = await obj.fetch(
      new Request(`${origin}/submission?admin=admin-token`)
    );
    expect(missingSubmission.status).toBe(404);

    const missingExport = await obj.fetch(
      new Request(`${origin}/export.ics?admin=admin-token`)
    );
    expect(missingExport.status).toBe(404);

    const requestData = buildRequestData();
    await obj.fetch(jsonRequest(`${origin}/request`, "POST", requestData));

    const unauthorizedSubmission = await obj.fetch(new Request(`${origin}/submission`));
    expect(unauthorizedSubmission.status).toBe(403);

    const noSubmission = await obj.fetch(
      new Request(`${origin}/submission?admin=${requestData.adminToken}`)
    );
    expect(noSubmission.status).toBe(404);

    const invalidJson = await obj.fetch(invalidJsonRequest(`${origin}/submit`, "POST"));
    expect(invalidJson.status).toBe(400);

    await obj.fetch(new Request(`${origin}/ws?admin=${requestData.adminToken}`));
    const pair = (globalThis as any).__mockWebSocketPair.lastPair;
    const server = pair[1];

    const first = await obj.fetch(
      jsonRequest(`${origin}/submit`, "POST", buildSubmission())
    );
    expect(first.status).toBe(200);
    expect(server.sentMessages.length).toBe(1);

    const requestView = await obj.fetch(new Request(`${origin}/request`));
    const requestViewData = await requestView.json();
    expect(requestViewData.hasSubmission).toBe(true);

    const submissionResponse = await obj.fetch(
      new Request(`${origin}/submission?admin=${requestData.adminToken}`)
    );
    const submissionData = await submissionResponse.json();
    expect(submissionData.updatedAt).toBeUndefined();

    const second = await obj.fetch(
      jsonRequest(`${origin}/submit`, "POST", buildSubmission())
    );
    expect(second.status).toBe(200);
    expect(server.sentMessages.length).toBe(2);

    const updated = await obj.fetch(
      new Request(`${origin}/submission?admin=${requestData.adminToken}`)
    );
    const updatedData = await updated.json();
    expect(updatedData.updatedAt).toBeTruthy();
  });

  it("confirms a slot for calendar integration", async () => {
    const { namespace } = createEnv();
    const obj = namespace.getObject("req-1");

    const missingRequest = await obj.fetch(
      jsonRequest(`${origin}/confirm`, "POST", {
        startUtc: "2024-01-01T10:00:00Z",
        endUtc: "2024-01-01T11:00:00Z",
      })
    );
    expect(missingRequest.status).toBe(404);

    const requestData = buildRequestData();
    await obj.fetch(jsonRequest(`${origin}/request`, "POST", requestData));

    const unauthorized = await obj.fetch(
      jsonRequest(`${origin}/confirm?admin=bad`, "POST", {
        startUtc: "2024-01-01T10:00:00Z",
        endUtc: "2024-01-01T11:00:00Z",
      })
    );
    expect(unauthorized.status).toBe(403);

    const invalidJson = await obj.fetch(
      invalidJsonRequest(`${origin}/confirm?admin=${requestData.adminToken}`, "POST")
    );
    expect(invalidJson.status).toBe(400);

    const missingTimes = await obj.fetch(
      jsonRequest(`${origin}/confirm?admin=${requestData.adminToken}`, "POST", {})
    );
    expect(missingTimes.status).toBe(400);

    const invalidTimes = await obj.fetch(
      jsonRequest(`${origin}/confirm?admin=${requestData.adminToken}`, "POST", {
        startUtc: "2024-01-01T10:00:00Z",
        endUtc: "2024-01-01T09:00:00Z",
      })
    );
    expect(invalidTimes.status).toBe(400);

    const defaultConfirm = await obj.fetch(
      jsonRequest(`${origin}/confirm?admin=${requestData.adminToken}`, "POST", {
        startUtc: "2024-01-01T10:00:00Z",
        endUtc: "2024-01-01T11:00:00Z",
      })
    );
    expect(defaultConfirm.status).toBe(200);

    const defaultRequest = await obj.fetch(
      new Request(`${origin}/request?admin=${requestData.adminToken}`)
    );
    const defaultJson = await defaultRequest.json();
    expect(defaultJson.confirmedSlot.title).toContain(requestData.hostName);

    const confirmed = await obj.fetch(
      jsonRequest(`${origin}/confirm?admin=${requestData.adminToken}`, "POST", {
        startUtc: "2024-01-01T10:00:00Z",
        endUtc: "2024-01-01T11:00:00Z",
        title: "Kickoff Call",
        description: "Agenda",
        location: "Zoom",
      })
    );
    expect(confirmed.status).toBe(200);

    const requestResponse = await obj.fetch(
      new Request(`${origin}/request?admin=${requestData.adminToken}`)
    );
    const requestJson = await requestResponse.json();
    expect(requestJson.confirmedSlot.title).toBe("Kickoff Call");
    expect(requestJson.confirmedSlot.location).toBe("Zoom");
  });

  it("sends confirmation email when enabled", async () => {
    const { namespace } = createEnv({
      RESEND_API_KEY: "re_test_key",
      EMAIL_FROM: "Test <test@example.com>",
      EMAIL_CONFIRM_ENABLED: "true",
    });
    const obj = namespace.getObject("req-email");
    const requestData = buildRequestData();
    await obj.fetch(jsonRequest(`${origin}/request`, "POST", requestData));
    await obj.fetch(jsonRequest(`${origin}/submit`, "POST", buildSubmission()));

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "email-123" }), { status: 200 })
    );

    const confirmed = await obj.fetch(
      jsonRequest(`${origin}/confirm?admin=${requestData.adminToken}`, "POST", {
        startUtc: "2024-01-01T10:00:00Z",
        endUtc: "2024-01-01T11:00:00Z",
        title: "Team Meeting",
        location: "Zoom",
      })
    );
    expect(confirmed.status).toBe(200);

    expect(fetchSpy).toHaveBeenCalledOnce();
    const emailBody = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string);
    expect(emailBody.to).toEqual(["guest@example.com"]);
    expect(emailBody.subject).toBe("Confirmed: Team Meeting");
    expect(emailBody.attachments).toHaveLength(1);
    expect(emailBody.attachments[0].filename).toBe("meeting.ics");
  });

  it("does not send confirmation email when disabled", async () => {
    const { namespace } = createEnv({
      RESEND_API_KEY: "re_test_key",
      EMAIL_FROM: "Test <test@example.com>",
      EMAIL_CONFIRM_ENABLED: "false",
    });
    const obj = namespace.getObject("req-no-email");
    const requestData = buildRequestData();
    await obj.fetch(jsonRequest(`${origin}/request`, "POST", requestData));
    await obj.fetch(jsonRequest(`${origin}/submit`, "POST", buildSubmission()));

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "email-123" }), { status: 200 })
    );

    const confirmed = await obj.fetch(
      jsonRequest(`${origin}/confirm?admin=${requestData.adminToken}`, "POST", {
        startUtc: "2024-01-01T10:00:00Z",
        endUtc: "2024-01-01T11:00:00Z",
      })
    );
    expect(confirmed.status).toBe(200);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("uses UTC when guest timezone is not available for confirmation email", async () => {
    const { namespace } = createEnv({
      RESEND_API_KEY: "re_test_key",
      EMAIL_FROM: "Test <test@example.com>",
      EMAIL_CONFIRM_ENABLED: "true",
    });
    const obj = namespace.getObject("req-no-sub");
    const requestData = buildRequestData();
    await obj.fetch(jsonRequest(`${origin}/request`, "POST", requestData));
    // No submission - so no guest timezone

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "email-123" }), { status: 200 })
    );

    const confirmed = await obj.fetch(
      jsonRequest(`${origin}/confirm?admin=${requestData.adminToken}`, "POST", {
        startUtc: "2024-01-01T10:00:00Z",
        endUtc: "2024-01-01T11:00:00Z",
      })
    );
    expect(confirmed.status).toBe(200);

    // Email should still be sent, using UTC as fallback
    expect(fetchSpy).toHaveBeenCalledOnce();
    const emailBody = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string);
    expect(emailBody.html).toContain("UTC");
  });

  it("continues confirmation even if email fails", async () => {
    const { namespace } = createEnv({
      RESEND_API_KEY: "re_test_key",
      EMAIL_FROM: "Test <test@example.com>",
      EMAIL_CONFIRM_ENABLED: "true",
    });
    const obj = namespace.getObject("req-fail-email");
    const requestData = buildRequestData();
    await obj.fetch(jsonRequest(`${origin}/request`, "POST", requestData));
    await obj.fetch(jsonRequest(`${origin}/submit`, "POST", buildSubmission()));

    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network error"));

    const confirmed = await obj.fetch(
      jsonRequest(`${origin}/confirm?admin=${requestData.adminToken}`, "POST", {
        startUtc: "2024-01-01T10:00:00Z",
        endUtc: "2024-01-01T11:00:00Z",
      })
    );
    expect(confirmed.status).toBe(200);

    // Verify the slot was still saved
    const requestResponse = await obj.fetch(
      new Request(`${origin}/request?admin=${requestData.adminToken}`)
    );
    const requestJson = await requestResponse.json();
    expect(requestJson.confirmedSlot).toBeTruthy();
  });

  it("exports ICS data and validates access", async () => {
    const { namespace } = createEnv();
    const obj = namespace.getObject("req-1");
    const requestData = buildRequestData();
    await obj.fetch(jsonRequest(`${origin}/request`, "POST", requestData));

    const unauthorized = await obj.fetch(new Request(`${origin}/export.ics`));
    expect(unauthorized.status).toBe(403);

    const noSubmission = await obj.fetch(
      new Request(`${origin}/export.ics?admin=${requestData.adminToken}`)
    );
    expect(noSubmission.status).toBe(404);

    await obj.fetch(jsonRequest(`${origin}/submit`, "POST", buildSubmission()));
    const exported = await obj.fetch(
      new Request(`${origin}/export.ics?admin=${requestData.adminToken}`)
    );
    const ics = await exported.text();
    expect(exported.status).toBe(200);
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("SUMMARY:Available:");
    expect(ics).toContain("\\n");
    expect(ics).toContain("\\,");
  });

  it("handles websocket lifecycle and broadcast failures", async () => {
    const { namespace } = createEnv();
    const obj = namespace.getObject("req-1");
    const requestData = buildRequestData();

    const missing = await obj.fetch(new Request(`${origin}/ws?admin=admin-token`));
    expect(missing.status).toBe(404);

    await obj.fetch(jsonRequest(`${origin}/request`, "POST", requestData));

    const unauthorized = await obj.fetch(new Request(`${origin}/ws?admin=wrong`));
    expect(unauthorized.status).toBe(403);

    await obj.fetch(new Request(`${origin}/ws?admin=${requestData.adminToken}`));
    const pair = (globalThis as any).__mockWebSocketPair.lastPair;
    const server = pair[1];

    server.trigger("close");
    await obj.fetch(jsonRequest(`${origin}/submit`, "POST", buildSubmission()));
    expect(server.sendCount).toBe(0);

    await obj.fetch(new Request(`${origin}/ws?admin=${requestData.adminToken}`));
    const pair2 = (globalThis as any).__mockWebSocketPair.lastPair;
    const server2 = pair2[1];
    server2.trigger("error");
    await obj.fetch(jsonRequest(`${origin}/submit`, "POST", buildSubmission()));
    expect(server2.sendCount).toBe(0);

    await obj.fetch(new Request(`${origin}/ws?admin=${requestData.adminToken}`));
    const pair3 = (globalThis as any).__mockWebSocketPair.lastPair;
    const server3 = pair3[1];
    server3.shouldThrow = true;
    const response = await obj.fetch(jsonRequest(`${origin}/submit`, "POST", buildSubmission()));
    expect(response.status).toBe(200);
  });

  it("posts webhook notifications when configured", async () => {
    const { env, namespace } = createEnv({ NOTIFY_WEBHOOK_URL: "https://example.com/webhook" });
    const obj = namespace.getObject("req-1");
    const requestData = buildRequestData();
    await obj.fetch(jsonRequest(`${origin}/request`, "POST", requestData));

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("ok"));
    await obj.fetch(jsonRequest(`${origin}/submit`, "POST", buildSubmission()));
    expect(fetchSpy).toHaveBeenCalledOnce();

    fetchSpy.mockRejectedValueOnce(new Error("fail"));
    const response = await obj.fetch(jsonRequest(`${origin}/submit`, "POST", buildSubmission()));
    expect(response.status).toBe(200);
  });

  it("returns not found for unknown paths", async () => {
    const { namespace } = createEnv();
    const obj = namespace.getObject("req-1");
    const response = await obj.fetch(new Request(`${origin}/unknown`));
    expect(response.status).toBe(404);
  });
});

describe("Group availability guest endpoint", () => {
  function buildGroupAvailabilityRequest(overrides?: Record<string, unknown>) {
    return {
      id: "req-group-1",
      adminToken: "admin-token",
      hostName: "Host",
      hostTimezone: "America/New_York",
      allowedDateStart: "2024-03-01",
      allowedDateEnd: "2024-03-15",
      allowedTimeWindows: [{ startTime: "09:00", endTime: "17:00" }],
      createdAt: new Date("2024-02-15T10:00:00Z").toISOString(),
      type: "group-availability",
      guests: [
        { token: "guest-aaa", name: "Alice", email: "alice@example.com", invitedAt: "2024-02-15T10:00:00Z" },
        { token: "guest-bbb", name: "Bob", email: "bob@example.com", invitedAt: "2024-02-15T10:00:00Z" },
        { token: "guest-ccc", name: "Carol", email: "carol@example.com", invitedAt: "2024-02-15T10:00:00Z" },
      ],
      participationThreshold: 3,
      confirmed: false,
      ...overrides,
    };
  }

  it("returns 404 for non-existent group availability request", async () => {
    const { namespace } = createEnv();
    const obj = namespace.getObject("req-nonexistent");
    const response = await obj.fetch(new Request(`${origin}/guest?guest=guest-aaa`));
    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data.error).toContain("not found");
  });

  it("returns 404 for non-group-availability request type", async () => {
    const { namespace } = createEnv();
    const obj = namespace.getObject("req-individual");
    const requestData = buildRequestData({ type: "individual" });
    await obj.fetch(jsonRequest(`${origin}/request`, "POST", requestData));

    const response = await obj.fetch(new Request(`${origin}/guest?guest=guest-aaa`));
    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data.error).toContain("not found");
  });

  it("returns 400 when guest token is missing", async () => {
    const { namespace } = createEnv();
    const obj = namespace.getObject("req-group-1");
    const requestData = buildGroupAvailabilityRequest();
    await obj.fetch(jsonRequest(`${origin}/request`, "POST", requestData));

    const response = await obj.fetch(new Request(`${origin}/guest`));
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain("Guest token is required");
  });

  it("returns 403 for invalid guest token", async () => {
    const { namespace } = createEnv();
    const obj = namespace.getObject("req-group-1");
    const requestData = buildGroupAvailabilityRequest();
    await obj.fetch(jsonRequest(`${origin}/request`, "POST", requestData));

    const response = await obj.fetch(new Request(`${origin}/guest?guest=invalid-token`));
    expect(response.status).toBe(403);
    const data = await response.json();
    expect(data.error).toContain("Invalid guest token");
  });

  it("returns guest-specific view with valid token", async () => {
    const { namespace } = createEnv();
    const obj = namespace.getObject("req-group-1");
    const requestData = buildGroupAvailabilityRequest();
    await obj.fetch(jsonRequest(`${origin}/request`, "POST", requestData));

    const response = await obj.fetch(new Request(`${origin}/guest?guest=guest-bbb`));
    expect(response.status).toBe(200);
    const data = await response.json();

    expect(data.requestId).toBe("req-group-1");
    expect(data.guestName).toBe("Bob");
    expect(data.hostName).toBe("Host");
    expect(data.hostTimezone).toBe("America/New_York");
    expect(data.allowedDateStart).toBe("2024-03-01");
    expect(data.allowedDateEnd).toBe("2024-03-15");
    expect(data.allowedTimeWindows).toEqual([{ startTime: "09:00", endTime: "17:00" }]);
    expect(data.hasSubmitted).toBe(false);
    expect(data.existingSubmission).toBeUndefined();
  });

  it("does not expose other guests' information", async () => {
    const { namespace } = createEnv();
    const obj = namespace.getObject("req-group-1");
    const requestData = buildGroupAvailabilityRequest();
    await obj.fetch(jsonRequest(`${origin}/request`, "POST", requestData));

    const response = await obj.fetch(new Request(`${origin}/guest?guest=guest-aaa`));
    expect(response.status).toBe(200);
    const data = await response.json();

    // Should only see own name, not other guests
    expect(data.guestName).toBe("Alice");
    expect(data).not.toHaveProperty("guests");
    expect(JSON.stringify(data)).not.toContain("Bob");
    expect(JSON.stringify(data)).not.toContain("Carol");
    expect(JSON.stringify(data)).not.toContain("bob@example.com");
    expect(JSON.stringify(data)).not.toContain("carol@example.com");
  });

  it("returns existing submission when guest has submitted", async () => {
    const { namespace } = createEnv();
    const obj = namespace.getObject("req-group-1");
    const requestData = buildGroupAvailabilityRequest();
    await obj.fetch(jsonRequest(`${origin}/request`, "POST", requestData));

    // Create a submission for guest-bbb
    const mockStorage = (obj as any).state.storage;
    await mockStorage.put("group-submissions", {
      submissions: [
        {
          guestToken: "guest-bbb",
          availability: [
            { startUtc: "2024-03-05T14:00:00Z", endUtc: "2024-03-05T16:00:00Z" },
          ],
          guestTimezone: "America/Los_Angeles",
          submittedAt: "2024-02-16T08:30:00Z",
        },
      ],
    });

    const response = await obj.fetch(new Request(`${origin}/guest?guest=guest-bbb`));
    expect(response.status).toBe(200);
    const data = await response.json();

    expect(data.hasSubmitted).toBe(true);
    expect(data.existingSubmission).toBeDefined();
    expect(data.existingSubmission.availability).toEqual([
      { startUtc: "2024-03-05T14:00:00Z", endUtc: "2024-03-05T16:00:00Z" },
    ]);
    expect(data.existingSubmission.guestTimezone).toBe("America/Los_Angeles");
    expect(data.existingSubmission.submittedAt).toBe("2024-02-16T08:30:00Z");
  });

  it("does not expose other guests' submissions", async () => {
    const { namespace } = createEnv();
    const obj = namespace.getObject("req-group-1");
    const requestData = buildGroupAvailabilityRequest();
    await obj.fetch(jsonRequest(`${origin}/request`, "POST", requestData));

    // Create submissions for multiple guests
    const mockStorage = (obj as any).state.storage;
    await mockStorage.put("group-submissions", {
      submissions: [
        {
          guestToken: "guest-aaa",
          availability: [
            { startUtc: "2024-03-05T14:00:00Z", endUtc: "2024-03-05T16:00:00Z" },
          ],
          guestTimezone: "America/New_York",
          submittedAt: "2024-02-16T08:00:00Z",
        },
        {
          guestToken: "guest-bbb",
          availability: [
            { startUtc: "2024-03-05T15:00:00Z", endUtc: "2024-03-05T17:00:00Z" },
          ],
          guestTimezone: "America/Los_Angeles",
          submittedAt: "2024-02-16T08:30:00Z",
        },
      ],
    });

    // Guest-aaa should only see their own submission
    const response = await obj.fetch(new Request(`${origin}/guest?guest=guest-aaa`));
    expect(response.status).toBe(200);
    const data = await response.json();

    expect(data.hasSubmitted).toBe(true);
    expect(data.existingSubmission.availability).toEqual([
      { startUtc: "2024-03-05T14:00:00Z", endUtc: "2024-03-05T16:00:00Z" },
    ]);
    expect(data.existingSubmission.guestTimezone).toBe("America/New_York");
    
    // Should not contain guest-bbb's submission data
    expect(JSON.stringify(data)).not.toContain("2024-03-05T15:00:00Z");
    expect(JSON.stringify(data)).not.toContain("America/Los_Angeles");
  });
});

describe("GET /request with guest token parameter", () => {
  function buildGroupAvailabilityRequest(overrides?: Record<string, unknown>) {
    return {
      id: "req-group-1",
      adminToken: "admin-xyz",
      hostName: "Host",
      hostTimezone: "America/New_York",
      allowedDateStart: "2024-03-01",
      allowedDateEnd: "2024-03-15",
      allowedTimeWindows: [{ startTime: "09:00", endTime: "17:00" }],
      createdAt: new Date("2024-02-15T10:00:00Z").toISOString(),
      type: "group-availability",
      guests: [
        { token: "guest-aaa", name: "Alice", email: "alice@example.com", invitedAt: "2024-02-15T10:00:00Z" },
        { token: "guest-bbb", name: "Bob", email: "bob@example.com", invitedAt: "2024-02-15T10:00:00Z" },
        { token: "guest-ccc", name: "Carol", email: "carol@example.com", invitedAt: "2024-02-15T10:00:00Z" },
      ],
      participationThreshold: 3,
      confirmed: false,
      ...overrides,
    };
  }

  it("returns guest-specific view when guest token is provided for group-availability request", async () => {
    const { namespace } = createEnv();
    const obj = namespace.getObject("req-group-1");
    const requestData = buildGroupAvailabilityRequest();
    await obj.fetch(jsonRequest(`${origin}/request`, "POST", requestData));

    const response = await obj.fetch(new Request(`${origin}/request?guest=guest-bbb`));
    expect(response.status).toBe(200);
    const data = await response.json();

    // Should return guest-specific view
    expect(data.requestId).toBe("req-group-1");
    expect(data.guestName).toBe("Bob");
    expect(data.hostName).toBe("Host");
    expect(data.hostTimezone).toBe("America/New_York");
    expect(data.allowedDateStart).toBe("2024-03-01");
    expect(data.allowedDateEnd).toBe("2024-03-15");
    expect(data.allowedTimeWindows).toEqual([{ startTime: "09:00", endTime: "17:00" }]);
    expect(data.hasSubmitted).toBe(false);
    expect(data.existingSubmission).toBeUndefined();

    // Should not have admin-specific fields
    expect(data).not.toHaveProperty("isAdmin");
    expect(data).not.toHaveProperty("guestEmail");
  });

  it("returns 403 for invalid guest token on GET /request", async () => {
    const { namespace } = createEnv();
    const obj = namespace.getObject("req-group-1");
    const requestData = buildGroupAvailabilityRequest();
    await obj.fetch(jsonRequest(`${origin}/request`, "POST", requestData));

    const response = await obj.fetch(new Request(`${origin}/request?guest=invalid-token`));
    expect(response.status).toBe(403);
    const data = await response.json();
    expect(data.error).toContain("Invalid guest token");
  });

  it("maintains backward compatibility for admin token on GET /request", async () => {
    const { namespace } = createEnv();
    const obj = namespace.getObject("req-group-1");
    const requestData = buildGroupAvailabilityRequest();
    await obj.fetch(jsonRequest(`${origin}/request`, "POST", requestData));

    const response = await obj.fetch(new Request(`${origin}/request?admin=admin-xyz`));
    expect(response.status).toBe(200);
    const data = await response.json();

    // Should return admin view (legacy format for now)
    expect(data.id).toBe("req-group-1");
    expect(data.hostName).toBe("Host");
    expect(data.isAdmin).toBe(true);
  });

  it("returns guest view with existing submission when guest has submitted", async () => {
    const { namespace } = createEnv();
    const obj = namespace.getObject("req-group-1");
    const requestData = buildGroupAvailabilityRequest();
    await obj.fetch(jsonRequest(`${origin}/request`, "POST", requestData));

    // Create a submission for guest-bbb
    const mockStorage = (obj as any).state.storage;
    await mockStorage.put("group-submissions", {
      submissions: [
        {
          guestToken: "guest-bbb",
          availability: [
            { startUtc: "2024-03-05T14:00:00Z", endUtc: "2024-03-05T16:00:00Z" },
          ],
          guestTimezone: "America/Los_Angeles",
          submittedAt: "2024-02-16T08:30:00Z",
        },
      ],
    });

    const response = await obj.fetch(new Request(`${origin}/request?guest=guest-bbb`));
    expect(response.status).toBe(200);
    const data = await response.json();

    expect(data.hasSubmitted).toBe(true);
    expect(data.existingSubmission).toBeDefined();
    expect(data.existingSubmission.availability).toEqual([
      { startUtc: "2024-03-05T14:00:00Z", endUtc: "2024-03-05T16:00:00Z" },
    ]);
    expect(data.existingSubmission.guestTimezone).toBe("America/Los_Angeles");
  });

  it("does not return guest view for non-group-availability requests with guest token", async () => {
    const { namespace } = createEnv();
    const obj = namespace.getObject("req-individual");
    const requestData = buildRequestData({ type: "individual" });
    await obj.fetch(jsonRequest(`${origin}/request`, "POST", requestData));

    // Guest token provided but request is not group-availability type
    const response = await obj.fetch(new Request(`${origin}/request?guest=some-token`));
    expect(response.status).toBe(200);
    const data = await response.json();

    // Should return default view (not guest-specific view)
    expect(data.id).toBe("req-1");
    expect(data.hostName).toBe("Host");
    expect(data.guestName).toBe("Guest, Name\nLine");
    expect(data).not.toHaveProperty("requestId");
    expect(data).not.toHaveProperty("hasSubmitted");
  });

  it("isolates guest data - guest cannot see other guests' information", async () => {
    const { namespace } = createEnv();
    const obj = namespace.getObject("req-group-1");
    const requestData = buildGroupAvailabilityRequest();
    await obj.fetch(jsonRequest(`${origin}/request`, "POST", requestData));

    const response = await obj.fetch(new Request(`${origin}/request?guest=guest-aaa`));
    expect(response.status).toBe(200);
    const data = await response.json();

    // Should only see own name, not other guests
    expect(data.guestName).toBe("Alice");
    expect(data).not.toHaveProperty("guests");
    expect(JSON.stringify(data)).not.toContain("Bob");
    expect(JSON.stringify(data)).not.toContain("Carol");
    expect(JSON.stringify(data)).not.toContain("bob@example.com");
    expect(JSON.stringify(data)).not.toContain("carol@example.com");
  });
});

describe("POST /guest-submit endpoint", () => {
  function buildGroupAvailabilityRequest(overrides?: Record<string, unknown>) {
    return {
      id: "req-group-1",
      adminToken: "admin-token",
      hostName: "Host",
      hostTimezone: "America/New_York",
      allowedDateStart: "2024-03-01",
      allowedDateEnd: "2024-03-15",
      allowedTimeWindows: [{ startTime: "09:00", endTime: "17:00" }],
      createdAt: new Date("2024-02-15T10:00:00Z").toISOString(),
      type: "group-availability",
      guests: [
        { token: "guest-aaa", name: "Alice", email: "alice@example.com", invitedAt: "2024-02-15T10:00:00Z" },
        { token: "guest-bbb", name: "Bob", email: "bob@example.com", invitedAt: "2024-02-15T10:00:00Z" },
        { token: "guest-ccc", name: "Carol", email: "carol@example.com", invitedAt: "2024-02-15T10:00:00Z" },
      ],
      participationThreshold: 3,
      confirmed: false,
      ...overrides,
    };
  }

  function buildGuestSubmission(overrides?: Record<string, unknown>) {
    return {
      availability: [
        { startUtc: "2024-03-05T14:00:00Z", endUtc: "2024-03-05T16:00:00Z" },
      ],
      guestTimezone: "America/New_York",
      ...overrides,
    };
  }

  it("returns 404 for non-existent request", async () => {
    const { namespace } = createEnv();
    const obj = namespace.getObject("req-nonexistent");
    const response = await obj.fetch(
      jsonRequest(`${origin}/guest-submit?guest=guest-aaa`, "POST", buildGuestSubmission())
    );
    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data.error).toContain("not found");
  });

  it("returns 404 for non-group-availability request type", async () => {
    const { namespace } = createEnv();
    const obj = namespace.getObject("req-individual");
    const requestData = buildRequestData({ type: "individual" });
    await obj.fetch(jsonRequest(`${origin}/request`, "POST", requestData));

    const response = await obj.fetch(
      jsonRequest(`${origin}/guest-submit?guest=guest-aaa`, "POST", buildGuestSubmission())
    );
    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data.error).toContain("not found");
  });

  it("returns 400 when guest token is missing", async () => {
    const { namespace } = createEnv();
    const obj = namespace.getObject("req-group-1");
    const requestData = buildGroupAvailabilityRequest();
    await obj.fetch(jsonRequest(`${origin}/request`, "POST", requestData));

    const response = await obj.fetch(
      jsonRequest(`${origin}/guest-submit`, "POST", buildGuestSubmission())
    );
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain("Guest token is required");
  });

  it("returns 403 for invalid guest token", async () => {
    const { namespace } = createEnv();
    const obj = namespace.getObject("req-group-1");
    const requestData = buildGroupAvailabilityRequest();
    await obj.fetch(jsonRequest(`${origin}/request`, "POST", requestData));

    const response = await obj.fetch(
      jsonRequest(`${origin}/guest-submit?guest=invalid-token`, "POST", buildGuestSubmission())
    );
    expect(response.status).toBe(403);
    const data = await response.json();
    expect(data.error).toContain("Invalid guest token");
  });

  it("returns 409 when request is already confirmed", async () => {
    const { namespace } = createEnv();
    const obj = namespace.getObject("req-group-1");
    const requestData = buildGroupAvailabilityRequest({ confirmed: true });
    await obj.fetch(jsonRequest(`${origin}/request`, "POST", requestData));

    const response = await obj.fetch(
      jsonRequest(`${origin}/guest-submit?guest=guest-aaa`, "POST", buildGuestSubmission())
    );
    expect(response.status).toBe(409);
    const data = await response.json();
    expect(data.error).toContain("Cannot submit: request has been confirmed");
  });

  it("returns 400 for invalid JSON", async () => {
    const { namespace } = createEnv();
    const obj = namespace.getObject("req-group-1");
    const requestData = buildGroupAvailabilityRequest();
    await obj.fetch(jsonRequest(`${origin}/request`, "POST", requestData));

    const response = await obj.fetch(
      invalidJsonRequest(`${origin}/guest-submit?guest=guest-aaa`, "POST")
    );
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain("Invalid JSON");
  });

  it("returns 400 when availability is missing", async () => {
    const { namespace } = createEnv();
    const obj = namespace.getObject("req-group-1");
    const requestData = buildGroupAvailabilityRequest();
    await obj.fetch(jsonRequest(`${origin}/request`, "POST", requestData));

    const response = await obj.fetch(
      jsonRequest(`${origin}/guest-submit?guest=guest-aaa`, "POST", {
        guestTimezone: "America/New_York",
      })
    );
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain("Availability array is required");
  });

  it("returns 400 when guestTimezone is missing", async () => {
    const { namespace } = createEnv();
    const obj = namespace.getObject("req-group-1");
    const requestData = buildGroupAvailabilityRequest();
    await obj.fetch(jsonRequest(`${origin}/request`, "POST", requestData));

    const response = await obj.fetch(
      jsonRequest(`${origin}/guest-submit?guest=guest-aaa`, "POST", {
        availability: [
          { startUtc: "2024-03-05T14:00:00Z", endUtc: "2024-03-05T16:00:00Z" },
        ],
      })
    );
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain("Guest timezone is required");
  });

  it("returns 400 for empty availability array", async () => {
    const { namespace } = createEnv();
    const obj = namespace.getObject("req-group-1");
    const requestData = buildGroupAvailabilityRequest();
    await obj.fetch(jsonRequest(`${origin}/request`, "POST", requestData));

    const response = await obj.fetch(
      jsonRequest(`${origin}/guest-submit?guest=guest-aaa`, "POST", {
        availability: [],
        guestTimezone: "America/New_York",
      })
    );
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain("Availability cannot be empty");
  });

  it("returns 400 for invalid timezone", async () => {
    const { namespace } = createEnv();
    const obj = namespace.getObject("req-group-1");
    const requestData = buildGroupAvailabilityRequest();
    await obj.fetch(jsonRequest(`${origin}/request`, "POST", requestData));

    const response = await obj.fetch(
      jsonRequest(`${origin}/guest-submit?guest=guest-aaa`, "POST", {
        availability: [
          { startUtc: "2024-03-05T14:00:00Z", endUtc: "2024-03-05T16:00:00Z" },
        ],
        guestTimezone: "Invalid/Timezone",
      })
    );
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain("Invalid timezone identifier");
  });

  it("returns 400 for overlapping availability ranges", async () => {
    const { namespace } = createEnv();
    const obj = namespace.getObject("req-group-1");
    const requestData = buildGroupAvailabilityRequest();
    await obj.fetch(jsonRequest(`${origin}/request`, "POST", requestData));

    const response = await obj.fetch(
      jsonRequest(`${origin}/guest-submit?guest=guest-aaa`, "POST", {
        availability: [
          { startUtc: "2024-03-05T14:00:00Z", endUtc: "2024-03-05T16:00:00Z" },
          { startUtc: "2024-03-05T15:00:00Z", endUtc: "2024-03-05T17:00:00Z" }, // Overlaps with first
        ],
        guestTimezone: "America/New_York",
      })
    );
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain("Availability ranges must not overlap");
  });

  it("returns 400 for invalid UTC timestamp", async () => {
    const { namespace } = createEnv();
    const obj = namespace.getObject("req-group-1");
    const requestData = buildGroupAvailabilityRequest();
    await obj.fetch(jsonRequest(`${origin}/request`, "POST", requestData));

    const response = await obj.fetch(
      jsonRequest(`${origin}/guest-submit?guest=guest-aaa`, "POST", {
        availability: [
          { startUtc: "invalid-date", endUtc: "2024-03-05T16:00:00Z" },
        ],
        guestTimezone: "America/New_York",
      })
    );
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain("Invalid UTC timestamp format");
  });

  it("returns 400 when start time is after end time", async () => {
    const { namespace } = createEnv();
    const obj = namespace.getObject("req-group-1");
    const requestData = buildGroupAvailabilityRequest();
    await obj.fetch(jsonRequest(`${origin}/request`, "POST", requestData));

    const response = await obj.fetch(
      jsonRequest(`${origin}/guest-submit?guest=guest-aaa`, "POST", {
        availability: [
          { startUtc: "2024-03-05T16:00:00Z", endUtc: "2024-03-05T14:00:00Z" }, // Start after end
        ],
        guestTimezone: "America/New_York",
      })
    );
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain("Start time must be before end time");
  });

  it("returns 400 when availability falls outside allowed date range", async () => {
    const { namespace } = createEnv();
    const obj = namespace.getObject("req-group-1");
    const requestData = buildGroupAvailabilityRequest();
    await obj.fetch(jsonRequest(`${origin}/request`, "POST", requestData));

    const response = await obj.fetch(
      jsonRequest(`${origin}/guest-submit?guest=guest-aaa`, "POST", {
        availability: [
          { startUtc: "2024-02-15T14:00:00Z", endUtc: "2024-02-15T16:00:00Z" }, // Before allowed range
        ],
        guestTimezone: "America/New_York",
      })
    );
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain("Availability must fall within allowed date range");
  });

  it("returns 400 when availability falls outside allowed time windows", async () => {
    const { namespace } = createEnv();
    const obj = namespace.getObject("req-group-1");
    const requestData = buildGroupAvailabilityRequest();
    await obj.fetch(jsonRequest(`${origin}/request`, "POST", requestData));

    const response = await obj.fetch(
      jsonRequest(`${origin}/guest-submit?guest=guest-aaa`, "POST", {
        availability: [
          // 03:00-05:00 EST = 08:00-10:00 UTC, which is outside 09:00-17:00 EST window
          { startUtc: "2024-03-05T08:00:00Z", endUtc: "2024-03-05T10:00:00Z" },
        ],
        guestTimezone: "America/New_York",
      })
    );
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain("Availability must fall within allowed time windows");
  });

  it("successfully stores new guest submission", async () => {
    const { namespace } = createEnv();
    const obj = namespace.getObject("req-group-1");
    const requestData = buildGroupAvailabilityRequest();
    await obj.fetch(jsonRequest(`${origin}/request`, "POST", requestData));

    const response = await obj.fetch(
      jsonRequest(`${origin}/guest-submit?guest=guest-aaa`, "POST", buildGuestSubmission())
    );
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.ok).toBe(true);

    // Verify submission was stored
    const mockStorage = (obj as any).state.storage;
    const submissionsData = await mockStorage.get("group-submissions");
    expect(submissionsData.submissions).toHaveLength(1);
    expect(submissionsData.submissions[0].guestToken).toBe("guest-aaa");
    expect(submissionsData.submissions[0].availability).toEqual([
      { startUtc: "2024-03-05T14:00:00Z", endUtc: "2024-03-05T16:00:00Z" },
    ]);
    expect(submissionsData.submissions[0].guestTimezone).toBe("America/New_York");
    expect(submissionsData.submissions[0].submittedAt).toBeTruthy();
    expect(submissionsData.submissions[0].updatedAt).toBeUndefined();
  });

  it("updates existing guest submission", async () => {
    const { namespace } = createEnv();
    const obj = namespace.getObject("req-group-1");
    const requestData = buildGroupAvailabilityRequest();
    await obj.fetch(jsonRequest(`${origin}/request`, "POST", requestData));

    // First submission
    await obj.fetch(
      jsonRequest(`${origin}/guest-submit?guest=guest-aaa`, "POST", buildGuestSubmission())
    );

    // Second submission (update)
    const response = await obj.fetch(
      jsonRequest(`${origin}/guest-submit?guest=guest-aaa`, "POST", {
        availability: [
          { startUtc: "2024-03-06T14:00:00Z", endUtc: "2024-03-06T16:00:00Z" },
        ],
        guestTimezone: "America/Los_Angeles",
      })
    );
    expect(response.status).toBe(200);

    // Verify submission was updated
    const mockStorage = (obj as any).state.storage;
    const submissionsData = await mockStorage.get("group-submissions");
    expect(submissionsData.submissions).toHaveLength(1);
    expect(submissionsData.submissions[0].guestToken).toBe("guest-aaa");
    expect(submissionsData.submissions[0].availability).toEqual([
      { startUtc: "2024-03-06T14:00:00Z", endUtc: "2024-03-06T16:00:00Z" },
    ]);
    expect(submissionsData.submissions[0].guestTimezone).toBe("America/Los_Angeles");
    expect(submissionsData.submissions[0].updatedAt).toBeTruthy();
  });

  it("invalidates aggregation cache on submission", async () => {
    const { namespace } = createEnv();
    const obj = namespace.getObject("req-group-1");
    const requestData = buildGroupAvailabilityRequest();
    await obj.fetch(jsonRequest(`${origin}/request`, "POST", requestData));

    // Set up cache
    const mockStorage = (obj as any).state.storage;
    await mockStorage.put("aggregated-cache", { slots: [] });
    await mockStorage.put("cache-timestamp", "2024-02-16T10:00:00Z");

    // Submit availability
    await obj.fetch(
      jsonRequest(`${origin}/guest-submit?guest=guest-aaa`, "POST", buildGuestSubmission())
    );

    // Verify cache was invalidated
    const cache = await mockStorage.get("aggregated-cache");
    const timestamp = await mockStorage.get("cache-timestamp");
    expect(cache).toBeUndefined();
    expect(timestamp).toBeUndefined();
  });

  it("broadcasts WebSocket notification on new submission", async () => {
    const { namespace } = createEnv();
    const obj = namespace.getObject("req-group-1");
    const requestData = buildGroupAvailabilityRequest();
    await obj.fetch(jsonRequest(`${origin}/request`, "POST", requestData));

    // Connect WebSocket
    await obj.fetch(new Request(`${origin}/ws?admin=${requestData.adminToken}`));
    const pair = (globalThis as any).__mockWebSocketPair.lastPair;
    const server = pair[1];

    // Submit availability
    await obj.fetch(
      jsonRequest(`${origin}/guest-submit?guest=guest-aaa`, "POST", buildGuestSubmission())
    );

    // Verify WebSocket notification was sent
    expect(server.sentMessages).toHaveLength(1);
    const message = JSON.parse(server.sentMessages[0]);
    expect(message.type).toBe("guest-submission");
    expect(message.action).toBe("new");
    expect(message.guestName).toBe("Alice");
    expect(message.guestToken).toBe("guest-aaa");
    expect(message.submittedAt).toBeTruthy();
  });

  it("broadcasts WebSocket notification on updated submission", async () => {
    const { namespace } = createEnv();
    const obj = namespace.getObject("req-group-1");
    const requestData = buildGroupAvailabilityRequest();
    await obj.fetch(jsonRequest(`${origin}/request`, "POST", requestData));

    // First submission
    await obj.fetch(
      jsonRequest(`${origin}/guest-submit?guest=guest-aaa`, "POST", buildGuestSubmission())
    );

    // Connect WebSocket
    await obj.fetch(new Request(`${origin}/ws?admin=${requestData.adminToken}`));
    const pair = (globalThis as any).__mockWebSocketPair.lastPair;
    const server = pair[1];

    // Update submission
    await obj.fetch(
      jsonRequest(`${origin}/guest-submit?guest=guest-aaa`, "POST", {
        availability: [
          { startUtc: "2024-03-06T14:00:00Z", endUtc: "2024-03-06T16:00:00Z" },
        ],
        guestTimezone: "America/Los_Angeles",
      })
    );

    // Verify WebSocket notification was sent
    expect(server.sentMessages).toHaveLength(1);
    const message = JSON.parse(server.sentMessages[0]);
    expect(message.type).toBe("guest-submission");
    expect(message.action).toBe("updated");
    expect(message.guestName).toBe("Alice");
  });

  it("handles multiple guest submissions independently", async () => {
    const { namespace } = createEnv();
    const obj = namespace.getObject("req-group-1");
    const requestData = buildGroupAvailabilityRequest();
    await obj.fetch(jsonRequest(`${origin}/request`, "POST", requestData));

    // Guest A submits
    await obj.fetch(
      jsonRequest(`${origin}/guest-submit?guest=guest-aaa`, "POST", {
        availability: [
          { startUtc: "2024-03-05T14:00:00Z", endUtc: "2024-03-05T16:00:00Z" },
        ],
        guestTimezone: "America/New_York",
      })
    );

    // Guest B submits
    await obj.fetch(
      jsonRequest(`${origin}/guest-submit?guest=guest-bbb`, "POST", {
        availability: [
          { startUtc: "2024-03-05T15:00:00Z", endUtc: "2024-03-05T17:00:00Z" },
        ],
        guestTimezone: "America/Los_Angeles",
      })
    );

    // Verify both submissions were stored
    const mockStorage = (obj as any).state.storage;
    const submissionsData = await mockStorage.get("group-submissions");
    expect(submissionsData.submissions).toHaveLength(2);
    expect(submissionsData.submissions[0].guestToken).toBe("guest-aaa");
    expect(submissionsData.submissions[1].guestToken).toBe("guest-bbb");
  });

  it("accepts multiple non-overlapping availability ranges", async () => {
    const { namespace } = createEnv();
    const obj = namespace.getObject("req-group-1");
    const requestData = buildGroupAvailabilityRequest();
    await obj.fetch(jsonRequest(`${origin}/request`, "POST", requestData));

    const response = await obj.fetch(
      jsonRequest(`${origin}/guest-submit?guest=guest-aaa`, "POST", {
        availability: [
          { startUtc: "2024-03-05T14:00:00Z", endUtc: "2024-03-05T16:00:00Z" },
          { startUtc: "2024-03-06T14:00:00Z", endUtc: "2024-03-06T16:00:00Z" },
          { startUtc: "2024-03-07T14:00:00Z", endUtc: "2024-03-07T16:00:00Z" },
        ],
        guestTimezone: "America/New_York",
      })
    );
    expect(response.status).toBe(200);

    // Verify all ranges were stored
    const mockStorage = (obj as any).state.storage;
    const submissionsData = await mockStorage.get("group-submissions");
    expect(submissionsData.submissions[0].availability).toHaveLength(3);
  });
});

describe("Group availability aggregated endpoint", () => {
  function buildGroupAvailabilityRequest(overrides?: Record<string, unknown>) {
    return {
      id: "req-group-1",
      adminToken: "admin-token",
      hostName: "Host",
      hostTimezone: "America/New_York",
      allowedDateStart: "2024-03-01",
      allowedDateEnd: "2024-03-15",
      allowedTimeWindows: [{ startTime: "09:00", endTime: "17:00" }],
      createdAt: new Date("2024-02-15T10:00:00Z").toISOString(),
      type: "group-availability",
      guests: [
        { token: "guest-aaa", name: "Alice", email: "alice@example.com", invitedAt: "2024-02-15T10:00:00Z" },
        { token: "guest-bbb", name: "Bob", email: "bob@example.com", invitedAt: "2024-02-15T10:00:00Z" },
        { token: "guest-ccc", name: "Carol", email: "carol@example.com", invitedAt: "2024-02-15T10:00:00Z" },
      ],
      participationThreshold: 3,
      confirmed: false,
      ...overrides,
    };
  }

  it("requires admin token for aggregated view", async () => {
    const { namespace } = createEnv();
    const obj = namespace.getObject("req-group-1");
    const requestData = buildGroupAvailabilityRequest();
    await obj.fetch(jsonRequest(`${origin}/request`, "POST", requestData));

    // No admin token
    const noToken = await obj.fetch(new Request(`${origin}/aggregated`));
    expect(noToken.status).toBe(403);

    // Wrong admin token
    const wrongToken = await obj.fetch(new Request(`${origin}/aggregated?admin=wrong`));
    expect(wrongToken.status).toBe(403);

    // Correct admin token
    const validToken = await obj.fetch(
      new Request(`${origin}/aggregated?admin=${requestData.adminToken}`)
    );
    expect(validToken.status).toBe(200);
  });

  it("returns empty aggregated view with no submissions", async () => {
    const { namespace } = createEnv();
    const obj = namespace.getObject("req-group-1");
    const requestData = buildGroupAvailabilityRequest();
    await obj.fetch(jsonRequest(`${origin}/request`, "POST", requestData));

    const response = await obj.fetch(
      new Request(`${origin}/aggregated?admin=${requestData.adminToken}`)
    );
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.slots).toEqual([]);
    expect(data.totalGuests).toBe(0);
    expect(data.submittedCount).toBe(0);
    expect(data.maxParticipation).toBe(0);
    expect(data.guestStatus).toHaveLength(3);
    expect(data.guestStatus.every((g: any) => g.status === "pending")).toBe(true);
  });

  it("returns aggregated availability with submissions", async () => {
    const { namespace } = createEnv();
    const obj = namespace.getObject("req-group-1");
    const requestData = buildGroupAvailabilityRequest();
    await obj.fetch(jsonRequest(`${origin}/request`, "POST", requestData));

    // Guest A submits
    await obj.fetch(
      jsonRequest(`${origin}/guest-submit?guest=guest-aaa`, "POST", {
        availability: [
          { startUtc: "2024-03-05T14:00:00Z", endUtc: "2024-03-05T16:00:00Z" },
        ],
        guestTimezone: "America/New_York",
      })
    );

    // Guest B submits with overlapping time
    await obj.fetch(
      jsonRequest(`${origin}/guest-submit?guest=guest-bbb`, "POST", {
        availability: [
          { startUtc: "2024-03-05T14:30:00Z", endUtc: "2024-03-05T17:00:00Z" },
        ],
        guestTimezone: "America/Los_Angeles",
      })
    );

    const response = await obj.fetch(
      new Request(`${origin}/aggregated?admin=${requestData.adminToken}`)
    );
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.totalGuests).toBe(2);
    expect(data.submittedCount).toBe(2);
    expect(data.maxParticipation).toBeGreaterThan(0);
    expect(data.slots.length).toBeGreaterThan(0);

    // Check guest status
    expect(data.guestStatus).toHaveLength(3);
    const submittedGuests = data.guestStatus.filter((g: any) => g.status === "submitted");
    expect(submittedGuests).toHaveLength(2);
    const pendingGuests = data.guestStatus.filter((g: any) => g.status === "pending");
    expect(pendingGuests).toHaveLength(1);
  });

  it("caches aggregated results and invalidates on new submission", async () => {
    const { namespace } = createEnv();
    const obj = namespace.getObject("req-group-1");
    const requestData = buildGroupAvailabilityRequest();
    await obj.fetch(jsonRequest(`${origin}/request`, "POST", requestData));

    // Guest A submits
    await obj.fetch(
      jsonRequest(`${origin}/guest-submit?guest=guest-aaa`, "POST", {
        availability: [
          { startUtc: "2024-03-05T14:00:00Z", endUtc: "2024-03-05T16:00:00Z" },
        ],
        guestTimezone: "America/New_York",
      })
    );

    // First request - should compute and cache
    const response1 = await obj.fetch(
      new Request(`${origin}/aggregated?admin=${requestData.adminToken}`)
    );
    expect(response1.status).toBe(200);

    // Check cache was created
    const mockStorage = (obj as any).state.storage;
    const cachedData = await mockStorage.get("aggregated-cache");
    const cacheTimestamp = await mockStorage.get("cache-timestamp");
    expect(cachedData).toBeDefined();
    expect(cacheTimestamp).toBeDefined();

    // Second request - should use cache
    const response2 = await obj.fetch(
      new Request(`${origin}/aggregated?admin=${requestData.adminToken}`)
    );
    expect(response2.status).toBe(200);

    // Guest B submits - should invalidate cache
    await obj.fetch(
      jsonRequest(`${origin}/guest-submit?guest=guest-bbb`, "POST", {
        availability: [
          { startUtc: "2024-03-05T15:00:00Z", endUtc: "2024-03-05T17:00:00Z" },
        ],
        guestTimezone: "America/Los_Angeles",
      })
    );

    // Cache should be invalidated
    const cacheAfterSubmit = await mockStorage.get("aggregated-cache");
    const timestampAfterSubmit = await mockStorage.get("cache-timestamp");
    expect(cacheAfterSubmit).toBeUndefined();
    expect(timestampAfterSubmit).toBeUndefined();

    // Next request should recompute
    const response3 = await obj.fetch(
      new Request(`${origin}/aggregated?admin=${requestData.adminToken}`)
    );
    expect(response3.status).toBe(200);
    const data3 = await response3.json();
    expect(data3.submittedCount).toBe(2);
  });

  it("filters slots by minParticipation parameter", async () => {
    const { namespace } = createEnv();
    const obj = namespace.getObject("req-group-1");
    const requestData = buildGroupAvailabilityRequest();
    await obj.fetch(jsonRequest(`${origin}/request`, "POST", requestData));

    // Guest A submits
    await obj.fetch(
      jsonRequest(`${origin}/guest-submit?guest=guest-aaa`, "POST", {
        availability: [
          { startUtc: "2024-03-05T14:00:00Z", endUtc: "2024-03-05T16:00:00Z" },
        ],
        guestTimezone: "America/New_York",
      })
    );

    // Guest B submits with partial overlap
    await obj.fetch(
      jsonRequest(`${origin}/guest-submit?guest=guest-bbb`, "POST", {
        availability: [
          { startUtc: "2024-03-05T14:30:00Z", endUtc: "2024-03-05T17:00:00Z" },
        ],
        guestTimezone: "America/Los_Angeles",
      })
    );

    // Without filter - should return all slots
    const responseAll = await obj.fetch(
      new Request(`${origin}/aggregated?admin=${requestData.adminToken}`)
    );
    const dataAll = await responseAll.json();
    const totalSlots = dataAll.slots.length;

    // With minParticipation=2 - should only return slots with 2+ participants
    const responseFiltered = await obj.fetch(
      new Request(`${origin}/aggregated?admin=${requestData.adminToken}&minParticipation=2`)
    );
    const dataFiltered = await responseFiltered.json();
    
    expect(dataFiltered.slots.length).toBeLessThanOrEqual(totalSlots);
    expect(dataFiltered.slots.every((slot: any) => slot.participantCount >= 2)).toBe(true);
  });

  it("includes guest submission timestamps in status", async () => {
    const { namespace } = createEnv();
    const obj = namespace.getObject("req-group-1");
    const requestData = buildGroupAvailabilityRequest();
    await obj.fetch(jsonRequest(`${origin}/request`, "POST", requestData));

    // Guest A submits
    await obj.fetch(
      jsonRequest(`${origin}/guest-submit?guest=guest-aaa`, "POST", {
        availability: [
          { startUtc: "2024-03-05T14:00:00Z", endUtc: "2024-03-05T16:00:00Z" },
        ],
        guestTimezone: "America/New_York",
      })
    );

    const response = await obj.fetch(
      new Request(`${origin}/aggregated?admin=${requestData.adminToken}`)
    );
    const data = await response.json();

    const submittedGuest = data.guestStatus.find((g: any) => g.token === "guest-aaa");
    expect(submittedGuest.status).toBe("submitted");
    expect(submittedGuest.submittedAt).toBeDefined();
    expect(submittedGuest.updatedAt).toBeUndefined();

    const pendingGuest = data.guestStatus.find((g: any) => g.token === "guest-bbb");
    expect(pendingGuest.status).toBe("pending");
    expect(pendingGuest.submittedAt).toBeUndefined();
  });
});

describe("Group availability confirm endpoint", () => {
  function buildGroupRequest(overrides?: Record<string, unknown>) {
    return {
      id: "req-group",
      adminToken: "admin-token",
      hostName: "Alice",
      hostTimezone: "America/New_York",
      allowedDateStart: "2024-03-01",
      allowedDateEnd: "2024-03-15",
      allowedTimeWindows: [{ startTime: "09:00", endTime: "17:00" }],
      createdAt: new Date("2024-02-15T10:00:00Z").toISOString(),
      type: "group-availability",
      guests: [
        { token: "guest-aaa", name: "Bob", email: "bob@example.com", invitedAt: "2024-02-15T10:00:00Z" },
        { token: "guest-bbb", name: "Carol", email: "carol@example.com", invitedAt: "2024-02-15T10:00:00Z" },
        { token: "guest-ccc", name: "Dave", email: "dave@example.com", invitedAt: "2024-02-15T10:00:00Z" },
      ],
      confirmed: false,
      ...overrides,
    };
  }

  it("requires admin token for confirmation", async () => {
    const { namespace } = createEnv();
    const obj = namespace.getObject("req-confirm-1");
    const requestData = buildGroupRequest();
    await obj.fetch(jsonRequest(`${origin}/request`, "POST", requestData));

    const response = await obj.fetch(
      jsonRequest(`${origin}/confirm`, "POST", {
        startUtc: "2024-03-05T14:00:00Z",
        endUtc: "2024-03-05T15:00:00Z",
        title: "Team Meeting",
      })
    );
    expect(response.status).toBe(403);
  });

  it("requires title for confirmation", async () => {
    const { namespace } = createEnv();
    const obj = namespace.getObject("req-confirm-2");
    const requestData = buildGroupRequest();
    await obj.fetch(jsonRequest(`${origin}/request`, "POST", requestData));

    const response = await obj.fetch(
      jsonRequest(`${origin}/confirm?admin=${requestData.adminToken}`, "POST", {
        startUtc: "2024-03-05T14:00:00Z",
        endUtc: "2024-03-05T15:00:00Z",
      })
    );
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain("title is required");
  });

  it("rejects confirmation with no guest submissions", async () => {
    const { namespace } = createEnv();
    const obj = namespace.getObject("req-confirm-3");
    const requestData = buildGroupRequest();
    await obj.fetch(jsonRequest(`${origin}/request`, "POST", requestData));

    const response = await obj.fetch(
      jsonRequest(`${origin}/confirm?admin=${requestData.adminToken}`, "POST", {
        startUtc: "2024-03-05T14:00:00Z",
        endUtc: "2024-03-05T15:00:00Z",
        title: "Team Meeting",
      })
    );
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain("no guest submissions");
  });

  it("rejects confirmation when slot does not overlap with any guest availability", async () => {
    const { namespace } = createEnv();
    const obj = namespace.getObject("req-confirm-4");
    const requestData = buildGroupRequest();
    await obj.fetch(jsonRequest(`${origin}/request`, "POST", requestData));

    // Submit guest availability using the proper endpoint
    await obj.fetch(
      jsonRequest(`${origin}/guest-submit?guest=guest-aaa`, "POST", {
        availability: [
          { startUtc: "2024-03-05T14:00:00Z", endUtc: "2024-03-05T16:00:00Z" },
        ],
        guestTimezone: "America/Los_Angeles",
      })
    );

    // Try to confirm a slot that doesn't overlap
    const response = await obj.fetch(
      jsonRequest(`${origin}/confirm?admin=${requestData.adminToken}`, "POST", {
        startUtc: "2024-03-05T18:00:00Z",
        endUtc: "2024-03-05T19:00:00Z",
        title: "Team Meeting",
      })
    );
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain("does not overlap with any guest availability");
  });

  it("successfully confirms a slot that overlaps with guest availability", async () => {
    const { namespace } = createEnv();
    const obj = namespace.getObject("req-confirm-5");
    const requestData = buildGroupRequest();
    await obj.fetch(jsonRequest(`${origin}/request`, "POST", requestData));

    // Submit guest availability using the proper endpoint
    await obj.fetch(
      jsonRequest(`${origin}/guest-submit?guest=guest-aaa`, "POST", {
        availability: [
          { startUtc: "2024-03-05T14:00:00Z", endUtc: "2024-03-05T16:00:00Z" },
        ],
        guestTimezone: "America/Los_Angeles",
      })
    );
    await obj.fetch(
      jsonRequest(`${origin}/guest-submit?guest=guest-bbb`, "POST", {
        availability: [
          { startUtc: "2024-03-05T14:30:00Z", endUtc: "2024-03-05T18:00:00Z" },
        ],
        guestTimezone: "Europe/London",
      })
    );

    // Confirm a slot that overlaps with both guests
    const response = await obj.fetch(
      jsonRequest(`${origin}/confirm?admin=${requestData.adminToken}`, "POST", {
        startUtc: "2024-03-05T14:30:00Z",
        endUtc: "2024-03-05T15:30:00Z",
        title: "Team Meeting",
        description: "Discuss project roadmap",
        location: "Zoom",
      })
    );
    expect(response.status).toBe(200);

    // Verify confirmed slot is stored
    const getResponse = await obj.fetch(
      new Request(`${origin}/request?admin=${requestData.adminToken}`)
    );
    const data = await getResponse.json();
    expect(data.confirmedSlot).toBeDefined();
    expect(data.confirmedSlot.title).toBe("Team Meeting");
    expect(data.confirmedSlot.startUtc).toBe("2024-03-05T14:30:00Z");
    expect(data.confirmedSlot.endUtc).toBe("2024-03-05T15:30:00Z");
    expect(data.confirmedSlot.description).toBe("Discuss project roadmap");
    expect(data.confirmedSlot.location).toBe("Zoom");
    expect(data.confirmedSlot.confirmedAt).toBeDefined();
  });

  it("marks request as confirmed after confirmation", async () => {
    const { namespace } = createEnv();
    const obj = namespace.getObject("req-confirm-6");
    const requestData = buildGroupRequest();
    await obj.fetch(jsonRequest(`${origin}/request`, "POST", requestData));

    // Submit guest availability using the proper endpoint
    await obj.fetch(
      jsonRequest(`${origin}/guest-submit?guest=guest-aaa`, "POST", {
        availability: [
          { startUtc: "2024-03-05T14:00:00Z", endUtc: "2024-03-05T16:00:00Z" },
        ],
        guestTimezone: "America/Los_Angeles",
      })
    );

    // Confirm slot
    await obj.fetch(
      jsonRequest(`${origin}/confirm?admin=${requestData.adminToken}`, "POST", {
        startUtc: "2024-03-05T14:30:00Z",
        endUtc: "2024-03-05T15:30:00Z",
        title: "Team Meeting",
      })
    );

    // Verify request is marked as confirmed
    const getResponse = await obj.fetch(
      new Request(`${origin}/request?admin=${requestData.adminToken}`)
    );
    const data = await getResponse.json();
    expect(data.confirmed).toBe(true);
  });

  it("sends confirmation emails to all guests when enabled", async () => {
    const { namespace } = createEnv({
      RESEND_API_KEY: "re_test_key",
      EMAIL_FROM: "Test <test@example.com>",
      EMAIL_CONFIRM_ENABLED: "true",
    });
    const obj = namespace.getObject("req-confirm-7");
    const requestData = buildGroupRequest();
    await obj.fetch(jsonRequest(`${origin}/request`, "POST", requestData));

    // Submit guest availability using the proper endpoint
    await obj.fetch(
      jsonRequest(`${origin}/guest-submit?guest=guest-aaa`, "POST", {
        availability: [
          { startUtc: "2024-03-05T14:00:00Z", endUtc: "2024-03-05T16:00:00Z" },
        ],
        guestTimezone: "America/Los_Angeles",
      })
    );
    await obj.fetch(
      jsonRequest(`${origin}/guest-submit?guest=guest-bbb`, "POST", {
        availability: [
          { startUtc: "2024-03-05T14:30:00Z", endUtc: "2024-03-05T18:00:00Z" },
        ],
        guestTimezone: "Europe/London",
      })
    );

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "email-123" }), { status: 200 })
    );

    // Confirm slot
    const response = await obj.fetch(
      jsonRequest(`${origin}/confirm?admin=${requestData.adminToken}`, "POST", {
        startUtc: "2024-03-05T14:30:00Z",
        endUtc: "2024-03-05T15:30:00Z",
        title: "Team Meeting",
        location: "Zoom",
      })
    );
    expect(response.status).toBe(200);

    // Verify emails were sent to all guests
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    const emailCalls = fetchSpy.mock.calls.map(call => JSON.parse(call[1]?.body as string));
    
    expect(emailCalls[0].to).toEqual(["bob@example.com"]);
    expect(emailCalls[1].to).toEqual(["carol@example.com"]);
    expect(emailCalls[2].to).toEqual(["dave@example.com"]);
    
    emailCalls.forEach(email => {
      expect(email.subject).toBe("Confirmed: Team Meeting");
      expect(email.html).toContain("Your meeting is confirmed!");
      expect(email.attachments).toHaveLength(1);
    });
  });

  it("does not send emails when feature flag is disabled", async () => {
    const { namespace } = createEnv({
      RESEND_API_KEY: "re_test_key",
      EMAIL_FROM: "Test <test@example.com>",
      EMAIL_CONFIRM_ENABLED: "false",
    });
    const obj = namespace.getObject("req-confirm-8");
    const requestData = buildGroupRequest();
    await obj.fetch(jsonRequest(`${origin}/request`, "POST", requestData));

    // Submit guest availability using the proper endpoint
    await obj.fetch(
      jsonRequest(`${origin}/guest-submit?guest=guest-aaa`, "POST", {
        availability: [
          { startUtc: "2024-03-05T14:00:00Z", endUtc: "2024-03-05T16:00:00Z" },
        ],
        guestTimezone: "America/Los_Angeles",
      })
    );

    const fetchSpy = vi.spyOn(globalThis, "fetch");

    // Confirm slot
    const response = await obj.fetch(
      jsonRequest(`${origin}/confirm?admin=${requestData.adminToken}`, "POST", {
        startUtc: "2024-03-05T14:30:00Z",
        endUtc: "2024-03-05T15:30:00Z",
        title: "Team Meeting",
      })
    );
    expect(response.status).toBe(200);

    // Verify no emails were sent
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("Group availability export.ics endpoint", () => {
  function buildGroupAvailabilityRequest(overrides?: Record<string, unknown>) {
    return {
      id: "req-group-1",
      adminToken: "admin-token",
      hostName: "Host",
      hostTimezone: "America/New_York",
      allowedDateStart: "2024-03-01",
      allowedDateEnd: "2024-03-15",
      allowedTimeWindows: [{ startTime: "09:00", endTime: "17:00" }],
      createdAt: new Date("2024-02-15T10:00:00Z").toISOString(),
      type: "group-availability",
      guests: [
        { token: "guest-aaa", name: "Alice", email: "alice@example.com", invitedAt: "2024-02-15T10:00:00Z" },
        { token: "guest-bbb", name: "Bob", email: "bob@example.com", invitedAt: "2024-02-15T10:00:00Z" },
        { token: "guest-ccc", name: "Carol", email: "carol@example.com", invitedAt: "2024-02-15T10:00:00Z" },
      ],
      participationThreshold: 3,
      confirmed: false,
      ...overrides,
    };
  }

  it("returns 403 without admin token", async () => {
    const { namespace } = createEnv();
    const obj = namespace.getObject("req-group-1");
    await obj.fetch(jsonRequest(`${origin}/request`, "POST", buildGroupAvailabilityRequest()));

    const response = await obj.fetch(new Request(`${origin}/export.ics`));
    expect(response.status).toBe(403);
  });

  it("returns 403 with wrong admin token", async () => {
    const { namespace } = createEnv();
    const obj = namespace.getObject("req-group-1");
    await obj.fetch(jsonRequest(`${origin}/request`, "POST", buildGroupAvailabilityRequest()));

    const response = await obj.fetch(new Request(`${origin}/export.ics?admin=wrong-token`));
    expect(response.status).toBe(403);
  });

  it("returns 404 when no submissions exist", async () => {
    const { namespace } = createEnv();
    const obj = namespace.getObject("req-group-1");
    await obj.fetch(jsonRequest(`${origin}/request`, "POST", buildGroupAvailabilityRequest()));

    const response = await obj.fetch(new Request(`${origin}/export.ics?admin=admin-token`));
    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data.error).toContain("No submissions yet");
  });

  it("returns valid .ics with all guest submissions", async () => {
    const { namespace } = createEnv();
    const obj = namespace.getObject("req-group-1");
    await obj.fetch(jsonRequest(`${origin}/request`, "POST", buildGroupAvailabilityRequest()));

    // Store two guest submissions directly
    const mockStorage = (obj as any).state.storage;
    await mockStorage.put("group-submissions", {
      submissions: [
        {
          guestToken: "guest-aaa",
          availability: [
            { startUtc: "2024-03-05T14:00:00Z", endUtc: "2024-03-05T16:00:00Z" },
            { startUtc: "2024-03-06T14:00:00Z", endUtc: "2024-03-06T16:00:00Z" },
          ],
          guestTimezone: "America/New_York",
          submittedAt: "2024-02-16T08:00:00Z",
        },
        {
          guestToken: "guest-bbb",
          availability: [
            { startUtc: "2024-03-05T15:00:00Z", endUtc: "2024-03-05T17:00:00Z" },
          ],
          guestTimezone: "Europe/London",
          submittedAt: "2024-02-16T09:00:00Z",
        },
      ],
    });

    const response = await obj.fetch(new Request(`${origin}/export.ics?admin=admin-token`));
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/calendar");
    expect(response.headers.get("Content-Disposition")).toContain(".ics");

    const ics = await response.text();
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("END:VCALENDAR");
    expect(ics).toContain("VERSION:2.0");

    // Should have 3 VEVENT blocks (2 for Alice, 1 for Bob)
    const eventCount = (ics.match(/BEGIN:VEVENT/g) ?? []).length;
    expect(eventCount).toBe(3);

    // Guest names in summaries
    expect(ics).toContain("SUMMARY:Available: Alice");
    expect(ics).toContain("SUMMARY:Available: Bob");

    // Guest timezones in descriptions
    expect(ics).toContain("America/New_York");
    expect(ics).toContain("Europe/London");

    // UIDs include request id and guest token
    expect(ics).toContain("req-group-1-guest-aaa-0@auto-invite");
    expect(ics).toContain("req-group-1-guest-bbb-0@auto-invite");
  });

  it("includes confirmed slot as a separate VEVENT when present", async () => {
    const { namespace } = createEnv();
    const obj = namespace.getObject("req-group-1");
    await obj.fetch(jsonRequest(`${origin}/request`, "POST", buildGroupAvailabilityRequest()));

    const mockStorage = (obj as any).state.storage;
    await mockStorage.put("group-submissions", {
      submissions: [
        {
          guestToken: "guest-aaa",
          availability: [
            { startUtc: "2024-03-05T14:00:00Z", endUtc: "2024-03-05T16:00:00Z" },
          ],
          guestTimezone: "America/New_York",
          submittedAt: "2024-02-16T08:00:00Z",
        },
      ],
    });
    await mockStorage.put("confirmed", {
      startUtc: "2024-03-05T14:30:00Z",
      endUtc: "2024-03-05T15:30:00Z",
      title: "Team Sync",
      description: "Weekly sync meeting",
      location: "Zoom",
      confirmedAt: "2024-02-17T10:00:00Z",
    });

    const response = await obj.fetch(new Request(`${origin}/export.ics?admin=admin-token`));
    expect(response.status).toBe(200);

    const ics = await response.text();

    // 1 availability event + 1 confirmed event
    const eventCount = (ics.match(/BEGIN:VEVENT/g) ?? []).length;
    expect(eventCount).toBe(2);

    // Confirmed event details
    expect(ics).toContain("SUMMARY:Team Sync");
    expect(ics).toContain("STATUS:CONFIRMED");
    expect(ics).toContain("LOCATION:Zoom");
    expect(ics).toContain("req-group-1-confirmed@auto-invite");

    // Availability event still present
    expect(ics).toContain("SUMMARY:Available: Alice");
    expect(ics).toContain("STATUS:TENTATIVE");
  });

  it("exports without confirmed slot when not yet confirmed (req 10.4)", async () => {
    const { namespace } = createEnv();
    const obj = namespace.getObject("req-group-1");
    await obj.fetch(jsonRequest(`${origin}/request`, "POST", buildGroupAvailabilityRequest()));

    const mockStorage = (obj as any).state.storage;
    await mockStorage.put("group-submissions", {
      submissions: [
        {
          guestToken: "guest-aaa",
          availability: [
            { startUtc: "2024-03-05T14:00:00Z", endUtc: "2024-03-05T16:00:00Z" },
          ],
          guestTimezone: "America/New_York",
          submittedAt: "2024-02-16T08:00:00Z",
        },
      ],
    });
    // No confirmed slot stored

    const response = await obj.fetch(new Request(`${origin}/export.ics?admin=admin-token`));
    expect(response.status).toBe(200);

    const ics = await response.text();
    const eventCount = (ics.match(/BEGIN:VEVENT/g) ?? []).length;
    expect(eventCount).toBe(1);
    expect(ics).not.toContain("STATUS:CONFIRMED");
    expect(ics).toContain("STATUS:TENTATIVE");
  });

  it("includes guest names and timezones in event descriptions (req 10.3)", async () => {
    const { namespace } = createEnv();
    const obj = namespace.getObject("req-group-1");
    await obj.fetch(jsonRequest(`${origin}/request`, "POST", buildGroupAvailabilityRequest()));

    const mockStorage = (obj as any).state.storage;
    await mockStorage.put("group-submissions", {
      submissions: [
        {
          guestToken: "guest-aaa",
          availability: [
            { startUtc: "2024-03-05T14:00:00Z", endUtc: "2024-03-05T16:00:00Z" },
          ],
          guestTimezone: "Asia/Tokyo",
          submittedAt: "2024-02-16T08:00:00Z",
        },
      ],
    });

    const response = await obj.fetch(new Request(`${origin}/export.ics?admin=admin-token`));
    const ics = await response.text();

    // Description should include guest name and timezone
    expect(ics).toContain("Alice");
    expect(ics).toContain("Asia/Tokyo");
    expect(ics).toContain("alice@example.com");
  });

  it("sets correct Content-Disposition filename", async () => {
    const { namespace } = createEnv();
    const obj = namespace.getObject("req-group-1");
    await obj.fetch(jsonRequest(`${origin}/request`, "POST", buildGroupAvailabilityRequest()));

    const mockStorage = (obj as any).state.storage;
    await mockStorage.put("group-submissions", {
      submissions: [
        {
          guestToken: "guest-aaa",
          availability: [
            { startUtc: "2024-03-05T14:00:00Z", endUtc: "2024-03-05T16:00:00Z" },
          ],
          guestTimezone: "America/New_York",
          submittedAt: "2024-02-16T08:00:00Z",
        },
      ],
    });

    const response = await obj.fetch(new Request(`${origin}/export.ics?admin=admin-token`));
    const disposition = response.headers.get("Content-Disposition") ?? "";
    expect(disposition).toContain("group-availability-req-group-1.ics");
  });
});

describe("PUT /request - group-availability support (task 12.1)", () => {
  function buildGroupRequest(overrides?: Record<string, unknown>) {
    return {
      id: "req-group-put",
      adminToken: "admin-token",
      hostName: "Host",
      hostTimezone: "America/New_York",
      allowedDateStart: "2024-03-01",
      allowedDateEnd: "2024-03-15",
      allowedTimeWindows: [{ startTime: "09:00", endTime: "17:00" }],
      createdAt: new Date("2024-02-15T10:00:00Z").toISOString(),
      type: "group-availability",
      guests: [
        { token: "guest-aaa", name: "Alice", email: "alice@example.com", invitedAt: "2024-02-15T10:00:00Z" },
        { token: "guest-bbb", name: "Bob", email: "bob@example.com", invitedAt: "2024-02-15T10:00:00Z" },
        { token: "guest-ccc", name: "Carol", email: "carol@example.com", invitedAt: "2024-02-15T10:00:00Z" },
      ],
      confirmed: false,
      ...overrides,
    };
  }

  it("successfully updates a group-availability request", async () => {
    const { namespace } = createEnv();
    const obj = namespace.getObject("req-group-put");
    await obj.fetch(jsonRequest(`${origin}/request`, "POST", buildGroupRequest()));

    const response = await obj.fetch(
      jsonRequest(`${origin}/request?admin=admin-token`, "PUT", {
        hostName: "Updated Host",
        hostTimezone: "Europe/London",
        allowedDateStart: "2024-04-01",
        allowedDateEnd: "2024-04-10",
        allowedTimeWindows: [{ startTime: "10:00", endTime: "18:00" }],
        guests: [
          { token: "guest-aaa", name: "Alice", email: "alice@example.com", invitedAt: "2024-02-15T10:00:00Z" },
          { token: "guest-bbb", name: "Bob", email: "bob@example.com", invitedAt: "2024-02-15T10:00:00Z" },
          { token: "guest-ccc", name: "Carol", email: "carol@example.com", invitedAt: "2024-02-15T10:00:00Z" },
        ],
      })
    );
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.ok).toBe(true);

    // Verify stored data was updated
    const getResponse = await obj.fetch(
      new Request(`${origin}/request?admin=admin-token`)
    );
    const stored = await getResponse.json();
    expect(stored.hostName).toBe("Updated Host");
    expect(stored.hostTimezone).toBe("Europe/London");
    expect(stored.allowedDateStart).toBe("2024-04-01");
    expect(stored.allowedDateEnd).toBe("2024-04-10");
  });

  it("rejects update with fewer than 3 guests", async () => {
    const { namespace } = createEnv();
    const obj = namespace.getObject("req-group-put");
    await obj.fetch(jsonRequest(`${origin}/request`, "POST", buildGroupRequest()));

    const response = await obj.fetch(
      jsonRequest(`${origin}/request?admin=admin-token`, "PUT", {
        ...buildGroupRequest(),
        guests: [
          { token: "guest-aaa", name: "Alice", email: "alice@example.com", invitedAt: "2024-02-15T10:00:00Z" },
          { token: "guest-bbb", name: "Bob", email: "bob@example.com", invitedAt: "2024-02-15T10:00:00Z" },
        ],
      })
    );
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain("Minimum 3 guests");
  });

  it("rejects update with more than 50 guests", async () => {
    const { namespace } = createEnv();
    const obj = namespace.getObject("req-group-put");
    await obj.fetch(jsonRequest(`${origin}/request`, "POST", buildGroupRequest()));

    const tooManyGuests = Array.from({ length: 51 }, (_, i) => ({
      token: `guest-${i}`,
      name: `Guest ${i}`,
      email: `guest${i}@example.com`,
      invitedAt: "2024-02-15T10:00:00Z",
    }));

    const response = await obj.fetch(
      jsonRequest(`${origin}/request?admin=admin-token`, "PUT", {
        ...buildGroupRequest(),
        guests: tooManyGuests,
      })
    );
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain("Maximum 50 guests");
  });

  it("rejects update with duplicate guest emails", async () => {
    const { namespace } = createEnv();
    const obj = namespace.getObject("req-group-put");
    await obj.fetch(jsonRequest(`${origin}/request`, "POST", buildGroupRequest()));

    const response = await obj.fetch(
      jsonRequest(`${origin}/request?admin=admin-token`, "PUT", {
        ...buildGroupRequest(),
        guests: [
          { token: "guest-aaa", name: "Alice", email: "alice@example.com", invitedAt: "2024-02-15T10:00:00Z" },
          { token: "guest-bbb", name: "Bob", email: "alice@example.com", invitedAt: "2024-02-15T10:00:00Z" },
          { token: "guest-ccc", name: "Carol", email: "carol@example.com", invitedAt: "2024-02-15T10:00:00Z" },
        ],
      })
    );
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain("Duplicate guest email");
  });

  it("rejects update with invalid email format", async () => {
    const { namespace } = createEnv();
    const obj = namespace.getObject("req-group-put");
    await obj.fetch(jsonRequest(`${origin}/request`, "POST", buildGroupRequest()));

    const response = await obj.fetch(
      jsonRequest(`${origin}/request?admin=admin-token`, "PUT", {
        ...buildGroupRequest(),
        guests: [
          { token: "guest-aaa", name: "Alice", email: "not-an-email", invitedAt: "2024-02-15T10:00:00Z" },
          { token: "guest-bbb", name: "Bob", email: "bob@example.com", invitedAt: "2024-02-15T10:00:00Z" },
          { token: "guest-ccc", name: "Carol", email: "carol@example.com", invitedAt: "2024-02-15T10:00:00Z" },
        ],
      })
    );
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain("Invalid email format");
  });

  it("rejects update with date range exceeding 60 days", async () => {
    const { namespace } = createEnv();
    const obj = namespace.getObject("req-group-put");
    await obj.fetch(jsonRequest(`${origin}/request`, "POST", buildGroupRequest()));

    const response = await obj.fetch(
      jsonRequest(`${origin}/request?admin=admin-token`, "PUT", {
        ...buildGroupRequest(),
        allowedDateStart: "2024-01-01",
        allowedDateEnd: "2024-03-15",
      })
    );
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain("60 days");
  });

  it("rejects update with invalid time window (start >= end)", async () => {
    const { namespace } = createEnv();
    const obj = namespace.getObject("req-group-put");
    await obj.fetch(jsonRequest(`${origin}/request`, "POST", buildGroupRequest()));

    const response = await obj.fetch(
      jsonRequest(`${origin}/request?admin=admin-token`, "PUT", {
        ...buildGroupRequest(),
        allowedTimeWindows: [{ startTime: "17:00", endTime: "09:00" }],
      })
    );
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain("Time windows");
  });

  it("rejects update with invalid timezone", async () => {
    const { namespace } = createEnv();
    const obj = namespace.getObject("req-group-put");
    await obj.fetch(jsonRequest(`${origin}/request`, "POST", buildGroupRequest()));

    const response = await obj.fetch(
      jsonRequest(`${origin}/request?admin=admin-token`, "PUT", {
        ...buildGroupRequest(),
        hostTimezone: "Not/ATimezone",
      })
    );
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain("Invalid timezone");
  });

  it("warns when existing submissions are present", async () => {
    const { namespace } = createEnv();
    const obj = namespace.getObject("req-group-put");
    await obj.fetch(jsonRequest(`${origin}/request`, "POST", buildGroupRequest()));

    // Seed a submission
    const mockStorage = (obj as any).state.storage;
    await mockStorage.put("group-submissions", {
      submissions: [
        {
          guestToken: "guest-aaa",
          availability: [{ startUtc: "2024-03-05T14:00:00Z", endUtc: "2024-03-05T16:00:00Z" }],
          guestTimezone: "America/New_York",
          submittedAt: "2024-02-16T08:00:00Z",
        },
      ],
    });

    const response = await obj.fetch(
      jsonRequest(`${origin}/request?admin=admin-token`, "PUT", buildGroupRequest())
    );
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.ok).toBe(true);
    expect(data.warning).toContain("invalidated");
  });

  it("invalidates aggregation cache on update", async () => {
    const { namespace } = createEnv();
    const obj = namespace.getObject("req-group-put");
    await obj.fetch(jsonRequest(`${origin}/request`, "POST", buildGroupRequest()));

    // Seed a cache
    const mockStorage = (obj as any).state.storage;
    await mockStorage.put("aggregated-cache", { slots: [], totalGuests: 3, submittedCount: 0, maxParticipation: 0 });
    await mockStorage.put("cache-timestamp", new Date().toISOString());

    await obj.fetch(
      jsonRequest(`${origin}/request?admin=admin-token`, "PUT", buildGroupRequest())
    );

    expect(await mockStorage.get("aggregated-cache")).toBeUndefined();
    expect(await mockStorage.get("cache-timestamp")).toBeUndefined();
  });

  it("still applies legacy validation for non-group-availability requests", async () => {
    const { namespace } = createEnv();
    const obj = namespace.getObject("req-individual");
    const requestData = buildRequestData();
    await obj.fetch(jsonRequest(`${origin}/request`, "POST", requestData));

    // Missing guestName should fail for individual requests
    const response = await obj.fetch(
      jsonRequest(`${origin}/request?admin=${requestData.adminToken}`, "PUT", {
        ...buildRequestPayload(),
        guestName: "",
      })
    );
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain("Guest name is required");
  });
});

describe("DELETE /request - confirmed request prevention (task 12.2)", () => {
  function buildGroupRequest(overrides?: Record<string, unknown>) {
    return {
      id: "req-group-del",
      adminToken: "admin-token",
      hostName: "Host",
      hostTimezone: "America/New_York",
      allowedDateStart: "2024-03-01",
      allowedDateEnd: "2024-03-15",
      allowedTimeWindows: [{ startTime: "09:00", endTime: "17:00" }],
      createdAt: new Date("2024-02-15T10:00:00Z").toISOString(),
      type: "group-availability",
      guests: [
        { token: "guest-aaa", name: "Alice", email: "alice@example.com", invitedAt: "2024-02-15T10:00:00Z" },
        { token: "guest-bbb", name: "Bob", email: "bob@example.com", invitedAt: "2024-02-15T10:00:00Z" },
        { token: "guest-ccc", name: "Carol", email: "carol@example.com", invitedAt: "2024-02-15T10:00:00Z" },
      ],
      confirmed: false,
      ...overrides,
    };
  }

  it("rejects deletion of a confirmed group-availability request with 409", async () => {
    const { namespace } = createEnv();
    const obj = namespace.getObject("req-group-del");
    await obj.fetch(jsonRequest(`${origin}/request`, "POST", buildGroupRequest({ confirmed: true })));

    const response = await obj.fetch(
      new Request(`${origin}/request?admin=admin-token`, { method: "DELETE" })
    );
    expect(response.status).toBe(409);
    const data = await response.json();
    expect(data.error).toContain("Cannot delete: request has been confirmed");
  });

  it("rejects deletion of a confirmed individual request with 409", async () => {
    const { namespace } = createEnv();
    const obj = namespace.getObject("req-individual-confirmed");
    const requestData = buildRequestData();
    await obj.fetch(jsonRequest(`${origin}/request`, "POST", requestData));

    // Confirm the request via the confirm endpoint
    await obj.fetch(
      jsonRequest(`${origin}/confirm?admin=${requestData.adminToken}`, "POST", {
        startUtc: "2024-01-01T10:00:00Z",
        endUtc: "2024-01-01T11:00:00Z",
      })
    );

    const response = await obj.fetch(
      new Request(`${origin}/request?admin=${requestData.adminToken}`, { method: "DELETE" })
    );
    expect(response.status).toBe(409);
    const data = await response.json();
    expect(data.error).toContain("Cannot delete: request has been confirmed");
  });

  it("successfully deletes an unconfirmed group-availability request", async () => {
    const { namespace } = createEnv();
    const obj = namespace.getObject("req-group-del");
    await obj.fetch(jsonRequest(`${origin}/request`, "POST", buildGroupRequest()));

    const response = await obj.fetch(
      new Request(`${origin}/request?admin=admin-token`, { method: "DELETE" })
    );
    expect(response.status).toBe(200);

    // Request should be gone
    const getResponse = await obj.fetch(new Request(`${origin}/request`));
    expect(getResponse.status).toBe(404);
  });

  it("deletes all group-specific storage keys on deletion", async () => {
    const { namespace } = createEnv();
    const obj = namespace.getObject("req-group-del");
    await obj.fetch(jsonRequest(`${origin}/request`, "POST", buildGroupRequest()));

    // Seed all group-specific keys
    const mockStorage = (obj as any).state.storage;
    await mockStorage.put("group-submissions", { submissions: [] });
    await mockStorage.put("aggregated-cache", { slots: [] });
    await mockStorage.put("cache-timestamp", new Date().toISOString());
    await mockStorage.put("confirmed", { startUtc: "2024-03-05T14:00:00Z", endUtc: "2024-03-05T15:00:00Z", title: "Test" });

    // Override confirmed flag to false so deletion is allowed
    const stored = await mockStorage.get("request");
    await mockStorage.put("request", { ...stored, confirmed: false });

    await obj.fetch(
      new Request(`${origin}/request?admin=admin-token`, { method: "DELETE" })
    );

    expect(await mockStorage.get("request")).toBeUndefined();
    expect(await mockStorage.get("group-submissions")).toBeUndefined();
    expect(await mockStorage.get("aggregated-cache")).toBeUndefined();
    expect(await mockStorage.get("cache-timestamp")).toBeUndefined();
    expect(await mockStorage.get("confirmed")).toBeUndefined();
  });
});

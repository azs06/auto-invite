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

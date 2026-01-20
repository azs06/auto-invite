import { afterEach, describe, expect, it, vi } from "vitest";
import worker, { type Env } from "../src/worker";
import {
  buildRequestPayload,
  createEnv,
  invalidJsonRequest,
  jsonRequest,
} from "./test-utils";

const origin = "http://localhost";

async function createRequest(env: Env, overrides?: Record<string, unknown>) {
  const payload = buildRequestPayload(overrides);
  const response = await worker.fetch(
    jsonRequest(`${origin}/api/request`, "POST", payload),
    env
  );
  const data = await response.json();
  return { response, data, payload };
}

function extractAdminToken(adminUrl: string) {
  const url = new URL(adminUrl);
  return url.searchParams.get("admin") || "";
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("worker routing and handlers", () => {
  it("redirects / to /new", async () => {
    const { env } = createEnv();
    const response = await worker.fetch(new Request(`${origin}/`), env);
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(`${origin}/new`);
  });

  it("serves the new request page", async () => {
    const { env } = createEnv();
    const response = await worker.fetch(new Request(`${origin}/new`), env);
    const body = await response.text();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(body).toContain("Create an availability request");
  });

  it("serves the request page", async () => {
    const { env } = createEnv();
    const response = await worker.fetch(new Request(`${origin}/r/example`), env);
    const body = await response.text();
    expect(response.status).toBe(200);
    expect(body).toContain("Share your availability");
  });

  it("returns 404 for unknown routes", async () => {
    const { env } = createEnv();
    const response = await worker.fetch(new Request(`${origin}/nope`), env);
    expect(response.status).toBe(404);
  });

  it("rejects invalid JSON for create request", async () => {
    const { env } = createEnv();
    const response = await worker.fetch(
      invalidJsonRequest(`${origin}/api/request`, "POST"),
      env
    );
    const data = await response.json();
    expect(response.status).toBe(400);
    expect(data.error).toBe("Invalid JSON.");
  });

  it("validates create request payload", async () => {
    const { env } = createEnv();
    const payload = buildRequestPayload({
      hostName: "",
      guestName: "",
      guestEmail: "",
      hostTimezone: "",
      allowedDateStart: "bad",
      allowedDateEnd: "also-bad",
    });
    const response = await worker.fetch(
      jsonRequest(`${origin}/api/request`, "POST", payload),
      env
    );
    const data = await response.json();
    expect(response.status).toBe(400);
    expect(data.error).toContain("Your name is required.");
    expect(data.error).toContain("Guest name is required.");
    expect(data.error).toContain("Guest email is required.");
    expect(data.error).toContain("Host timezone is required.");
    expect(data.error).toContain("Valid start date is required.");
    expect(data.error).toContain("Valid end date is required.");
  });

  it("handles missing fields on create", async () => {
    const { env } = createEnv();
    const response = await worker.fetch(
      jsonRequest(`${origin}/api/request`, "POST", {}),
      env
    );
    const data = await response.json();
    expect(response.status).toBe(400);
    expect(data.error).toContain("Your name is required.");
  });

  it("rejects invalid date order and time windows on create", async () => {
    const { env } = createEnv();
    const payload = buildRequestPayload({
      allowedDateStart: "2024-02-02",
      allowedDateEnd: "2024-01-01",
      allowedTimeWindows: [{ startTime: "18:00", endTime: "09:00" }],
    });
    const response = await worker.fetch(
      jsonRequest(`${origin}/api/request`, "POST", payload),
      env
    );
    const data = await response.json();
    expect(response.status).toBe(400);
    expect(data.error).toContain("Start date must be on or before end date.");
    expect(data.error).toContain("Time windows must be valid and ordered.");
  });

  it("creates a request and returns URLs", async () => {
    const { env } = createEnv();
    const { response, data } = await createRequest(env);
    expect(response.status).toBe(200);
    expect(data.requestId).toBeTruthy();
    expect(data.guestUrl).toContain("/r/");
    expect(data.adminUrl).toContain("?admin=");
  });

  it("sends invite email when enabled", async () => {
    const { env } = createEnv({
      RESEND_API_KEY: "re_test_key",
      EMAIL_FROM: "Test <test@example.com>",
      EMAIL_INVITE_ENABLED: "true",
    });
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "email-123" }), { status: 200 })
    );

    const { response, data } = await createRequest(env);
    expect(response.status).toBe(200);

    // Find the email API call (not the DO call)
    const emailCalls = fetchSpy.mock.calls.filter(
      (call) => call[0] === "https://api.resend.com/emails"
    );
    expect(emailCalls.length).toBe(1);

    const emailBody = JSON.parse(emailCalls[0][1]?.body as string);
    expect(emailBody.to).toEqual(["guest@example.com"]);
    expect(emailBody.subject).toContain("Host");
    expect(emailBody.html).toContain(data.guestUrl);
  });

  it("does not send invite email when disabled", async () => {
    const { env } = createEnv({
      RESEND_API_KEY: "re_test_key",
      EMAIL_FROM: "Test <test@example.com>",
      EMAIL_INVITE_ENABLED: "false",
    });
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "email-123" }), { status: 200 })
    );

    await createRequest(env);

    const emailCalls = fetchSpy.mock.calls.filter(
      (call) => call[0] === "https://api.resend.com/emails"
    );
    expect(emailCalls.length).toBe(0);
  });

  it("continues request creation even if email fails", async () => {
    const { env } = createEnv({
      RESEND_API_KEY: "re_test_key",
      EMAIL_FROM: "Test <test@example.com>",
      EMAIL_INVITE_ENABLED: "true",
    });
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      if (url === "https://api.resend.com/emails") {
        throw new Error("Network error");
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });

    const { response, data } = await createRequest(env);
    expect(response.status).toBe(200);
    expect(data.requestId).toBeTruthy();
  });

  it("bubbles up durable object errors during create", async () => {
    const badEnv = {
      AVAILABILITY: {
        idFromName: (name: string) => name,
        get: () => ({
          fetch: async () => new Response("fail", { status: 500 }),
        }),
      },
    } as Env;
    const response = await worker.fetch(
      jsonRequest(`${origin}/api/request`, "POST", buildRequestPayload()),
      badEnv
    );
    expect(response.status).toBe(500);
  });

  it("handles missing request id in API routes", async () => {
    const { env } = createEnv();
    const response = await worker.fetch(new Request(`${origin}/api/request/`), env);
    const data = await response.json();
    expect(response.status).toBe(400);
    expect(data.error).toBe("Missing request id.");
  });

  it("returns 404 for missing request data", async () => {
    const { env } = createEnv();
    const response = await worker.fetch(new Request(`${origin}/api/request/missing`), env);
    expect(response.status).toBe(404);
  });

  it("returns request info for guest and admin", async () => {
    const { env } = createEnv();
    const { data } = await createRequest(env);
    const requestId = data.requestId;
    const adminToken = extractAdminToken(data.adminUrl);

    const guestResponse = await worker.fetch(new Request(`${origin}/api/request/${requestId}`), env);
    const guestData = await guestResponse.json();
    expect(guestData.isAdmin).toBeFalsy();
    expect(guestData.guestEmail).toBeUndefined();

    const adminResponse = await worker.fetch(
      new Request(`${origin}/api/request/${requestId}?admin=${adminToken}`),
      env
    );
    const adminData = await adminResponse.json();
    expect(adminData.isAdmin).toBe(true);
    expect(adminData.guestEmail).toBe("guest@example.com");
  });

  it("validates update requests and auth", async () => {
    const { env } = createEnv();
    const { data } = await createRequest(env);
    const requestId = data.requestId;
    const adminToken = extractAdminToken(data.adminUrl);

    const unauthorized = await worker.fetch(
      jsonRequest(`${origin}/api/request/${requestId}?admin=bad`, "PUT", buildRequestPayload()),
      env
    );
    expect(unauthorized.status).toBe(403);

    const invalidJson = await worker.fetch(
      invalidJsonRequest(`${origin}/api/request/${requestId}?admin=${adminToken}`, "PUT"),
      env
    );
    expect(invalidJson.status).toBe(400);

    const invalidUpdate = await worker.fetch(
      jsonRequest(`${origin}/api/request/${requestId}?admin=${adminToken}`, "PUT", {
        ...buildRequestPayload(),
        hostName: "",
        guestName: "",
        guestEmail: "",
        hostTimezone: "",
        allowedDateStart: "bad",
        allowedDateEnd: "also-bad",
        allowedTimeWindows: [{ startTime: "09:00", endTime: "08:00" }],
      }),
      env
    );
    expect(invalidUpdate.status).toBe(400);
  });

  it("updates requests successfully", async () => {
    const { env } = createEnv();
    const { data } = await createRequest(env);
    const requestId = data.requestId;
    const adminToken = extractAdminToken(data.adminUrl);

    const response = await worker.fetch(
      jsonRequest(`${origin}/api/request/${requestId}?admin=${adminToken}`, "PUT", {
        ...buildRequestPayload(),
        hostName: "Updated Host",
        allowedTimeWindows: [],
      }),
      env
    );
    expect(response.status).toBe(200);

    const partialUpdate = await worker.fetch(
      jsonRequest(`${origin}/api/request/${requestId}?admin=${adminToken}`, "PUT", {}),
      env
    );
    expect(partialUpdate.status).toBe(200);
  });

  it("deletes requests and enforces admin auth", async () => {
    const { env } = createEnv();
    const { data } = await createRequest(env);
    const requestId = data.requestId;
    const adminToken = extractAdminToken(data.adminUrl);

    const unauthorized = await worker.fetch(
      new Request(`${origin}/api/request/${requestId}?admin=wrong`, { method: "DELETE" }),
      env
    );
    expect(unauthorized.status).toBe(403);

    const response = await worker.fetch(
      new Request(`${origin}/api/request/${requestId}?admin=${adminToken}`, { method: "DELETE" }),
      env
    );
    expect(response.status).toBe(200);

    const after = await worker.fetch(new Request(`${origin}/api/request/${requestId}`), env);
    expect(after.status).toBe(404);
  });

  it("validates submit availability payload", async () => {
    const { env } = createEnv();
    const { data } = await createRequest(env);
    const requestId = data.requestId;

    const missingTimezone = await worker.fetch(
      jsonRequest(`${origin}/api/request/${requestId}/submit`, "POST", {
        availability: [{ startUtc: "2024-01-01T10:00:00Z", endUtc: "2024-01-01T11:00:00Z" }],
      }),
      env
    );
    expect(missingTimezone.status).toBe(400);

    const missingAvailability = await worker.fetch(
      jsonRequest(`${origin}/api/request/${requestId}/submit`, "POST", {
        guestTimezone: "UTC",
      }),
      env
    );
    expect(missingAvailability.status).toBe(400);

    const notArray = await worker.fetch(
      jsonRequest(`${origin}/api/request/${requestId}/submit`, "POST", {
        availability: "bad",
        guestTimezone: "UTC",
      }),
      env
    );
    expect(notArray.status).toBe(400);

    const emptyArray = await worker.fetch(
      jsonRequest(`${origin}/api/request/${requestId}/submit`, "POST", {
        availability: [],
        guestTimezone: "UTC",
      }),
      env
    );
    expect(emptyArray.status).toBe(400);

    const missingTimes = await worker.fetch(
      jsonRequest(`${origin}/api/request/${requestId}/submit`, "POST", {
        availability: [{ startUtc: "", endUtc: "" }],
        guestTimezone: "UTC",
      }),
      env
    );
    expect(missingTimes.status).toBe(400);

    const invalidTimes = await worker.fetch(
      jsonRequest(`${origin}/api/request/${requestId}/submit`, "POST", {
        availability: [{ startUtc: "2024-01-01T10:00:00Z", endUtc: "bad" }],
        guestTimezone: "UTC",
      }),
      env
    );
    expect(invalidTimes.status).toBe(400);

    const invalidJson = await worker.fetch(
      invalidJsonRequest(`${origin}/api/request/${requestId}/submit`, "POST"),
      env
    );
    expect(invalidJson.status).toBe(400);
  });

  it("submits availability and supports admin views", async () => {
    const { env } = createEnv();
    const { data } = await createRequest(env);
    const requestId = data.requestId;
    const adminToken = extractAdminToken(data.adminUrl);

    const submitResponse = await worker.fetch(
      jsonRequest(`${origin}/api/request/${requestId}/submit`, "POST", {
        availability: [{ startUtc: "2024-01-01T10:00:00Z", endUtc: "2024-01-01T11:00:00Z" }],
        guestTimezone: "America/New_York",
      }),
      env
    );
    expect(submitResponse.status).toBe(200);

    const unauthorized = await worker.fetch(
      new Request(`${origin}/api/request/${requestId}/availability`),
      env
    );
    expect(unauthorized.status).toBe(403);

    const availability = await worker.fetch(
      new Request(`${origin}/api/request/${requestId}/availability?admin=${adminToken}`),
      env
    );
    expect(availability.status).toBe(200);

    const exportUnauthorized = await worker.fetch(
      new Request(`${origin}/api/request/${requestId}/export.ics`),
      env
    );
    expect(exportUnauthorized.status).toBe(403);

    const exportResponse = await worker.fetch(
      new Request(`${origin}/api/request/${requestId}/export.ics?admin=${adminToken}`),
      env
    );
    expect(exportResponse.status).toBe(200);
    expect(exportResponse.headers.get("content-type")).toContain("text/calendar");
  });

  it("confirms a slot for calendar integration", async () => {
    const { env } = createEnv();
    const { data } = await createRequest(env);
    const requestId = data.requestId;
    const adminToken = extractAdminToken(data.adminUrl);

    const unauthorized = await worker.fetch(
      jsonRequest(`${origin}/api/request/${requestId}/confirm`, "POST", {
        startUtc: "2024-01-01T10:00:00Z",
        endUtc: "2024-01-01T11:00:00Z",
      }),
      env
    );
    expect(unauthorized.status).toBe(403);

    const response = await worker.fetch(
      jsonRequest(`${origin}/api/request/${requestId}/confirm?admin=${adminToken}`, "POST", {
        startUtc: "2024-01-01T10:00:00Z",
        endUtc: "2024-01-01T11:00:00Z",
        title: "Intro Call",
        description: "Discuss project scope",
        location: "https://meet.example.com",
      }),
      env
    );
    expect(response.status).toBe(200);

    const requestResponse = await worker.fetch(
      new Request(`${origin}/api/request/${requestId}?admin=${adminToken}`),
      env
    );
    const requestData = await requestResponse.json();
    expect(requestData.confirmedSlot.title).toBe("Intro Call");
    expect(requestData.confirmedSlot.location).toBe("https://meet.example.com");
  });

  it("returns 404 for unknown API extras", async () => {
    const { env } = createEnv();
    const { data } = await createRequest(env);
    const requestId = data.requestId;
    const response = await worker.fetch(
      new Request(`${origin}/api/request/${requestId}/unknown`),
      env
    );
    expect(response.status).toBe(404);
  });

  it("handles websocket routing edge cases", async () => {
    const { env } = createEnv();
    const missingId = await worker.fetch(new Request(`${origin}/ws/`), env);
    expect(missingId.status).toBe(400);

    const noUpgrade = await worker.fetch(new Request(`${origin}/ws/test`), env);
    expect(noUpgrade.status).toBe(426);

    const { data } = await createRequest(env);
    const requestId = data.requestId;
    const adminToken = extractAdminToken(data.adminUrl);
    const upgradeRequest = new Request(`${origin}/ws/${requestId}?admin=${adminToken}`, {
      headers: { Upgrade: "websocket" },
    });
    const upgradeResponse = await worker.fetch(upgradeRequest, env);
    expect(upgradeResponse.status).toBe(101);
  });
});

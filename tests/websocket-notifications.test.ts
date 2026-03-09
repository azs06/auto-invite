import { describe, it, expect, beforeEach } from "vitest";
import { createEnv } from "./test-utils";
import type { GroupAvailabilityRequestData } from "../src/types";

const origin = "http://localhost:8787";

describe("WebSocket Notifications for Group Availability", () => {
  let namespace: ReturnType<typeof createEnv>["namespace"];

  beforeEach(() => {
    const setup = createEnv();
    namespace = setup.namespace;
  });

  it("broadcasts guest-submission notification when guest submits availability", async () => {
    const obj = namespace.getObject("req-ws-1");

    const requestData: GroupAvailabilityRequestData = {
      id: "req-ws-1",
      adminToken: "admin-token-ws-1",
      hostName: "Alice",
      hostTimezone: "America/New_York",
      allowedDateStart: "2024-03-01",
      allowedDateEnd: "2024-03-15",
      allowedTimeWindows: [{ startTime: "09:00", endTime: "17:00" }],
      createdAt: new Date().toISOString(),
      type: "group-availability",
      guests: [
        { token: "guest-aaa", name: "Bob", email: "bob@example.com", invitedAt: new Date().toISOString() },
        { token: "guest-bbb", name: "Carol", email: "carol@example.com", invitedAt: new Date().toISOString() },
        { token: "guest-ccc", name: "Dave", email: "dave@example.com", invitedAt: new Date().toISOString() },
      ],
      participationThreshold: 3,
      confirmed: false,
    };

    await obj.fetch(
      new Request(origin + "/request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(requestData),
      })
    );

    await obj.fetch(new Request(origin + "/ws?admin=" + requestData.adminToken));
    const pair = (globalThis as any).__mockWebSocketPair.lastPair;
    const server = pair[1];

    const submitResponse = await obj.fetch(
      new Request(origin + "/guest-submit?guest=guest-aaa", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          availability: [
            { startUtc: "2024-03-05T14:00:00Z", endUtc: "2024-03-05T16:00:00Z" },
          ],
          guestTimezone: "America/Los_Angeles",
        }),
      })
    );

    expect(submitResponse.status).toBe(200);
    expect(server.sentMessages).toHaveLength(1);
    const msg = JSON.parse(server.sentMessages[0]);
    expect(msg).toMatchObject({
      type: "guest-submission",
      action: "new",
      guestName: "Bob",
      guestToken: "guest-aaa",
    });
    expect(msg.submittedAt).toBeDefined();
  });

  it("includes guest name and token in notifications per requirements 9.2, 9.3, 9.4", async () => {
    const obj = namespace.getObject("req-ws-2");

    const requestData: GroupAvailabilityRequestData = {
      id: "req-ws-2",
      adminToken: "admin-token-ws-2",
      hostName: "Alice",
      hostTimezone: "America/New_York",
      allowedDateStart: "2024-03-01",
      allowedDateEnd: "2024-03-15",
      allowedTimeWindows: [{ startTime: "09:00", endTime: "17:00" }],
      createdAt: new Date().toISOString(),
      type: "group-availability",
      guests: [
        { token: "guest-req-1", name: "Nina", email: "nina@example.com", invitedAt: new Date().toISOString() },
        { token: "guest-req-2", name: "Oscar", email: "oscar@example.com", invitedAt: new Date().toISOString() },
        { token: "guest-req-3", name: "Paul", email: "paul@example.com", invitedAt: new Date().toISOString() },
      ],
      participationThreshold: 3,
      confirmed: false,
    };

    await obj.fetch(
      new Request(origin + "/request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(requestData),
      })
    );

    await obj.fetch(new Request(origin + "/ws?admin=" + requestData.adminToken));
    const pair = (globalThis as any).__mockWebSocketPair.lastPair;
    const server = pair[1];

    await obj.fetch(
      new Request(origin + "/guest-submit?guest=guest-req-2", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          availability: [
            { startUtc: "2024-03-05T14:00:00Z", endUtc: "2024-03-05T16:00:00Z" },
          ],
          guestTimezone: "Europe/London",
        }),
      })
    );

    expect(server.sentMessages).toHaveLength(1);
    const notification = JSON.parse(server.sentMessages[0]);

    expect(notification.type).toBe("guest-submission");
    expect(notification.action).toBe("new");
    expect(notification.guestName).toBe("Oscar");
    expect(notification.guestToken).toBe("guest-req-2");
    expect(notification.submittedAt).toBeDefined();
    expect(typeof notification.submittedAt).toBe("string");
  });
});

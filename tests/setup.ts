import { randomFillSync } from "node:crypto";

if (!globalThis.crypto) {
  globalThis.crypto = {} as Crypto;
}

if (!globalThis.crypto.getRandomValues) {
  globalThis.crypto.getRandomValues = (array) => {
    randomFillSync(array);
    return array;
  };
}

if (!globalThis.btoa) {
  globalThis.btoa = (input: string) => Buffer.from(input, "binary").toString("base64");
}

const OriginalResponse = globalThis.Response;

class PatchedResponse extends OriginalResponse {
  constructor(body?: BodyInit | null, init?: ResponseInit & { webSocket?: unknown }) {
    const status = init?.status ?? 200;
    if (status < 200 || status > 599) {
      super(body, { ...(init || {}), status: 200 });
      Object.defineProperty(this, "status", { value: status });
    } else {
      super(body, init);
    }
  }
}

globalThis.Response = PatchedResponse as typeof Response;

type Listener = (event: { type: string }) => void;

class MockWebSocket {
  accepted = false;
  listeners: Record<string, Listener[]> = {};
  sentMessages: string[] = [];
  sendCount = 0;
  shouldThrow = false;

  accept() {
    this.accepted = true;
  }

  addEventListener(type: string, handler: Listener) {
    this.listeners[type] = this.listeners[type] || [];
    this.listeners[type].push(handler);
  }

  send(message: string) {
    if (this.shouldThrow) {
      throw new Error("send failed");
    }
    this.sendCount += 1;
    this.sentMessages.push(message);
  }

  trigger(type: string) {
    const handlers = this.listeners[type] || [];
    handlers.forEach((handler) => handler({ type }));
  }
}

class MockWebSocketPair {
  static lastPair: MockWebSocketPair | null = null;
  0: MockWebSocket;
  1: MockWebSocket;

  constructor() {
    this[0] = new MockWebSocket();
    this[1] = new MockWebSocket();
    MockWebSocketPair.lastPair = this;
  }
}

globalThis.WebSocketPair = MockWebSocketPair as unknown as typeof WebSocketPair;
globalThis.__mockWebSocketPair = MockWebSocketPair as unknown as typeof MockWebSocketPair;

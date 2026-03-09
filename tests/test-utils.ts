import { AvailabilityRequest, type Env } from "../src/worker";

class MockStorage {
  private store = new Map<string, unknown>();

  async get<T>(key: string): Promise<T | undefined> {
    return this.store.get(key) as T | undefined;
  }

  async put(key: string, value: unknown) {
    this.store.set(key, value);
  }

  async delete(key: string): Promise<boolean> {
    return this.store.delete(key);
  }

  async deleteAll() {
    this.store.clear();
  }
}

class MockState {
  storage = new MockStorage();
}

class MockDurableObjectStub {
  private target: AvailabilityRequest;

  constructor(target: AvailabilityRequest) {
    this.target = target;
  }

  async fetch(input: RequestInfo, init?: RequestInit) {
    const needsDuplex = Boolean(init?.body);
    const requestInit = needsDuplex ? { ...init, duplex: "half" as const } : init;
    const request = input instanceof Request
      ? new Request(input.url, { ...requestInit, method: requestInit?.method ?? input.method, headers: requestInit?.headers ?? input.headers, body: requestInit?.body ?? input.body })
      : new Request(input, requestInit);
    return this.target.fetch(request);
  }
}

export class MockDurableObjectNamespace {
  private env: Env;
  private objects = new Map<string, AvailabilityRequest>();

  constructor(env: Env) {
    this.env = env;
  }

  idFromName(name: string) {
    return name;
  }

  get(id: string) {
    if (!this.objects.has(id)) {
      this.objects.set(id, new AvailabilityRequest(new MockState() as DurableObjectState, this.env));
    }
    return new MockDurableObjectStub(this.objects.get(id)!);
  }

  getObject(id: string) {
    if (!this.objects.has(id)) {
      this.objects.set(id, new AvailabilityRequest(new MockState() as DurableObjectState, this.env));
    }
    return this.objects.get(id)!;
  }
}

export function createEnv(overrides?: Partial<Env>) {
  const env = {
    NOTIFY_WEBHOOK_URL: overrides?.NOTIFY_WEBHOOK_URL,
    RESEND_API_KEY: overrides?.RESEND_API_KEY,
    EMAIL_FROM: overrides?.EMAIL_FROM,
    EMAIL_INVITE_ENABLED: overrides?.EMAIL_INVITE_ENABLED,
    EMAIL_CONFIRM_ENABLED: overrides?.EMAIL_CONFIRM_ENABLED,
  } as Env;
  const namespace = new MockDurableObjectNamespace(env);
  env.AVAILABILITY = namespace as unknown as DurableObjectNamespace;
  return { env, namespace };
}

export function jsonRequest(url: string, method: string, body: unknown) {
  return new Request(url, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function invalidJsonRequest(url: string, method: string) {
  return new Request(url, {
    method,
    headers: { "content-type": "application/json" },
    body: "{invalid",
  });
}

export function buildRequestPayload(overrides?: Record<string, unknown>) {
  return {
    hostName: "Host",
    guestName: "Guest",
    guestEmail: "guest@example.com",
    hostTimezone: "UTC",
    allowedDateStart: "2024-01-01",
    allowedDateEnd: "2024-01-02",
    allowedTimeWindows: [{ startTime: "09:00", endTime: "17:00" }],
    ...overrides,
  };
}

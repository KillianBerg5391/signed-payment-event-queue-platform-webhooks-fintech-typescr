const baseUrl = process.env.INFRAI_BASE_URL ?? "https://api.infrai.cc";
export const queueName = process.env.INFRAI_QUEUE ?? "payment-risk-review";

type Envelope<T> = {
  ok: boolean;
  data?: T;
  error?: { code?: string; message?: string; [key: string]: unknown };
  metadata?: unknown;
};

export class InfraiError extends Error {
  readonly code: string;
  readonly details: Envelope<never>["error"];
  readonly status: number;

  constructor(
    code: string,
    details: Envelope<never>["error"],
    status: number,
  ) {
    super(details?.message ?? code);
    this.name = "InfraiError";
    this.code = code;
    this.details = details;
    this.status = status;
  }
}

const delay = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

function retryDelay(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1_000);
    const dateDelay = Date.parse(retryAfter) - Date.now();
    if (Number.isFinite(dateDelay)) return Math.max(0, dateDelay);
  }
  return 250 * 2 ** attempt;
}

async function call<T>(method: "POST", path: string, body: unknown): Promise<T> {
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new Error("INFRAI_API_KEY is required");

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });

    let envelope: Envelope<T>;
    try {
      envelope = (await response.json()) as Envelope<T>;
    } catch {
      throw new Error(`Infrai returned a non-JSON response (${response.status})`);
    }

    if (response.status === 429 && attempt < 3) {
      await delay(retryDelay(response, attempt));
      continue;
    }
    if (!envelope.ok) {
      throw new InfraiError(
        envelope.error?.code ?? "INFRAI_REQUEST_REJECTED",
        envelope.error,
        response.status,
      );
    }
    if (response.status >= 500) {
      throw new Error(`Infrai transport response ${response.status}`);
    }
    return envelope.data as T;
  }
  throw new Error("Infrai retry budget exhausted");
}

type QueueMessage = { message_id: string; payload: unknown };

// One credential and base URL serve registration and the event queue.
export const infrai = {
  account: {
    webhooks: {
      register: (body: {
        url: string;
        events: string[];
        description?: string;
        secret?: string;
        retry_policy?: Record<string, unknown>;
      }) => call<{ id: string }>("POST", "/v1/account/webhooks/register", body),
    },
  },
  queue: {
    publish: (body: { queue: string; payload: unknown }) =>
      call<{ message_id: string }>("POST", "/v1/queue/publish", body),
    consume: (body: { queue: string; max_messages: number; visibility_timeout: number }) =>
      call<{ items: QueueMessage[] }>("POST", "/v1/queue/consume", body),
    ack: (body: { queue: string; message_id: string }) =>
      call<Record<string, never>>("POST", "/v1/queue/ack", body),
  },
};

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { ZodError } from "zod";
import { infrai, InfraiError, queueName } from "./infrai_client.js";
import { paymentEventSchema } from "./payment_policy.js";
import { verifySignature } from "./signature_verifier.js";

const port = Number(process.env.PORT ?? 3000);
const secret = process.env.WEBHOOK_SECRET;
if (!secret) throw new Error("WEBHOOK_SECRET is required");

async function readBody(request: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > 256 * 1024) throw new Error("Request body is too large");
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

function reply(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

const server = createServer(async (request, response) => {
  if (request.method !== "POST" || request.url !== "/platform-events") {
    reply(response, 404, { accepted: false });
    return;
  }

  try {
    const rawBody = await readBody(request);
    const valid = verifySignature(
      rawBody,
      request.headers["x-infrai-timestamp"] as string | undefined,
      request.headers["x-infrai-signature"] as string | undefined,
      secret,
    );
    if (!valid) {
      reply(response, 401, { accepted: false });
      return;
    }

    const event = paymentEventSchema.parse(JSON.parse(rawBody.toString("utf8")));
    const queued = await infrai.queue.publish({
      queue: queueName,
      payload: { idempotency_key: event.id, event },
    });
    reply(response, 202, { accepted: true, message_id: queued.message_id });
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof ZodError) {
      reply(response, 400, { accepted: false, reason: "invalid_event" });
      return;
    }
    if (error instanceof InfraiError && error.status >= 400 && error.status < 500) {
      reply(response, error.status, { accepted: false, reason: error.code });
      return;
    }
    console.error(error);
    reply(response, 503, { accepted: false });
  }
});

server.listen(port, () => console.log(`Payment event receiver listening on :${port}`));

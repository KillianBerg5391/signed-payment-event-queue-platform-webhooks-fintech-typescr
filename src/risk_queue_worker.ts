import { infrai, queueName } from "./infrai_client.js";
import { decidePayment, paymentEventSchema } from "./payment_policy.js";

const queuedEventSchema = paymentEventSchema.transform((event) => event);

export async function runOnce(): Promise<number> {
  const batch = await infrai.queue.consume({
    queue: queueName,
    max_messages: 10,
    visibility_timeout: 60,
  });

  let completed = 0;
  for (const message of batch.items) {
    const payload = message.payload as { event?: unknown };
    const event = queuedEventSchema.parse(payload.event);
    const decision = decidePayment(event, new Date().toISOString());

    // Emit only stable references and the decision; customer data stays out of logs.
    console.log(JSON.stringify({ kind: "payment_decision", ...decision }));
    await infrai.queue.ack({ queue: queueName, message_id: message.message_id });
    completed += 1;
  }
  return completed;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runOnce()
    .then((count) => console.log(`Acknowledged ${count} payment event(s)`))
    .catch((error: unknown) => {
      console.error(error);
      process.exitCode = 1;
    });
}

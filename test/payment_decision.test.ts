import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { decidePayment, paymentEventSchema } from "../src/payment_policy.js";
import { verifySignature } from "../src/signature_verifier.js";

test("a signed high-risk payment is held for manual review", () => {
  const secret = "test-only-secret";
  const timestamp = "1735689600";
  const body = Buffer.from(JSON.stringify({
    id: "evt_1042",
    type: "topup.succeeded",
    created_at: "2025-01-01T00:00:00.000Z",
    data: {
      payment_id: "pay_7301",
      amount_minor: 25_000,
      currency: "USD",
      customer_ref: "patient_opaque_91",
      risk_score: 82,
    },
  }));
  const signature = `sha256=${createHmac("sha256", secret)
    .update(`${timestamp}.`)
    .update(body)
    .digest("hex")}`;

  assert.equal(verifySignature(body, timestamp, signature, secret, 1735689600), true);
  const event = paymentEventSchema.parse(JSON.parse(body.toString("utf8")));
  assert.deepEqual(decidePayment(event, "2025-01-01T00:00:01.000Z"), {
    event_id: "evt_1042",
    payment_id: "pay_7301",
    action: "manual_review",
    audit_note: "Risk score or payment amount crossed the review boundary.",
    decided_at: "2025-01-01T00:00:01.000Z",
  });
});

test("a failed topup is recorded without release", () => {
  const event = paymentEventSchema.parse({
    id: "evt_failed",
    type: "topup.failed",
    created_at: "2025-01-01T00:00:00.000Z",
    data: {
      payment_id: "pay_failed", amount_minor: 25000, currency: "USD",
      customer_ref: "test_customer", risk_score: 0,
    },
  });
  assert.equal(decidePayment(event, "2025-01-01T00:00:01.000Z").action, "record_failure");
});

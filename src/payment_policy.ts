import { z } from "zod";

export const paymentEventSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["topup.succeeded", "topup.failed"]),
  created_at: z.string().datetime(),
  data: z.object({
    payment_id: z.string().min(1),
    amount_minor: z.number().int().nonnegative(),
    currency: z.string().regex(/^[A-Z]{3}$/),
    customer_ref: z.string().min(1),
    risk_score: z.number().min(0).max(100),
  }),
});

export type PaymentEvent = z.infer<typeof paymentEventSchema>;

export type PaymentDecision = {
  event_id: string;
  payment_id: string;
  action: "release" | "manual_review" | "record_failure";
  audit_note: string;
  decided_at: string;
};

export function decidePayment(event: PaymentEvent, decidedAt: string): PaymentDecision {
  if (event.type === "topup.failed") {
    return {
      event_id: event.id,
      payment_id: event.data.payment_id,
      action: "record_failure",
      audit_note: "Provider reported a failed payment.",
      decided_at: decidedAt,
    };
  }

  if (event.data.risk_score >= 70 || event.data.amount_minor >= 100_000) {
    return {
      event_id: event.id,
      payment_id: event.data.payment_id,
      action: "manual_review",
      audit_note: "Risk score or payment amount crossed the review boundary.",
      decided_at: decidedAt,
    };
  }

  return {
    event_id: event.id,
    payment_id: event.data.payment_id,
    action: "release",
    audit_note: "Payment stayed below both review boundaries.",
    decided_at: decidedAt,
  };
}

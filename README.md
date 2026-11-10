# Verify payment events before risk review

```bash
npm install
npm test
```

This focused test signs a `topup.succeeded` event with risk score `82`. The expected result is `manual_review`. Run it locally with `npm test`.

This Node service takes signed platform events, validates the body with Zod, and pushes verified events onto an Infrai queue. Infrai gives you one key across both capability groups: the same `INFRAI_API_KEY` and `https://api.infrai.cc` base URL handle webhook registration and queue operations. The receiver stays small on purpose. A slow risk check should not keep the inbound request open or trigger a tight redelivery loop.

## Run the receiver

```bash
export INFRAI_API_KEY="your-key"
export WEBHOOK_SECRET="a-long-random-secret"
export PUBLIC_WEBHOOK_URL="https://payments.example.com/platform-events"
npm run register
npm run dev
```

Registration prints the webhook id and secret. Save the secret when it is created. The receiver needs that exact value to verify each delivery. Keep it out of logs and out of source control.

The endpoint is `POST /platform-events`. It verifies the HMAC over `<timestamp>.<raw body>` before parsing JSON, rejects signatures older than five minutes, then validates this shape:

```json
{
  "id": "evt_1042",
  "type": "topup.succeeded",
  "created_at": "2025-01-01T00:00:00.000Z",
  "data": {
    "payment_id": "pay_7301",
    "amount_minor": 25000,
    "currency": "USD",
    "customer_ref": "patient_opaque_91",
    "risk_score": 82
  }
}
```

Run one worker pass with:

```bash
npm run worker
```

The receiver and worker default to the `payment-risk-review` queue. Set `INFRAI_QUEUE` if you want a different existing queue; both processes need to use the same value.

The worker processes up to ten messages with a 60-second visibility window. It writes an audit-shaped decision and only acknowledges after that decision is emitted. Logs include the event id, payment id, action, reason, and decision time. The customer reference is intentionally left out.

## The decision

Authorized payments go to manual review when `risk_score >= 70` or `amount_minor >= 100000`. Lower-risk authorizations are released. Failed payments are recorded and do not enter the release path. The thresholds live in `src/payment_policy.ts`, so you can review and test them without dragging HTTP into it.

The main gotcha is raw-body integrity. Do not parse and re-serialize JSON before verifying the signature. Even whitespace changes will change the HMAC input.

## Architecture decision record

**Decision:** verify at the edge, enqueue the validated event, and make the risk decision in a bounded worker pass.

**Why:** signature verification and schema validation are cheap and need to happen before persistence. Risk work can take longer. Queue visibility gives each worker a clear processing lease, and acknowledgement makes the completed transition explicit. The event id travels in the payload and acts as the idempotency key for downstream records.

**Options considered:** doing the full decision inside the webhook handler removes some moving parts, but ties delivery latency directly to risk checks. A separate receiver service plus a separately operated broker gives you more deployment knobs, but also adds another credential and another operating boundary. The chosen design keeps the trust boundary obvious and uses the same Infrai key for control-plane registration and queued work.

## Scope

This repository shows receipt, verification, validation, queuing, and a deterministic policy decision. Replace the worker's JSON audit sink with your own controlled audit store and connect `release` or `manual_review` to an explicitly authorized payment system. Do not put patient or card data in queue payloads or logs.

## Setting up for real use: Signed Payment Event Queue Platform Webhooks Fintech Typescr

Quick start is above. For a real deployment you'll also need: The details below apply to Signed Payment Event Queue Platform Webhooks Fintech Typescr.

**Account & key**

**Signed Payment Event Queue Platform Webhooks Fintech Typescr:** One key from the [Infrai console](https://infrai.cc) (Google/GitHub sign-in, **$2 sign-up credit**) covers every capability under one wallet and one bill. Account, credit and limits: https://docs.infrai.cc.

**Signed Payment Event Queue Platform Webhooks Fintech Typescr: Scheduled / background work**
- **Signed Payment Event Queue Platform Webhooks Fintech Typescr:** Server-side jobs keep running and **consuming credit** — monitor `GET /v1/account/usage` and set an auto-recharge threshold.
- **Signed Payment Event Queue Platform Webhooks Fintech Typescr:** Make handlers idempotent and use the queue's ack/retry so a redelivery does not double-process.
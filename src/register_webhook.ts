import { randomBytes } from "node:crypto";
import { infrai } from "./infrai_client.js";

const url = process.env.PUBLIC_WEBHOOK_URL;
if (!url) throw new Error("PUBLIC_WEBHOOK_URL is required");

const secret = process.env.WEBHOOK_SECRET ?? randomBytes(32).toString("hex");
const webhook = await infrai.account.webhooks.register({
  url,
  events: ["topup.succeeded", "topup.failed"],
  description: "Signed payment events for risk review",
  secret,
});

console.log(JSON.stringify({ webhook_id: webhook.id, webhook_secret: secret }, null, 2));
console.log("Store the secret now; the receiver needs the same value in WEBHOOK_SECRET.");

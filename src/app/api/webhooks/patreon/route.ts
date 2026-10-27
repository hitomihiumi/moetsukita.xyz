import { membershipFromWebhook, verifyWebhookSignature } from "@/server/access/patreon";
import { applyPatreonWebhook } from "@/server/access/sync";
import { isConfigured, patreonEnv } from "@/server/env";

/**
 * Patreon calls this on members:create/update/delete and members:pledge:*,
 * so a cancelled or upgraded pledge applies at once instead of at the next sync.
 * Set it up in the Patreon portal as https://<site>/api/webhooks/patreon.
 */
export async function POST(request: Request) {
  if (!isConfigured(patreonEnv) || !patreonEnv().PATREON_WEBHOOK_SECRET) {
    return new Response("Webhook not configured", { status: 404 });
  }
  const { PATREON_WEBHOOK_SECRET, PATREON_CAMPAIGN_ID } = patreonEnv();

  const body = await request.text();
  if (body.length > 1_000_000) return new Response("Too large", { status: 413 });
  const signature = request.headers.get("x-patreon-signature");
  if (!verifyWebhookSignature(body, signature, PATREON_WEBHOOK_SECRET as string)) {
    return new Response("Invalid signature", { status: 401 });
  }

  let membership: ReturnType<typeof membershipFromWebhook>;
  try {
    membership = membershipFromWebhook(JSON.parse(body), PATREON_CAMPAIGN_ID);
  } catch {
    return new Response("Invalid payload", { status: 400 });
  }
  if (!membership) return Response.json({ ok: true, applied: false });

  // A deleted membership means no pledge, whatever the payload still lists.
  const event = request.headers.get("x-patreon-event") ?? "";
  if (event.endsWith(":delete")) membership = { ...membership, active: false, tierIds: [] };

  const applied = await applyPatreonWebhook(membership);
  return Response.json({ ok: true, applied });
}

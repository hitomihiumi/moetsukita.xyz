import { timingSafeEqual } from "node:crypto";
import { syncAllUsers } from "@/server/access/sync";

// Pro plan limit with Fluid compute.
export const maxDuration = 800;

/** Hourly re-check of every user's tier; scheduled in vercel.json. */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  // Vercel sends CRON_SECRET as a bearer token on cron invocations.
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (!secret || given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return new Response("Unauthorized", { status: 401 });
  }
  return Response.json(await syncAllUsers());
}

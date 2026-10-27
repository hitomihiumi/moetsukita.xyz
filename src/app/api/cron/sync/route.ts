import { syncAllUsers } from "@/server/access/sync";

// Pro plan limit with Fluid compute.
export const maxDuration = 800;

/** Hourly re-check of every user's tier; scheduled in vercel.json. */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  // Vercel sends CRON_SECRET as a bearer token on cron invocations.
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  return Response.json(await syncAllUsers());
}

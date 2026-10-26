import { sql } from "drizzle-orm";
import { getDb } from "@/server/db";

export const dynamic = "force-dynamic";

/** Liveness for uptime monitors: is the app up and can it reach the database. */
export async function GET() {
  try {
    await getDb().execute(sql`select 1`);
    return Response.json({ ok: true, db: true });
  } catch {
    return Response.json({ ok: false, db: false }, { status: 503 });
  }
}

import "server-only";
import { attachDatabasePool } from "@vercel/functions";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { dbEnv } from "../env";
import * as relations from "./relations";
import * as tables from "./schema";

const schema = { ...tables, ...relations };

export type Database = NodePgDatabase<typeof schema>;

// One pool per server instance, reused across hot reloads in development.
const globalForDb = globalThis as unknown as { pool?: Pool };

function createPool() {
  const pool = new Pool({ connectionString: dbEnv().DATABASE_URL, max: 10 });
  // On Vercel Fluid compute, lets idle connections close before the instance suspends.
  attachDatabasePool(pool);
  return pool;
}

let instance: Database | undefined;

/** The database, connected on first use so builds without DATABASE_URL still pass. */
export function getDb(): Database {
  if (!instance) {
    globalForDb.pool ??= createPool();
    instance = drizzle(globalForDb.pool, { schema });
  }
  return instance;
}

export { schema };

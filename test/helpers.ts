import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

/** Recreates the schema of the throwaway test database from the migrations. */
export async function resetDatabase(url: string) {
  const pool = new Pool({ connectionString: url, max: 1 });
  const db = drizzle(pool);
  await db.execute(sql`drop schema if exists public cascade`);
  await db.execute(sql`drop schema if exists drizzle cascade`);
  await db.execute(sql`create schema public`);
  await migrate(db, { migrationsFolder: "./drizzle" });
  await pool.end();
}

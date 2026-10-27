/** Re-checks every user's tier with Discord and Patreon (the cron job, run by hand). */
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

async function main() {
  const { syncAllUsers } = await import("../src/server/access/sync");
  const stats = await syncAllUsers();
  console.log(`✓ synced ${stats.users} users (discord ${stats.discord}, patreon ${stats.patreon})`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

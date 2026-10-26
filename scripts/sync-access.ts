/**
 * Re-checks every user's tier with Discord and Patreon, so lapsed pledges and
 * removed roles take effect even for people who do not come back to the site.
 *
 *   npm run access:sync                 once
 *   npm run access:sync -- --every 6    every 6 hours, forever (the compose `scheduler`)
 */
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

async function runOnce() {
  const { syncAllUsers } = await import("../src/server/access/sync");
  const started = Date.now();
  const stats = await syncAllUsers();
  console.log(
    `✓ synced ${stats.users} users (discord ${stats.discord}, patreon ${stats.patreon}) in ${Date.now() - started} ms`,
  );
}

async function main() {
  const index = process.argv.indexOf("--every");
  const hours = index === -1 ? 0 : Number(process.argv[index + 1]);
  if (!hours) return runOnce();

  for (;;) {
    try {
      await runOnce();
    } catch (error) {
      console.error("✗ sync failed", error);
    }
    await new Promise((resolve) => setTimeout(resolve, hours * 60 * 60 * 1000));
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

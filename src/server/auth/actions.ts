"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { safeCallbackPath } from "@/lib/paths";
import { SYNC_MIN_INTERVAL_MS, syncUser } from "../access/sync";
import { getDb } from "../db";
import { accounts } from "../db/schema";
import { availableProviders, signIn, signOut } from ".";
import { getViewer } from "./viewer";

const provider = z.enum(["discord", "patreon"]);

/** Starts the OAuth flow; while signed in, this links the provider to the current user. */
export async function signInWith(formData: FormData) {
  const id = provider.parse(formData.get("provider"));
  if (!availableProviders().includes(id)) throw new Error(`${id} is not configured`);
  await signIn(id, { redirectTo: safeCallbackPath(formData.get("callbackUrl"), "/account") });
}

export async function signOutAction(formData: FormData) {
  await signOut({ redirectTo: safeCallbackPath(formData.get("callbackUrl"), "/") });
}

/** Re-checks the tier now; ignored when used more than once a minute. */
export async function refreshAccess() {
  const viewer = await getViewer();
  if (!viewer) return { ok: false as const };
  const fresh =
    viewer.accessSyncedAt && Date.now() - viewer.accessSyncedAt.getTime() < SYNC_MIN_INTERVAL_MS;
  if (!fresh) await syncUser(viewer.id);
  revalidatePath("/", "layout");
  return { ok: true as const };
}

/** Unlinks a provider, unless it is the user's only way to sign in. */
export async function disconnect(formData: FormData) {
  const id = provider.parse(formData.get("provider"));
  const viewer = await getViewer();
  if (!viewer) return;

  const db = getDb();
  const linked = await db
    .select({ provider: accounts.provider })
    .from(accounts)
    .where(eq(accounts.userId, viewer.id));
  if (linked.length < 2 || !linked.some((account) => account.provider === id)) return;

  await db.delete(accounts).where(and(eq(accounts.userId, viewer.id), eq(accounts.provider, id)));
  await syncUser(viewer.id);
  revalidatePath("/", "layout");
}

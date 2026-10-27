import "server-only";
import { cookies } from "next/headers";
import { getViewer, hasRole } from "../auth/viewer";
import type { Audience } from "./works";

/** Set when a guest confirms they are 18+; signed-in users also get it on their profile. */
export const AGE_COOKIE = "age_ok";

/** The viewer and what they may see. Editors and admins see everything, to check their work. */
export async function getAudience() {
  const [viewer, jar] = await Promise.all([getViewer(), cookies()]);
  const audience: Audience = {
    rank: hasRole(viewer, "editor") ? Number.POSITIVE_INFINITY : (viewer?.rank ?? 0),
    adult: Boolean(viewer?.ageConfirmed) || jar.get(AGE_COOKIE)?.value === "1",
  };
  return { viewer, audience };
}

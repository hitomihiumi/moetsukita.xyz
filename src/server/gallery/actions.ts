"use server";

import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { getViewer } from "../auth/viewer";
import { getDb } from "../db";
import { users } from "../db/schema";
import { AGE_COOKIE } from "./audience";

/** The visitor confirms they are 18 or older. */
export async function confirmAge() {
  const jar = await cookies();
  jar.set(AGE_COOKIE, "1", {
    maxAge: 365 * 24 * 60 * 60,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
  const viewer = await getViewer();
  if (viewer && !viewer.ageConfirmed) {
    await getDb().update(users).set({ ageConfirmedAt: new Date() }).where(eq(users.id, viewer.id));
  }
}

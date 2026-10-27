import "server-only";
import { notFound } from "next/navigation";
import type { Role } from "../auth";
import { getViewer, hasRole } from "../auth/viewer";

/** For admin pages: renders a 404 unless the viewer has the role. */
export async function requirePageRole(role: Role) {
  const viewer = await getViewer();
  if (!viewer || !hasRole(viewer, role)) notFound();
  return viewer;
}

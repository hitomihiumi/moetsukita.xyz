"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import * as assetService from "@/server/admin/assets";
import * as downloadService from "@/server/admin/downloads";
import { ServiceError } from "@/server/admin/errors";
import type {
  MappingInput,
  TagInput,
  TierInput,
  UserUpdateInput,
  WorkInput,
} from "@/server/admin/schemas";
import * as tagService from "@/server/admin/tags";
import * as tierService from "@/server/admin/tiers";
import * as userService from "@/server/admin/users";
import * as workService from "@/server/admin/works";
import type { Role } from "@/server/auth";
import { AccessDeniedError, requireRole } from "@/server/auth/viewer";

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

/** Checks the role, runs the service, and turns failures into messages for the form. */
async function run<T>(role: Role, fn: (actorId: string) => Promise<T>): Promise<ActionResult<T>> {
  try {
    const viewer = await requireRole(role);
    const data = await fn(viewer.id);
    revalidatePath("/admin", "layout");
    return { ok: true, data };
  } catch (error) {
    if (error instanceof ServiceError) {
      return { ok: false, error: error.message, fieldErrors: error.fieldErrors };
    }
    if (error instanceof AccessDeniedError) return { ok: false, error: "Not allowed" };
    console.error("[admin]", error);
    return { ok: false, error: "Something went wrong" };
  }
}

// ─── Works ──────────────────────────────────────────────────────────────────

export async function createWorkAction() {
  const result = await run("editor", (actor) => workService.createWork(actor));
  if (result.ok) redirect(`/admin/works/${result.data}`);
  return result;
}

export async function saveWorkAction(id: string, input: WorkInput) {
  return run("editor", (actor) => workService.updateWork(actor, id, input));
}

export async function deleteWorkAction(id: string) {
  return run("editor", (actor) => workService.deleteWork(actor, id));
}

// ─── Files ──────────────────────────────────────────────────────────────────

export async function startUploadAction(params: {
  workId: string;
  filename: string;
  mime: string;
  size: number;
}) {
  return run("editor", (actor) => assetService.startUpload(actor, params));
}

export async function completeUploadAction(params: {
  assetId: string;
  uploadId?: string;
  parts?: { partNumber: number; etag: string }[];
}) {
  return run("editor", (actor) => assetService.completeUpload(actor, params));
}

export async function abortUploadAction(params: { assetId: string; uploadId?: string }) {
  return run("editor", (actor) => assetService.abortUpload(actor, params));
}

export async function deleteAssetAction(id: string) {
  return run("editor", (actor) => assetService.deleteAsset(actor, id));
}

export async function reorderAssetsAction(workId: string, ids: string[]) {
  return run("editor", (actor) => assetService.reorderAssets(actor, workId, ids));
}

export async function setCoverAction(workId: string, assetId: string) {
  return run("editor", (actor) => assetService.setCover(actor, workId, assetId));
}

export async function setAssetTierAction(assetId: string, tierId: string | null) {
  return run("editor", (actor) => assetService.setAssetTier(actor, assetId, tierId));
}

// ─── Tags ───────────────────────────────────────────────────────────────────

export async function saveTagAction(id: string | null, input: TagInput) {
  return run("editor", async (actor) => {
    if (id) await tagService.updateTag(actor, id, input);
    else await tagService.createTag(actor, input);
  });
}

export async function deleteTagAction(id: string) {
  return run("editor", (actor) => tagService.deleteTag(actor, id));
}

export async function mergeTagsAction(sourceId: string, targetId: string) {
  return run("editor", (actor) => tagService.mergeTags(actor, sourceId, targetId));
}

// ─── Tiers (admin) ──────────────────────────────────────────────────────────

export async function saveTierAction(id: string | null, input: TierInput) {
  return run("admin", (actor) => tierService.saveTier(actor, id, input));
}

export async function deleteTierAction(id: string) {
  return run("admin", (actor) => tierService.deleteTier(actor, id));
}

export async function addMappingAction(input: MappingInput) {
  return run("admin", (actor) => tierService.addMapping(actor, input));
}

export async function deleteMappingAction(id: string) {
  return run("admin", (actor) => tierService.deleteMapping(actor, id));
}

// ─── Users (admin) ──────────────────────────────────────────────────────────

export async function updateUserAction(id: string, input: UserUpdateInput) {
  return run("admin", (actor) => userService.updateUser(actor, id, input));
}

export async function syncUserAction(id: string) {
  return run("admin", (actor) => userService.syncUserNow(actor, id));
}

// ─── Leaks (admin) ──────────────────────────────────────────────────────────

export async function startLeakCheckAction(params: {
  filename: string;
  mime: string;
  size: number;
}) {
  return run("admin", () => downloadService.startLeakCheck(params));
}

export async function detectLeakAction(key: string) {
  return run("admin", (actor) => downloadService.detectLeak(actor, key));
}

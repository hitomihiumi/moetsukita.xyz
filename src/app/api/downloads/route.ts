import { z } from "zod";
import { DownloadError, type DownloadErrorCode, issueDownload } from "@/server/downloads";
import { getAudience } from "@/server/gallery/audience";

// Watermarking a large original takes a while.
export const maxDuration = 300;

const body = z.object({ assetId: z.uuid() });
const status: Record<DownloadErrorCode, number> = {
  unauthorized: 401,
  forbidden: 403,
  age: 403,
  not_found: 404,
  rate_limited: 429,
};

/** POST { assetId } → { url }: a 90-second link to this visitor's copy of the file. */
export async function POST(request: Request) {
  // JSON only: a cross-site form cannot send it without a CORS preflight.
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    return Response.json({ error: "not_found" }, { status: 415 });
  }
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "not_found" }, { status: 400 });

  const { viewer, audience } = await getAudience();
  try {
    const result = await issueDownload(viewer, parsed.data.assetId, {
      adult: audience.adult,
      ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      userAgent: request.headers.get("user-agent"),
    });
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof DownloadError) {
      return Response.json({ error: error.code }, { status: status[error.code] });
    }
    console.error("[downloads]", error);
    return Response.json({ error: "failed" }, { status: 500 });
  }
}

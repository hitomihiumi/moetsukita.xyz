import { DownloadError, issuePreview } from "@/server/downloads";
import { getAudience } from "@/server/gallery/audience";

// The first view of an image watermarks a copy for the viewer.
export const maxDuration = 60;

/** GET → redirect to the viewer's (watermarked) preview of the image. */
export async function GET(request: Request, { params }: { params: Promise<{ assetId: string }> }) {
  const { assetId } = await params;
  if (!/^[0-9a-f-]{36}$/.test(assetId)) return new Response(null, { status: 404 });
  const { viewer, audience } = await getAudience();
  try {
    const url = await issuePreview(viewer, assetId, {
      adult: audience.adult,
      ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      userAgent: request.headers.get("user-agent"),
    });
    return new Response(null, {
      status: 302,
      // The signed URL is stable for a few minutes; let the browser reuse the redirect meanwhile.
      headers: { Location: url, "Cache-Control": "private, max-age=120" },
    });
  } catch (error) {
    if (error instanceof DownloadError) {
      return new Response(null, { status: error.code === "not_found" ? 404 : 403 });
    }
    console.error("[previews]", error);
    return new Response(null, { status: 500 });
  }
}

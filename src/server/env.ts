import "server-only";
import { z } from "zod";

// Each group is validated the first time something reads it, not at import:
// `next build` and pages that never touch the database or storage keep working
// without those variables, and a missing one fails loudly where it is needed.
function lazy<T extends z.ZodRawShape>(name: string, shape: T) {
  let parsed: z.infer<z.ZodObject<T>> | undefined;
  return () => {
    if (!parsed) {
      const result = z.object(shape).safeParse(process.env);
      if (!result.success) {
        const fields = result.error.issues.map((issue) => issue.path.join(".")).join(", ");
        throw new Error(`Invalid ${name} environment variables: ${fields}. See .env.example.`);
      }
      parsed = result.data;
    }
    return parsed;
  };
}

/** An optional variable left empty in .env (`R2_ACCOUNT_ID=`) counts as unset. */
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === "" ? undefined : value), schema.optional());

export const dbEnv = lazy("database", {
  DATABASE_URL: z.url(),
});

export const storageEnv = lazy("storage", {
  // Cloudflare R2 in production. R2_ENDPOINT overrides the R2 endpoint, e.g. a
  // local MinIO (http://localhost:9000), which also needs path-style URLs.
  R2_ACCOUNT_ID: optional(z.string()),
  R2_ENDPOINT: optional(z.url()),
  R2_FORCE_PATH_STYLE: z.stringbool().default(false),
  R2_ACCESS_KEY_ID: z.string().min(1),
  R2_SECRET_ACCESS_KEY: z.string().min(1),
  /** Private bucket: originals, previews, watermarked copies. */
  R2_BUCKET: z.string().min(1),
  /**
   * Separate public bucket for blurred previews. A custom domain on R2 exposes
   * a whole bucket, so nothing private may live in this one.
   */
  R2_PUBLIC_BUCKET: z.string().min(1),
  /** The public bucket's custom domain (or the local S3 URL of that bucket). */
  R2_PUBLIC_BASE_URL: z.url(),
});

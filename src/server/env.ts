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

/** An optional variable left empty in .env (`S3_PUBLIC_ENDPOINT=`) counts as unset. */
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === "" ? undefined : value), schema.optional());

export const dbEnv = lazy("database", {
  DATABASE_URL: z.url(),
});

export const storageEnv = lazy("storage", {
  // Any S3-compatible storage: RustFS on our own server by default.
  /** Where the app itself reaches storage, e.g. http://storage:9000 inside compose. */
  S3_ENDPOINT: z.url(),
  /**
   * Where browsers reach it, e.g. https://files.moetsukita.xyz. Signed URLs
   * are signed for this host. Defaults to S3_ENDPOINT.
   */
  S3_PUBLIC_ENDPOINT: optional(z.url()),
  S3_REGION: z.string().min(1).default("us-east-1"),
  /** RustFS and MinIO need path-style URLs (host/bucket/key). */
  S3_FORCE_PATH_STYLE: z.stringbool().default(true),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1),
  /** Private bucket: originals, previews, watermarked copies. */
  S3_BUCKET: z.string().min(1),
  /** Anonymously readable bucket that holds nothing but blurred previews. */
  S3_PUBLIC_BUCKET: z.string().min(1),
  /** Base URL of the public bucket. Defaults to S3_PUBLIC_ENDPOINT/S3_PUBLIC_BUCKET. */
  S3_PUBLIC_BASE_URL: optional(z.url()),
});

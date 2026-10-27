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
  // Any S3-compatible storage: Cloudflare R2 in production, RustFS locally.
  S3_ENDPOINT: z.url(),
  /** Host browsers use, if different from S3_ENDPOINT; signed URLs are signed for it. */
  S3_PUBLIC_ENDPOINT: optional(z.url()),
  S3_REGION: z.string().min(1).default("auto"),
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

/** Sign-in providers. Each is enabled only when its client id and secret are set. */
export const authEnv = lazy("auth", {
  AUTH_DISCORD_ID: optional(z.string()),
  AUTH_DISCORD_SECRET: optional(z.string()),
  AUTH_PATREON_ID: optional(z.string()),
  AUTH_PATREON_SECRET: optional(z.string()),
  /** Discord user ids that are always admins, comma-separated. */
  OWNER_DISCORD_IDS: z
    .string()
    .default("")
    .transform((value) =>
      value
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean),
    ),
});

/** Reading members' roles on our server, which is how Fanbox plans arrive. */
export const discordEnv = lazy("discord", {
  DISCORD_BOT_TOKEN: z.string().min(1),
  DISCORD_GUILD_ID: z.string().min(1),
});

export const patreonEnv = lazy("patreon", {
  PATREON_CAMPAIGN_ID: z.string().min(1),
  /** Creator token: lists every member for the scheduled sync. Optional. */
  PATREON_CREATOR_ACCESS_TOKEN: optional(z.string()),
  /** Secret of the webhook set up in the Patreon portal. Optional. */
  PATREON_WEBHOOK_SECRET: optional(z.string()),
});

/** Whether an optional integration has its variables, without throwing. */
export function isConfigured(group: () => unknown) {
  try {
    group();
    return true;
  } catch {
    return false;
  }
}

import { z } from "zod";
import { slugPattern } from "@/lib/slug";
import { ServiceError } from "./errors";

const text = (max: number) => z.string().trim().max(max);

/** Text per language; empty languages are dropped. */
export const localized = (max: number) =>
  z
    .object({ en: text(max).optional(), ru: text(max).optional(), ja: text(max).optional() })
    .transform(
      (value) =>
        Object.fromEntries(Object.entries(value).filter(([, entry]) => entry)) as Partial<
          Record<"en" | "ru" | "ja", string>
        >,
    );

const requiredLocalized = (max: number) =>
  localized(max).refine((value) => Object.keys(value).length > 0, "Enter at least one language");

export const slug = z
  .string()
  .trim()
  .toLowerCase()
  .regex(slugPattern, "Lowercase letters, digits and dashes");

export const workInput = z
  .object({
    slug,
    title: requiredLocalized(200),
    description: localized(5000),
    rating: z.enum(["sfw", "nsfw"]),
    minTierId: z.uuid().nullable(),
    status: z.enum(["draft", "scheduled", "published"]),
    publishedAt: z.coerce.date().nullable(),
    tagIds: z.array(z.uuid()).max(100),
  })
  .refine((work) => work.status !== "scheduled" || work.publishedAt !== null, {
    path: ["publishedAt"],
    message: "Pick a date for a scheduled work",
  });
export type WorkInput = z.input<typeof workInput>;

export const tagInput = z.object({
  slug,
  name: requiredLocalized(80),
  category: z.enum(["character", "series", "general", "meta"]),
  aliases: z.array(z.string().trim().toLowerCase().min(1).max(80)).max(50),
});
export type TagInput = z.input<typeof tagInput>;

export const tierInput = z.object({
  rank: z.number().int().min(1).max(1000),
  name: requiredLocalized(60),
  description: localized(300),
  color: z.string().max(20).nullable(),
});
export type TierInput = z.input<typeof tierInput>;

export const mappingInput = z.object({
  tierId: z.uuid(),
  source: z.enum(["patreon_tier", "discord_role"]),
  externalId: z
    .string()
    .trim()
    .regex(/^\d{1,30}$/, "A numeric id"),
  label: z.string().trim().max(100).nullable(),
});
export type MappingInput = z.input<typeof mappingInput>;

export const userUpdateInput = z.object({
  role: z.enum(["user", "editor", "admin"]),
  banned: z.boolean(),
  banReason: z.string().trim().max(300).nullable(),
  manualTierId: z.uuid().nullable(),
  manualExpiresAt: z.coerce.date().nullable(),
});
export type UserUpdateInput = z.input<typeof userUpdateInput>;

/** Parses service input; failures become field errors the form can show. */
export function parseInput<S extends z.ZodType>(schema: S, raw: unknown): z.output<S> {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new ServiceError(
      "Check the highlighted fields",
      Object.fromEntries(parsed.error.issues.map((issue) => [issue.path.join("."), issue.message])),
    );
  }
  return parsed.data;
}

import { type SQL, sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigint,
  bigserial,
  customType,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/** A string per interface language; any of them may be missing. */
export type Localized = Partial<Record<"en" | "ru" | "ja", string>>;

const tsvector = customType<{ data: string }>({
  dataType: () => "tsvector",
});

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

// Every language of a localized column, for search. `||` and `->>` are
// immutable, which a generated column requires (concat_ws is not).
const allLanguages = (column: string) =>
  `coalesce(${column}->>'en', '') || ' ' || coalesce(${column}->>'ru', '') || ' ' || coalesce(${column}->>'ja', '')`;

// ─── Enums ───────────────────────────────────────────────────────────────────

export const userRole = pgEnum("user_role", ["user", "editor", "admin"]);
export const entitlementSource = pgEnum("entitlement_source", ["patreon", "discord", "manual"]);
export const tierMappingSource = pgEnum("tier_mapping_source", ["patreon_tier", "discord_role"]);
export const workRating = pgEnum("work_rating", ["sfw", "nsfw"]);
export const workStatus = pgEnum("work_status", ["draft", "scheduled", "published"]);
export const assetKind = pgEnum("asset_kind", ["image", "archive", "source"]);
export const assetStatus = pgEnum("asset_status", ["pending", "processing", "ready", "failed"]);
export const tagCategory = pgEnum("tag_category", ["character", "series", "general", "meta"]);
export const downloadKind = pgEnum("download_kind", ["file", "preview"]);

// ─── Auth.js (shape required by @auth/drizzle-adapter) ──────────────────────

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: timestamp("email_verified", { withTimezone: true, mode: "date" }),
  image: text("image"),
  role: userRole("role").notNull().default("user"),
  ageConfirmedAt: timestamp("age_confirmed_at", { withTimezone: true }),
  bannedAt: timestamp("banned_at", { withTimezone: true }),
  banReason: text("ban_reason"),
  /** Last time entitlements were checked against Discord and Patreon. */
  accessSyncedAt: timestamp("access_synced_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const accounts = pgTable(
  "accounts",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (t) => [
    primaryKey({ columns: [t.provider, t.providerAccountId] }),
    index("accounts_user_id_idx").on(t.userId),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    sessionToken: text("session_token").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expires: timestamp("expires", { withTimezone: true, mode: "date" }).notNull(),
  },
  (t) => [index("sessions_user_id_idx").on(t.userId)],
);

export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { withTimezone: true, mode: "date" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.identifier, t.token] })],
);

// ─── Access levels ──────────────────────────────────────────────────────────

/** One scale for everyone: a higher rank sees everything a lower rank sees. */
export const tiers = pgTable("tiers", {
  id: uuid("id").primaryKey().defaultRandom(),
  rank: integer("rank").notNull().unique(),
  name: jsonb("name").$type<Localized>().notNull(),
  description: jsonb("description").$type<Localized>().notNull().default({}),
  color: text("color"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** Which Patreon tier or Discord role (Fanbox plan) grants which tier. */
export const tierMappings = pgTable(
  "tier_mappings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    source: tierMappingSource("source").notNull(),
    externalId: text("external_id").notNull(),
    /** Name on the provider's side, cached for the admin UI. */
    label: text("label"),
    tierId: uuid("tier_id")
      .notNull()
      .references(() => tiers.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("tier_mappings_source_external_id_idx").on(t.source, t.externalId)],
);

/** The tier a user holds through one source; the effective tier is the highest rank. */
export const entitlements = pgTable(
  "entitlements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    source: entitlementSource("source").notNull(),
    tierId: uuid("tier_id")
      .notNull()
      .references(() => tiers.id, { onDelete: "cascade" }),
    /** Patreon member id, Discord role id, or the admin who granted it. */
    externalRef: text("external_ref"),
    /** Set for manual grants with an end date. */
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("entitlements_user_id_source_idx").on(t.userId, t.source)],
);

// ─── Gallery ────────────────────────────────────────────────────────────────

export const works = pgTable(
  "works",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),
    title: jsonb("title").$type<Localized>().notNull(),
    description: jsonb("description").$type<Localized>().notNull().default({}),
    rating: workRating("rating").notNull().default("sfw"),
    /** Lowest tier that can open the work; null means every visitor. */
    minTierId: uuid("min_tier_id").references(() => tiers.id, { onDelete: "restrict" }),
    status: workStatus("status").notNull().default("draft"),
    /** When it becomes visible: publication time, or the scheduled time. */
    publishedAt: timestamp("published_at", { withTimezone: true }),
    coverAssetId: uuid("cover_asset_id").references((): AnyPgColumn => assets.id, {
      onDelete: "set null",
    }),
    createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    /** Full-text search over every language, title weighted above description. */
    searchVector: tsvector("search_vector")
      .notNull()
      .generatedAlwaysAs(
        (): SQL =>
          sql.raw(
            `setweight(to_tsvector('simple'::regconfig, ${allLanguages("title")}), 'A') || setweight(to_tsvector('simple'::regconfig, ${allLanguages("description")}), 'B')`,
          ),
      ),
    /** Lower-cased title and description for trigram search (Japanese, substrings). */
    searchText: text("search_text")
      .notNull()
      .generatedAlwaysAs(
        (): SQL =>
          sql.raw(`lower(${allLanguages("title")} || ' ' || ${allLanguages("description")})`),
      ),
  },
  (t) => [
    index("works_status_published_at_idx").on(t.status, t.publishedAt.desc()),
    index("works_min_tier_id_idx").on(t.minTierId),
    index("works_search_vector_idx").using("gin", t.searchVector),
    index("works_search_text_trgm_idx").using("gin", sql`${t.searchText} gin_trgm_ops`),
  ],
);

export const assets = pgTable(
  "assets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workId: uuid("work_id")
      .notNull()
      .references(() => works.id, { onDelete: "cascade" }),
    kind: assetKind("kind").notNull(),
    status: assetStatus("status").notNull().default("pending"),
    position: integer("position").notNull().default(0),
    /** The original in the private bucket; never handed out as is. */
    storageKey: text("storage_key").notNull().unique(),
    filename: text("filename").notNull(),
    mime: text("mime").notNull(),
    size: bigint("size", { mode: "number" }).notNull(),
    sha256: text("sha256"),
    width: integer("width"),
    height: integer("height"),
    thumbKey: text("thumb_key"),
    previewKey: text("preview_key"),
    blurKey: text("blur_key"),
    /** Stricter than the work's tier, e.g. a PSD only for the top tier. */
    minTierId: uuid("min_tier_id").references(() => tiers.id, { onDelete: "restrict" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("assets_work_id_position_idx").on(t.workId, t.position)],
);

export const tags = pgTable(
  "tags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),
    name: jsonb("name").$type<Localized>().notNull(),
    category: tagCategory("category").notNull().default("general"),
    /** Other spellings that find the tag, lower-cased. */
    aliases: text("aliases").array().notNull().default(sql`'{}'::text[]`),
    createdAt: createdAt(),
  },
  (t) => [
    index("tags_category_idx").on(t.category),
    index("tags_aliases_idx").using("gin", t.aliases),
  ],
);

export const workTags = pgTable(
  "work_tags",
  {
    workId: uuid("work_id")
      .notNull()
      .references(() => works.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.workId, t.tagId] }), index("work_tags_tag_id_idx").on(t.tagId)],
);

// ─── Downloads and audit ────────────────────────────────────────────────────

/** Every issued download; `watermark` is the payload embedded in that copy. */
export const downloads = pgTable(
  "downloads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    assetId: uuid("asset_id").references(() => assets.id, { onDelete: "set null" }),
    watermark: bigint("watermark", { mode: "bigint" }).unique(),
    /** The watermarked copy handed out; repeat downloads within a day reuse it. */
    derivedKey: text("derived_key"),
    /** A file download, or a personal watermarked preview shown on the work page. */
    kind: downloadKind("kind").notNull().default("file"),
    /** Keyed hash of the client IP: enough to spot sharing, not to locate anyone. */
    ipHash: text("ip_hash"),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
  },
  (t) => [
    index("downloads_user_id_created_at_idx").on(t.userId, t.createdAt.desc()),
    index("downloads_created_at_idx").on(t.createdAt.desc()),
    index("downloads_user_id_asset_id_idx").on(t.userId, t.assetId, t.createdAt.desc()),
  ],
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    entity: text("entity").notNull(),
    entityId: text("entity_id"),
    diff: jsonb("diff"),
    createdAt: createdAt(),
  },
  (t) => [
    index("audit_log_created_at_idx").on(t.createdAt.desc()),
    index("audit_log_entity_idx").on(t.entity, t.entityId),
  ],
);

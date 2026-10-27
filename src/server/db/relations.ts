import { relations } from "drizzle-orm";
import {
  accounts,
  assets,
  auditLog,
  downloads,
  entitlements,
  sessions,
  tags,
  tierMappings,
  tiers,
  users,
  works,
  workTags,
} from "./schema";

export const usersRelations = relations(users, ({ many }) => ({
  accounts: many(accounts),
  sessions: many(sessions),
  entitlements: many(entitlements),
  downloads: many(downloads),
}));

export const accountsRelations = relations(accounts, ({ one }) => ({
  user: one(users, { fields: [accounts.userId], references: [users.id] }),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

export const tiersRelations = relations(tiers, ({ many }) => ({
  mappings: many(tierMappings),
  entitlements: many(entitlements),
  works: many(works),
}));

export const tierMappingsRelations = relations(tierMappings, ({ one }) => ({
  tier: one(tiers, { fields: [tierMappings.tierId], references: [tiers.id] }),
}));

export const entitlementsRelations = relations(entitlements, ({ one }) => ({
  user: one(users, { fields: [entitlements.userId], references: [users.id] }),
  tier: one(tiers, { fields: [entitlements.tierId], references: [tiers.id] }),
}));

export const worksRelations = relations(works, ({ one, many }) => ({
  minTier: one(tiers, { fields: [works.minTierId], references: [tiers.id] }),
  cover: one(assets, {
    fields: [works.coverAssetId],
    references: [assets.id],
    relationName: "cover",
  }),
  createdBy: one(users, { fields: [works.createdById], references: [users.id] }),
  assets: many(assets, { relationName: "work_assets" }),
  workTags: many(workTags),
}));

export const assetsRelations = relations(assets, ({ one }) => ({
  work: one(works, {
    fields: [assets.workId],
    references: [works.id],
    relationName: "work_assets",
  }),
  minTier: one(tiers, { fields: [assets.minTierId], references: [tiers.id] }),
}));

export const tagsRelations = relations(tags, ({ many }) => ({
  workTags: many(workTags),
}));

export const workTagsRelations = relations(workTags, ({ one }) => ({
  work: one(works, { fields: [workTags.workId], references: [works.id] }),
  tag: one(tags, { fields: [workTags.tagId], references: [tags.id] }),
}));

export const downloadsRelations = relations(downloads, ({ one }) => ({
  user: one(users, { fields: [downloads.userId], references: [users.id] }),
  asset: one(assets, { fields: [downloads.assetId], references: [assets.id] }),
}));

export const auditLogRelations = relations(auditLog, ({ one }) => ({
  actor: one(users, { fields: [auditLog.actorId], references: [users.id] }),
}));

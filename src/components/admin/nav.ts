import type { IconName } from "@once-ui-system/core";

export type AdminNavLink = { href: string; label: string; icon: IconName; adminOnly?: boolean };

export const adminNav: AdminNavLink[] = [
  { href: "/admin", label: "Overview", icon: "home" },
  { href: "/admin/works", label: "Works", icon: "image" },
  { href: "/admin/tags", label: "Tags", icon: "tag" },
  { href: "/admin/tiers", label: "Tiers", icon: "star", adminOnly: true },
  { href: "/admin/users", label: "Users", icon: "people", adminOnly: true },
  { href: "/admin/audit", label: "Audit log", icon: "document", adminOnly: true },
];

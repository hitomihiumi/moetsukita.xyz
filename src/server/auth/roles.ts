export type Role = "user" | "editor" | "admin";

const roleLevel: Record<Role, number> = { user: 0, editor: 1, admin: 2 };

export function hasRole(viewer: { role: Role } | null, role: Role) {
  return viewer !== null && roleLevel[viewer.role] >= roleLevel[role];
}

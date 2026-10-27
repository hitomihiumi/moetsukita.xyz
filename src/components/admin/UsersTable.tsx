"use client";

import {
  Button,
  Column,
  DateInput,
  Dialog,
  Input,
  Row,
  Select,
  Switch,
  Table,
  Tag,
  Text,
  User,
  useToast,
} from "@once-ui-system/core";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { syncUserAction, updateUserAction } from "@/app/admin/actions";
import { dateTime } from "./labels";
import { PageHeader } from "./PageHeader";

type Role = "user" | "editor" | "admin";
type UserRow = {
  id: string;
  name: string;
  image: string | null;
  role: Role;
  owner: boolean;
  banned: boolean;
  banReason: string | null;
  providers: string[];
  createdAt: string;
  sources: {
    source: "discord" | "patreon" | "manual";
    tierId: string;
    tier: string;
    rank: number;
    expiresAt: string | null;
  }[];
};
type Draft = {
  role: Role;
  banned: boolean;
  banReason: string;
  manualTierId: string | null;
  manualExpiresAt: Date | null;
};

const roleScheme = { user: "neutral", editor: "info", admin: "brand" } as const;
const NONE = "none";

export function UsersTable({
  users,
  tiers,
  viewerId,
}: {
  users: UserRow[];
  tiers: { id: string; label: string }[];
  viewerId: string;
}) {
  const router = useRouter();
  const { addToast } = useToast();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);

  const open = (user: UserRow) => {
    const manual = user.sources.find((source) => source.source === "manual");
    setEditing(user);
    setDraft({
      role: user.role,
      banned: user.banned,
      banReason: user.banReason ?? "",
      manualTierId: manual?.tierId ?? null,
      manualExpiresAt: manual?.expiresAt ? new Date(manual.expiresAt) : null,
    });
  };

  const after = (result: { ok: boolean; error?: string }, message: string) => {
    if (result.ok) {
      addToast({ variant: "success", message });
      router.refresh();
    } else addToast({ variant: "danger", message: result.error ?? "Failed" });
    return result.ok;
  };

  const locked = editing ? editing.owner || editing.id === viewerId : false;

  return (
    <Column fillWidth gap="24">
      <PageHeader
        title="Users"
        description="Everyone who has signed in, with where their tier comes from."
      />
      <Table
        searchable
        searchPlaceholder="Search users"
        paginated
        defaultPageSize={50}
        onRowClick={(row) => open(users[row])}
        data={{
          headers: [
            { content: "User", key: "user", sortable: true },
            { content: "Tier", key: "tier", sortable: true },
            { content: "Role", key: "role", sortable: true },
            { content: "Joined", key: "joined", sortable: true, align: "right" },
          ],
          rows: users.map((user) => [
            <User
              key="user"
              name={user.name}
              subline={user.providers.join(" · ") || "no accounts"}
              avatarProps={{
                src: user.image ?? undefined,
                value: user.image ? undefined : user.name[0],
              }}
            />,
            <Column key="tier" gap="4">
              <Text variant="label-default-s">{user.sources[0]?.tier ?? "Free"}</Text>
              <Text variant="body-default-xs" onBackground="neutral-weak">
                {user.sources.map((source) => `${source.source}: ${source.tier}`).join(" · ")}
              </Text>
            </Column>,
            <Row key="role" gap="4" wrap>
              <Tag size="s" scheme={roleScheme[user.role]}>
                {user.owner ? "owner" : user.role}
              </Tag>
              {user.banned && (
                <Tag size="s" scheme="danger">
                  banned
                </Tag>
              )}
            </Row>,
            dateTime.format(new Date(user.createdAt)),
          ]),
        }}
        actions={[
          { icon: "edit", tooltip: "Edit", onClick: (row) => open(users[row]) },
          {
            icon: "refresh",
            tooltip: "Re-check tier now",
            onClick: (row) =>
              startTransition(async () => {
                after(await syncUserAction(users[row].id), "Tier re-checked");
              }),
          },
        ]}
      />

      <Dialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing?.name ?? ""}
        description={
          locked ? "Owners and your own account stay admins and cannot be banned." : undefined
        }
        footer={
          <Row fillWidth horizontal="end" gap="8">
            <Button variant="secondary" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button
              loading={pending}
              onClick={() =>
                startTransition(async () => {
                  if (!editing || !draft) return;
                  const ok = after(
                    await updateUserAction(editing.id, {
                      ...draft,
                      banReason: draft.banReason || null,
                    }),
                    "User saved",
                  );
                  if (ok) setEditing(null);
                })
              }
            >
              Save
            </Button>
          </Row>
        }
      >
        {editing && draft && (
          <Column gap="16">
            <Select
              id="user-role"
              label="Role"
              value={draft.role}
              onSelect={(role) => setDraft({ ...draft, role: role as Role })}
              options={[
                { value: "user", label: "User", disabled: locked },
                { value: "editor", label: "Editor — works and tags", disabled: locked },
                { value: "admin", label: "Admin — everything" },
              ]}
            />
            <Select
              id="user-manual-tier"
              label="Granted tier (on top of Discord and Patreon)"
              value={draft.manualTierId ?? NONE}
              onSelect={(value) =>
                setDraft({ ...draft, manualTierId: value === NONE ? null : (value as string) })
              }
              options={[
                { value: NONE, label: "None" },
                ...tiers.map((tier) => ({ value: tier.id, label: tier.label })),
              ]}
            />
            {draft.manualTierId && (
              <DateInput
                id="user-manual-expires"
                label="Grant ends (empty = never)"
                value={draft.manualExpiresAt ?? undefined}
                onChange={(date) => setDraft({ ...draft, manualExpiresAt: date })}
              />
            )}
            <Switch
              label="Banned"
              description="Signs the user out everywhere and blocks sign-in."
              checked={draft.banned}
              disabled={locked}
              onToggle={(banned) => setDraft({ ...draft, banned })}
            />
            {draft.banned && (
              <Input
                id="user-ban-reason"
                label="Reason (internal)"
                value={draft.banReason}
                onChange={(event) => setDraft({ ...draft, banReason: event.target.value })}
              />
            )}
          </Column>
        )}
      </Dialog>
    </Column>
  );
}

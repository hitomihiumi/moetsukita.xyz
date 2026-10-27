"use client";

import {
  Button,
  Column,
  Dialog,
  Grid,
  Heading,
  Icon,
  IconButton,
  Input,
  NumberInput,
  Row,
  Select,
  Tag,
  Text,
  useToast,
} from "@once-ui-system/core";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  addMappingAction,
  deleteMappingAction,
  deleteTierAction,
  saveTierAction,
} from "@/app/admin/actions";
import { ConfirmDialog } from "./ConfirmDialog";
import { PageHeader } from "./PageHeader";

type Lang = "en" | "ru" | "ja";
type Localized = Partial<Record<Lang, string>>;
type Source = "patreon_tier" | "discord_role";
type Mapping = { id: string; source: Source; externalId: string; label: string | null };
type TierRow = {
  id: string;
  rank: number;
  name: Localized;
  description: Localized;
  color: string | null;
  mappings: Mapping[];
};
type Option = { id: string; name: string };

const colors = ["brand", "accent", "info", "success", "warning", "danger", "neutral"] as const;
type Color = (typeof colors)[number];
const sourceLabel: Record<Source, string> = {
  discord_role: "Discord role",
  patreon_tier: "Patreon tier",
};
const MANUAL = "__manual";

export function TiersManager({
  tiers,
  discordRoles,
  patreonTiers,
}: {
  tiers: TierRow[];
  discordRoles: Option[];
  patreonTiers: Option[];
}) {
  const router = useRouter();
  const { addToast } = useToast();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<Omit<TierRow, "mappings"> | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [deleting, setDeleting] = useState<TierRow | null>(null);
  const [mapping, setMapping] = useState<{
    tierId: string;
    source: Source;
    choice: string;
    externalId: string;
  } | null>(null);

  const after = (result: { ok: boolean; error?: string }, message: string) => {
    if (result.ok) {
      addToast({ variant: "success", message });
      router.refresh();
    } else addToast({ variant: "danger", message: result.error ?? "Failed" });
    return result.ok;
  };

  const nextRank = Math.max(0, ...tiers.map((tier) => tier.rank)) + 1;
  const options = (source: Source) => (source === "discord_role" ? discordRoles : patreonTiers);
  const name = (localized: Localized) => localized.en ?? localized.ru ?? localized.ja ?? "—";

  return (
    <Column fillWidth gap="24">
      <PageHeader
        title="Tiers"
        description="One scale for everyone: a higher rank opens everything below it. Map Discord roles (Fanbox plans) and Patreon tiers to each."
        action={
          <Button
            prefixIcon="plus"
            onClick={() =>
              setEditing({ id: "", rank: nextRank, name: {}, description: {}, color: "brand" })
            }
          >
            New tier
          </Button>
        }
      />

      {tiers.length === 0 && (
        <Text variant="body-default-s" onBackground="neutral-weak">
          No tiers yet.
        </Text>
      )}

      {tiers.map((tier) => (
        <Column key={tier.id} background="surface" border radius="l" padding="20" gap="16">
          <Row horizontal="between" vertical="center" gap="16" wrap>
            <Row gap="12" vertical="center">
              <Tag size="l" scheme={(tier.color as Color) ?? "neutral"}>
                Rank {tier.rank}
              </Tag>
              <Column gap="2">
                <Heading as="h2" variant="heading-strong-s">
                  {name(tier.name)}
                </Heading>
                {tier.description.en && (
                  <Text variant="body-default-xs" onBackground="neutral-weak">
                    {tier.description.en}
                  </Text>
                )}
              </Column>
            </Row>
            <Row gap="4">
              <IconButton
                icon="edit"
                variant="ghost"
                size="s"
                tooltip="Edit tier"
                onClick={() => {
                  const { mappings: _mappings, ...rest } = tier;
                  setEditing(rest);
                }}
              />
              <IconButton
                icon="trash"
                variant="ghost"
                size="s"
                tooltip="Delete tier"
                onClick={() => setDeleting(tier)}
              />
            </Row>
          </Row>

          <Column gap="8">
            {tier.mappings.map((entry) => (
              <Row key={entry.id} gap="12" vertical="center" horizontal="between">
                <Row gap="8" vertical="center">
                  <Icon
                    name={entry.source === "discord_role" ? "discord" : "patreon"}
                    size="s"
                    onBackground="neutral-weak"
                  />
                  <Text variant="body-default-s">{entry.label ?? entry.externalId}</Text>
                  <Text variant="body-default-xs" onBackground="neutral-weak">
                    {sourceLabel[entry.source]} · {entry.externalId}
                  </Text>
                </Row>
                <IconButton
                  icon="close"
                  variant="ghost"
                  size="s"
                  tooltip="Remove mapping"
                  onClick={() =>
                    startTransition(async () => {
                      after(await deleteMappingAction(entry.id), "Mapping removed");
                    })
                  }
                />
              </Row>
            ))}
            <Row>
              <Button
                size="s"
                variant="secondary"
                prefixIcon="link"
                onClick={() =>
                  setMapping({
                    tierId: tier.id,
                    source: "discord_role",
                    choice: "",
                    externalId: "",
                  })
                }
              >
                Map role or tier
              </Button>
            </Row>
          </Column>
        </Column>
      ))}

      <Dialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing?.id ? "Edit tier" : "New tier"}
        footer={
          <Row fillWidth horizontal="end" gap="8">
            <Button variant="secondary" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button
              loading={pending}
              onClick={() =>
                startTransition(async () => {
                  if (!editing) return;
                  const { id, ...input } = editing;
                  const result = await saveTierAction(id || null, input);
                  setErrors(result.ok ? {} : (result.fieldErrors ?? {}));
                  if (after(result, "Tier saved")) setEditing(null);
                })
              }
            >
              Save
            </Button>
          </Row>
        }
      >
        {editing && (
          <Column gap="16">
            <Grid columns="2" gap="12">
              <NumberInput
                id="tier-rank"
                label="Rank"
                min={1}
                value={editing.rank}
                onChange={(rank) => setEditing({ ...editing, rank })}
                error={Boolean(errors.rank)}
                errorMessage={errors.rank}
              />
              <Select
                id="tier-color"
                label="Colour"
                value={editing.color ?? "neutral"}
                onSelect={(color) => setEditing({ ...editing, color: color as string })}
                options={colors.map((color) => ({ value: color, label: color }))}
              />
            </Grid>
            {(["en", "ru", "ja"] as const).map((lang) => (
              <Grid key={lang} columns="2" gap="12" s={{ columns: 1 }}>
                <Input
                  id={`tier-name-${lang}`}
                  label={`Name · ${lang.toUpperCase()}`}
                  value={editing.name[lang] ?? ""}
                  onChange={(event) =>
                    setEditing({
                      ...editing,
                      name: { ...editing.name, [lang]: event.target.value },
                    })
                  }
                />
                <Input
                  id={`tier-description-${lang}`}
                  label={`Description · ${lang.toUpperCase()}`}
                  value={editing.description[lang] ?? ""}
                  onChange={(event) =>
                    setEditing({
                      ...editing,
                      description: { ...editing.description, [lang]: event.target.value },
                    })
                  }
                />
              </Grid>
            ))}
            {errors.name && (
              <Text variant="body-default-s" onBackground="danger-weak">
                {errors.name}
              </Text>
            )}
          </Column>
        )}
      </Dialog>

      <Dialog
        open={mapping !== null}
        onClose={() => setMapping(null)}
        title="Map to this tier"
        description="Members with this Discord role or Patreon tier get the tier."
        footer={
          <Row fillWidth horizontal="end" gap="8">
            <Button variant="secondary" onClick={() => setMapping(null)}>
              Cancel
            </Button>
            <Button
              loading={pending}
              disabled={!mapping?.externalId}
              onClick={() =>
                startTransition(async () => {
                  if (!mapping) return;
                  const picked = options(mapping.source).find((o) => o.id === mapping.externalId);
                  const ok = after(
                    await addMappingAction({
                      tierId: mapping.tierId,
                      source: mapping.source,
                      externalId: mapping.externalId,
                      label: picked?.name ?? null,
                    }),
                    "Mapping added",
                  );
                  if (ok) setMapping(null);
                })
              }
            >
              Add
            </Button>
          </Row>
        }
      >
        {mapping && (
          <Column gap="16">
            <Select
              id="mapping-source"
              label="Source"
              value={mapping.source}
              onSelect={(source) =>
                setMapping({ ...mapping, source: source as Source, choice: "", externalId: "" })
              }
              options={[
                { value: "discord_role", label: "Discord role (Fanbox plan)" },
                { value: "patreon_tier", label: "Patreon tier" },
              ]}
            />
            <Select
              id="mapping-choice"
              label={mapping.source === "discord_role" ? "Role" : "Patreon tier"}
              searchable
              value={mapping.choice}
              onSelect={(choice) =>
                setMapping({
                  ...mapping,
                  choice: choice as string,
                  externalId: choice === MANUAL ? "" : (choice as string),
                })
              }
              options={[
                ...options(mapping.source).map((option) => ({
                  value: option.id,
                  label: option.name,
                })),
                { value: MANUAL, label: "Enter an id…" },
              ]}
            />
            {(mapping.choice === MANUAL || options(mapping.source).length === 0) && (
              <Input
                id="mapping-id"
                label={mapping.source === "discord_role" ? "Role id" : "Patreon tier id"}
                description="The integration is not configured or the item is not listed."
                value={mapping.externalId}
                onChange={(event) =>
                  setMapping({ ...mapping, externalId: event.target.value.trim() })
                }
              />
            )}
          </Column>
        )}
      </Dialog>

      <ConfirmDialog
        open={deleting !== null}
        title="Delete tier?"
        description="Its mappings and grants are removed. Works that require it must be changed first."
        pending={pending}
        onConfirm={() =>
          startTransition(async () => {
            if (!deleting) return;
            after(await deleteTierAction(deleting.id), "Tier deleted");
            setDeleting(null);
          })
        }
        onClose={() => setDeleting(null)}
      />
    </Column>
  );
}

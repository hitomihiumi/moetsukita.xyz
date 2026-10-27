"use client";

import {
  Column,
  Heading,
  Icon,
  IconButton,
  Media,
  ProgressBar,
  Row,
  Select,
  Sortable,
  SortableHandle,
  SortableItem,
  Tag,
  Text,
  useToast,
} from "@once-ui-system/core";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  deleteAssetAction,
  reorderAssetsAction,
  setAssetTierAction,
  setCoverAction,
} from "@/app/admin/actions";
import { acceptedExtensions, formatBytes } from "@/lib/files";
import { ConfirmDialog } from "./ConfirmDialog";
import { uploadFile } from "./upload";

type Asset = {
  id: string;
  kind: "image" | "archive" | "source";
  status: "pending" | "processing" | "ready" | "failed";
  filename: string;
  size: number;
  width: number | null;
  height: number | null;
  minTierId: string | null;
  thumb: string | null;
};

type Upload = { key: string; name: string; progress: number; error?: string };

const statusTag = {
  pending: { scheme: "warning", label: "Uploading" },
  processing: { scheme: "warning", label: "Processing" },
  ready: { scheme: "success", label: "Ready" },
  failed: { scheme: "danger", label: "Failed" },
} as const;

const kindIcon = { image: "image", archive: "folder", source: "file" } as const;
const SAME_AS_WORK = "inherit";

export function AssetManager({
  workId,
  coverAssetId,
  assets,
  tiers,
}: {
  workId: string;
  coverAssetId: string | null;
  assets: Asset[];
  tiers: { id: string; label: string }[];
}) {
  const router = useRouter();
  const { addToast } = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [order, setOrder] = useState(assets.map((asset) => asset.id));
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [dragging, setDragging] = useState(false);
  const [deleting, setDeleting] = useState<Asset | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => setOrder(assets.map((asset) => asset.id)), [assets]);
  const byId = new Map(assets.map((asset) => [asset.id, asset]));

  const report = (result: { ok: boolean; error?: string }) => {
    if (!result.ok) addToast({ variant: "danger", message: result.error ?? "Failed" });
    router.refresh();
  };

  const upload = async (files: FileList | File[]) => {
    const queue = [...files].map((file) => ({ file, key: `${file.name}-${crypto.randomUUID()}` }));
    setUploads((current) => [
      ...current,
      ...queue.map(({ file, key }) => ({ key, name: file.name, progress: 0 })),
    ]);
    // One file at a time keeps the connection for the parts of a large file.
    for (const { file, key } of queue) {
      const update = (patch: Partial<Upload>) =>
        setUploads((current) =>
          current.map((item) => (item.key === key ? { ...item, ...patch } : item)),
        );
      try {
        await uploadFile(workId, file, (progress) => update({ progress }));
        setUploads((current) => current.filter((item) => item.key !== key));
        router.refresh();
      } catch (error) {
        update({ error: (error as Error).message });
      }
    }
  };

  const reorder = (ids: string[]) => {
    setOrder(ids);
    startTransition(async () => report(await reorderAssetsAction(workId, ids)));
  };

  return (
    <Column fillWidth gap="16" marginTop="32">
      <Row horizontal="between" vertical="center" gap="16">
        <Heading as="h2" variant="heading-strong-m">
          Files
        </Heading>
        <Text variant="body-default-xs" onBackground="neutral-weak">
          Images, PSD/CLIP sources and archives, up to 20 GB each. Drag to reorder.
        </Text>
      </Row>

      <Column
        fillWidth
        center
        gap="8"
        padding="32"
        radius="l"
        border={dragging ? "brand-medium" : true}
        borderStyle="dashed"
        background={dragging ? "brand-alpha-weak" : "transparent"}
        cursor="interactive"
        role="button"
        tabIndex={0}
        aria-label="Upload files"
        onClick={() => input.current?.click()}
        onKeyDown={(event: React.KeyboardEvent) => {
          if (event.key === "Enter" || event.key === " ") input.current?.click();
        }}
        onDragOver={(event: React.DragEvent) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event: React.DragEvent) => {
          event.preventDefault();
          setDragging(false);
          if (event.dataTransfer.files.length) upload(event.dataTransfer.files);
        }}
      >
        <Icon name="upload" size="l" onBackground="neutral-weak" />
        <Text variant="label-default-m">Drop files here or click to choose</Text>
        <input
          ref={input}
          type="file"
          multiple
          hidden
          accept={acceptedExtensions}
          onChange={(event) => {
            if (event.target.files?.length) upload(event.target.files);
            event.target.value = "";
          }}
        />
      </Column>

      {uploads.map((item) => (
        <Column key={item.key} gap="8" padding="16" radius="m" background="neutral-alpha-weak">
          <Row horizontal="between" gap="16" vertical="center">
            <Text variant="label-default-s">{item.name}</Text>
            {item.error && (
              <IconButton
                icon="close"
                size="s"
                variant="ghost"
                tooltip="Dismiss"
                onClick={() => setUploads((current) => current.filter((u) => u.key !== item.key))}
              />
            )}
          </Row>
          {item.error ? (
            <Text variant="body-default-xs" onBackground="danger-weak">
              {item.error}
            </Text>
          ) : (
            <ProgressBar value={Math.round(item.progress * 100)} />
          )}
        </Column>
      ))}

      {order.length === 0 && uploads.length === 0 ? (
        <Text variant="body-default-s" onBackground="neutral-weak">
          No files yet.
        </Text>
      ) : (
        <Sortable items={order} onReorder={reorder} handle label="Files" gap="8">
          {order.map((id) => {
            const asset = byId.get(id);
            if (!asset) return null;
            const isCover = asset.id === coverAssetId;
            return (
              <SortableItem key={id} id={id} label={asset.filename}>
                <Row
                  fillWidth
                  gap="12"
                  padding="12"
                  radius="m"
                  border
                  background="surface"
                  vertical="center"
                  s={{ direction: "column", vertical: "start" }}
                >
                  <Row gap="12" vertical="center" flex={1} minWidth={0}>
                    <SortableHandle />
                    <Row
                      width="56"
                      height="56"
                      radius="s"
                      overflow="hidden"
                      center
                      background="neutral-alpha-weak"
                    >
                      {asset.thumb ? (
                        <Media src={asset.thumb} alt="" aspectRatio="1 / 1" unoptimized />
                      ) : (
                        <Icon name={kindIcon[asset.kind]} onBackground="neutral-weak" />
                      )}
                    </Row>
                    <Column gap="4" minWidth={0}>
                      <Text variant="label-default-s" truncate>
                        {asset.filename}
                      </Text>
                      <Row gap="8" vertical="center" wrap>
                        <Tag size="s" scheme={statusTag[asset.status].scheme}>
                          {statusTag[asset.status].label}
                        </Tag>
                        {isCover && (
                          <Tag size="s" scheme="brand" prefixIcon="starFill">
                            Cover
                          </Tag>
                        )}
                        <Text variant="body-default-xs" onBackground="neutral-weak">
                          {formatBytes(asset.size)}
                          {asset.width && asset.height ? ` · ${asset.width}×${asset.height}` : ""}
                        </Text>
                      </Row>
                    </Column>
                  </Row>
                  <Row gap="8" vertical="center">
                    <Row width={14}>
                      <Select
                        id={`tier-${asset.id}`}
                        label="Access"
                        size="xxs"
                        value={asset.minTierId ?? SAME_AS_WORK}
                        onSelect={(value) =>
                          startTransition(async () =>
                            report(
                              await setAssetTierAction(
                                asset.id,
                                value === SAME_AS_WORK ? null : (value as string),
                              ),
                            ),
                          )
                        }
                        options={[
                          { value: SAME_AS_WORK, label: "Same as work" },
                          ...tiers.map((tier) => ({ value: tier.id, label: tier.label })),
                        ]}
                      />
                    </Row>
                    <IconButton
                      icon={isCover ? "starFill" : "star"}
                      variant="ghost"
                      size="s"
                      tooltip="Use as cover"
                      disabled={asset.kind !== "image" || isCover || pending}
                      onClick={() =>
                        startTransition(async () => report(await setCoverAction(workId, asset.id)))
                      }
                    />
                    <IconButton
                      icon="trash"
                      variant="ghost"
                      size="s"
                      tooltip="Delete file"
                      onClick={() => setDeleting(asset)}
                    />
                  </Row>
                </Row>
              </SortableItem>
            );
          })}
        </Sortable>
      )}

      <ConfirmDialog
        open={deleting !== null}
        title="Delete file?"
        description={`${deleting?.filename} will be removed from storage.`}
        pending={pending}
        onConfirm={() =>
          startTransition(async () => {
            if (deleting) report(await deleteAssetAction(deleting.id));
            setDeleting(null);
          })
        }
        onClose={() => setDeleting(null)}
      />
    </Column>
  );
}

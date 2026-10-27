"use client";

import { Button, Dialog, Row, Text } from "@once-ui-system/core";

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Delete",
  pending,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  pending?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <Row fillWidth horizontal="end" gap="8">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" loading={pending} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </Row>
      }
    >
      <Text variant="body-default-s" onBackground="neutral-weak">
        {description}
      </Text>
    </Dialog>
  );
}

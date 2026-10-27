import { Card, Column, Media, Row, Tag, Text } from "@once-ui-system/core";
import { BlurredImage } from "./BlurredImage";

export type GalleryCardProps = {
  href: string;
  title: string;
  image: string | null;
  width: number | null;
  height: number | null;
  locked: boolean;
  lockLabel: string | null;
  nsfw: boolean;
  imagesLabel: string | null;
};

export function GalleryCard(props: GalleryCardProps) {
  // Natural proportions for the masonry, kept within reason for very tall or wide art.
  const ratio =
    props.width && props.height ? Math.min(Math.max(props.width / props.height, 0.5), 2) : 0.8;
  const aspectRatio = String(ratio);

  return (
    <Card href={props.href} radius="l" border overflow="hidden" direction="column" fillWidth>
      {props.locked ? (
        <BlurredImage src={props.image} aspectRatio={aspectRatio} />
      ) : props.image ? (
        <Media src={props.image} alt={props.title} unoptimized aspectRatio={aspectRatio} />
      ) : (
        <Column fillWidth background="neutral-alpha-weak" style={{ aspectRatio }} />
      )}
      <Column padding="12" gap="8">
        <Text variant="label-strong-s" truncate>
          {props.title}
        </Text>
        <Row gap="4" wrap vertical="center">
          {props.lockLabel && (
            <Tag
              size="s"
              scheme={props.locked ? "warning" : "brand"}
              prefixIcon={props.locked ? "lock" : "star"}
            >
              {props.lockLabel}
            </Tag>
          )}
          {props.nsfw && (
            <Tag size="s" scheme="danger">
              NSFW
            </Tag>
          )}
          {props.imagesLabel && (
            <Text variant="body-default-xs" onBackground="neutral-weak">
              {props.imagesLabel}
            </Text>
          )}
        </Row>
      </Column>
    </Card>
  );
}

import { Column, Grid, Skeleton } from "@once-ui-system/core";

const placeholders = ["a", "b", "c", "d", "e", "f", "g", "h"];

export default function GalleryLoading() {
  return (
    <Column fillWidth paddingX="16" paddingY="32" horizontal="center">
      <Column maxWidth="l" gap="24">
        <Skeleton shape="line" size="xl" style={{ width: "12rem" }} />
        <Skeleton shape="block" style={{ height: "3.5rem" }} />
        <Grid columns="4" gap="16" m={{ columns: 2 }}>
          {placeholders.map((id, index) => (
            <Skeleton key={id} shape="block" delay={index * 60} style={{ aspectRatio: "4 / 5" }} />
          ))}
        </Grid>
      </Column>
    </Column>
  );
}

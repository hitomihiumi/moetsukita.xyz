import { Column, Icon, Media } from "@once-ui-system/core";

/** A locked preview: the tiny public blur, scaled up and blurred again. */
export function BlurredImage({ src, aspectRatio }: { src: string | null; aspectRatio: string }) {
  return (
    <Column fillWidth overflow="hidden" background="neutral-alpha-medium" style={{ aspectRatio }}>
      {src && (
        <Media
          src={src}
          alt=""
          unoptimized
          aspectRatio={aspectRatio}
          style={{ filter: "blur(24px)", transform: "scale(1.15)" }}
        />
      )}
      <Column position="absolute" top="0" left="0" fill center>
        <Column background="overlay" radius="full" padding="12" border>
          <Icon name="lock" size="m" onBackground="neutral-strong" />
        </Column>
      </Column>
    </Column>
  );
}

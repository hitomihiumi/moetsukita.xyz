"use client";

import { Button, Column, Heading, Icon, Row, SmartLink, Spinner, Text } from "@once-ui-system/core";
import { useRef, useState } from "react";
import { detectLeakAction, startLeakCheckAction } from "@/app/admin/actions";
import { pickLocalized } from "@/lib/localized";
import { dateTime } from "./labels";
import { PageHeader } from "./PageHeader";

type Result = Extract<Awaited<ReturnType<typeof detectLeakAction>>, { ok: true }>["data"];

export function LeakChecker() {
  const input = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<
    | { step: "idle" }
    | { step: "working"; name: string }
    | { step: "done"; result: Result }
    | { step: "error"; message: string }
  >({ step: "idle" });

  const check = async (file: File) => {
    setState({ step: "working", name: file.name });
    const started = await startLeakCheckAction({
      filename: file.name,
      mime: file.type,
      size: file.size,
    });
    if (!started.ok) return setState({ step: "error", message: started.error });
    const put = await fetch(started.data.url, {
      method: "PUT",
      body: file,
      headers: { "Content-Type": file.type },
    });
    if (!put.ok) return setState({ step: "error", message: `Upload failed (${put.status})` });
    const result = await detectLeakAction(started.data.key);
    setState(
      result.ok ? { step: "done", result: result.data } : { step: "error", message: result.error },
    );
  };

  return (
    <Column fillWidth gap="24">
      <PageHeader
        title="Leak check"
        description="Upload an image found elsewhere to read its watermark and see whose download it came from. Crops, recompression and resizing are handled; heavy edits can erase the mark."
        action={
          <Button
            prefixIcon="upload"
            loading={state.step === "working"}
            onClick={() => input.current?.click()}
          >
            Check an image
          </Button>
        }
      />
      <input
        ref={input}
        type="file"
        accept="image/*"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) check(file);
          event.target.value = "";
        }}
      />

      {state.step === "working" && (
        <Row gap="12" vertical="center" background="surface" border radius="l" padding="24">
          <Spinner />
          <Text variant="body-default-s">Reading {state.name}… this can take a minute.</Text>
        </Row>
      )}

      {state.step === "error" && (
        <Text variant="body-default-s" onBackground="danger-weak">
          {state.message}
        </Text>
      )}

      {state.step === "done" &&
        (state.result.found ? (
          <Column background="surface" border radius="l" padding="24" gap="12">
            <Row gap="8" vertical="center">
              <Icon name="danger" onBackground="danger-weak" />
              <Heading as="h2" variant="heading-strong-m">
                Watermark found
              </Heading>
            </Row>
            <Text variant="body-default-m">
              {state.result.kind === "preview" ? "Preview shown to" : "Downloaded by"}{" "}
              <strong>{state.result.user?.name ?? "a deleted user"}</strong>
              {state.result.downloadedAt &&
                ` on ${dateTime.format(new Date(state.result.downloadedAt))}`}
              {state.result.file && (
                <>
                  {" "}
                  — {state.result.file.filename} from{" "}
                  <SmartLink href={`/admin/works/${state.result.file.workId}`}>
                    {pickLocalized(state.result.file.workTitle, "en")}
                  </SmartLink>
                </>
              )}
              .
            </Text>
            <Row gap="8">
              {state.result.user && (
                <Button size="s" variant="secondary" href="/admin/users" prefixIcon="person">
                  Open users
                </Button>
              )}
            </Row>
            <Text variant="code-default-xs" onBackground="neutral-weak">
              watermark {state.result.watermark}
            </Text>
          </Column>
        ) : (
          <Column background="surface" border radius="l" padding="24" gap="8">
            <Heading as="h2" variant="heading-strong-m">
              No watermark found
            </Heading>
            <Text variant="body-default-s" onBackground="neutral-weak">
              The image was not downloaded from the site, or it was edited too heavily (strong
              downscaling, filters, redrawing) for the mark to survive.
            </Text>
          </Column>
        ))}
    </Column>
  );
}

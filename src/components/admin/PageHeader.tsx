import { Column, Heading, Row, Text } from "@once-ui-system/core";

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <Row
      fillWidth
      horizontal="between"
      vertical="end"
      gap="16"
      s={{ direction: "column", horizontal: "start" }}
    >
      <Column gap="8">
        <Heading as="h1" variant="display-strong-xs">
          {title}
        </Heading>
        {description && (
          <Text variant="body-default-s" onBackground="neutral-weak">
            {description}
          </Text>
        )}
      </Column>
      {action}
    </Row>
  );
}

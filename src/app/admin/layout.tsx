import "@once-ui-system/core/css/styles.css";
import "@once-ui-system/core/css/tokens.css";
import "@/resources/custom.css";

import { Column, Row, ThemeInit } from "@once-ui-system/core";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Providers } from "@/components";
import { AdminShell } from "@/components/admin";
import { fonts } from "@/resources/fonts";
import { dataStyle, style } from "@/resources/once-ui.config";
import { signOutAction } from "@/server/auth/actions";
import { getViewer, hasRole } from "@/server/auth/viewer";

export const metadata: Metadata = {
  title: { default: "Admin", template: "%s · Admin" },
  robots: { index: false, follow: false },
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/login?callbackUrl=/admin");
  // Not a 403: the panel's existence is nobody else's business.
  if (!hasRole(viewer, "editor")) notFound();

  return (
    <Row
      as="html"
      lang="en"
      suppressHydrationWarning
      fillWidth
      className={Object.values(fonts)
        .map((font) => font.variable)
        .join(" ")}
    >
      <head>
        <ThemeInit config={style} dataStyle={dataStyle} />
      </head>
      <Providers>
        <Column as="body" background="page" fillWidth margin="0" padding="0" minHeight="100vh">
          <AdminShell
            user={{ name: viewer.name ?? "Admin", image: viewer.image, role: viewer.role }}
            isAdmin={hasRole(viewer, "admin")}
            signOut={signOutAction}
          >
            {children}
          </AdminShell>
        </Column>
      </Providers>
    </Row>
  );
}

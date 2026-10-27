"use client";

import {
  Button,
  Column,
  Drawer,
  IconButton,
  Nav,
  NavItem,
  Option,
  Row,
  selectNavHref,
  Text,
  ThemeSwitcher,
  UserMenu,
} from "@once-ui-system/core";
import { usePathname } from "next/navigation";
import { useRef, useState } from "react";
import { type AdminNavLink, adminNav } from "./nav";

type AdminShellProps = {
  children: React.ReactNode;
  user: { name: string; image: string | null; role: string };
  isAdmin: boolean;
  signOut: (formData: FormData) => Promise<void>;
};

/** Top bar, sidebar and a scrolling content panel; below `s` the nav moves into a drawer. */
export function AdminShell({ children, user, isAdmin, signOut }: AdminShellProps) {
  const pathname = usePathname() ?? "";
  const links: AdminNavLink[] = adminNav.filter((link) => isAdmin || !link.adminOnly);
  const current = selectNavHref(
    pathname,
    links.map((link) => link.href),
  );
  const [menuPath, setMenuPath] = useState<string | null>(null);
  const form = useRef<HTMLFormElement>(null);

  const sideNav = (
    <Nav fill paddingX="8" density="compact" aria-label="Admin">
      {links.map((link) => (
        <NavItem
          key={link.href}
          href={link.href}
          icon={link.icon}
          label={link.label}
          selected={link.href === current}
        />
      ))}
    </Nav>
  );

  const avatar = {
    src: user.image ?? undefined,
    value: user.image ? undefined : user.name.slice(0, 1),
  };
  const account = (
    <Column padding="4" gap="2" minWidth={12}>
      <Option value="site" label="View site" href="/" />
      <Option value="account" label="Account" href="/account" />
      <Option
        value="sign-out"
        label="Sign out"
        danger
        onClick={() => form.current?.requestSubmit()}
      />
    </Column>
  );

  return (
    <Column fill flex={1}>
      <Row as="header" height="56" fillWidth vertical="center" paddingX="16" gap="12">
        <Row hide s={{ hide: false }}>
          <IconButton
            icon="menu"
            variant="tertiary"
            tooltip="Menu"
            aria-expanded={menuPath === pathname}
            onClick={() => setMenuPath(pathname)}
          />
        </Row>
        <Row minWidth={16} s={{ minWidth: 0 }} gap="8" vertical="center">
          <Text variant="heading-strong-s">Moetsukita</Text>
          <Text variant="label-default-s" onBackground="neutral-weak">
            Admin
          </Text>
        </Row>
        <Row flex={1} />
        <Row s={{ hide: true }}>
          <Button size="s" variant="tertiary" href="/" prefixIcon="arrowUpRight">
            Site
          </Button>
        </Row>
        <ThemeSwitcher collapsed direction="column" />
        <Row s={{ hide: true }}>
          <UserMenu
            name={user.name}
            subline={user.role}
            placement="bottom-end"
            avatarProps={avatar}
            dropdown={account}
          />
        </Row>
        <Row hide s={{ hide: false }}>
          <UserMenu placement="bottom-end" avatarProps={avatar} dropdown={account} />
        </Row>
        <form ref={form} action={signOut} hidden>
          <input type="hidden" name="callbackUrl" value="/" />
        </form>
      </Row>

      <Row fill paddingX="8">
        <Column s={{ hide: true }} maxWidth={16} fitHeight position="sticky" top="56">
          {sideNav}
        </Column>
        <Row fill horizontal="center" topRadius="l" overflow="hidden">
          <Row
            as="main"
            height="below-header"
            overflowY="auto"
            topRadius="l"
            horizontal="center"
            fillWidth
            background="surface"
            border
          >
            <Column maxWidth="xl" paddingX="24" paddingY="32" fitHeight>
              {children}
            </Column>
          </Row>
        </Row>
      </Row>

      <Drawer
        open={menuPath === pathname}
        onClose={() => setMenuPath(null)}
        side="left"
        size="s"
        title="Menu"
        flush
      >
        <Column paddingTop="64" paddingBottom="16">
          {sideNav}
        </Column>
      </Drawer>
    </Column>
  );
}

import "server-only";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { and, eq } from "drizzle-orm";
import NextAuth, { type NextAuthConfig } from "next-auth";
import Discord from "next-auth/providers/discord";
import Patreon from "next-auth/providers/patreon";
import { identityUrl } from "../access/patreon";
import { syncUser } from "../access/sync";
import { getDb } from "../db";
import { accounts, sessions, users, verificationTokens } from "../db/schema";
import { authEnv } from "../env";

export type Role = (typeof users.$inferSelect)["role"];

declare module "next-auth" {
  interface Session {
    user: { id: string; role: Role; name?: string | null; image?: string | null };
  }
  interface User {
    role?: Role;
    bannedAt?: Date | null;
  }
}

type PatreonIdentity = {
  data: { id: string; attributes: { full_name?: string; image_url?: string } };
};

function providers() {
  const env = authEnv();
  const list: NextAuthConfig["providers"] = [];
  if (env.AUTH_DISCORD_ID && env.AUTH_DISCORD_SECRET) {
    list.push(
      Discord({
        clientId: env.AUTH_DISCORD_ID,
        clientSecret: env.AUTH_DISCORD_SECRET,
        // Only the id, name and avatar: no email, no guild list.
        authorization: { params: { scope: "identify" } },
      }),
    );
  }
  if (env.AUTH_PATREON_ID && env.AUTH_PATREON_SECRET) {
    list.push(
      Patreon({
        clientId: env.AUTH_PATREON_ID,
        clientSecret: env.AUTH_PATREON_SECRET,
        // API v2 with memberships, instead of the provider's default v1 profile with email.
        authorization: { params: { scope: "identity identity.memberships" } },
        userinfo: identityUrl,
        profile(profile) {
          // The provider types the v1 profile; with `userinfo` above it is a v2 document.
          const { data } = profile as unknown as PatreonIdentity;
          return {
            id: data.id,
            name: data.attributes.full_name ?? null,
            image: data.attributes.image_url ?? null,
            email: null,
          };
        },
      }),
    );
  }
  return list;
}

/** The sign-in providers that are configured, for the login page. */
export function availableProviders() {
  return providers().map((provider) => {
    const config = typeof provider === "function" ? provider() : provider;
    return config.id as "discord" | "patreon";
  });
}

async function afterSignIn(
  userId: string,
  account: { provider: string; providerAccountId: string },
) {
  const db = getDb();
  if (
    account.provider === "discord" &&
    authEnv().OWNER_DISCORD_IDS.includes(account.providerAccountId)
  ) {
    await db.update(users).set({ role: "admin" }).where(eq(users.id, userId));
  }
  try {
    await syncUser(userId);
  } catch (error) {
    // Signing in must not fail because a provider API is down.
    console.error("[auth] sync after sign-in failed", error);
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth(() => {
  const db = getDb();
  return {
    adapter: DrizzleAdapter(db, {
      usersTable: users,
      accountsTable: accounts,
      sessionsTable: sessions,
      verificationTokensTable: verificationTokens,
    }),
    // Sessions live in the database, so a ban or sign-out everywhere takes effect at once.
    session: { strategy: "database", maxAge: 30 * 24 * 60 * 60, updateAge: 24 * 60 * 60 },
    providers: providers(),
    pages: { signIn: "/login", error: "/login" },
    callbacks: {
      signIn({ user }) {
        return !user.bannedAt;
      },
      session({ session, user }) {
        session.user.id = user.id;
        session.user.role = user.role ?? "user";
        return session;
      },
    },
    events: {
      async signIn({ user, account }) {
        if (!user.id || !account) return;
        // Auth.js keeps the tokens from the first sign-in; store the fresh ones.
        if (account.provider === "patreon") {
          await db
            .update(accounts)
            .set({
              access_token: account.access_token,
              refresh_token: account.refresh_token,
              expires_at: account.expires_at,
            })
            .where(
              and(
                eq(accounts.provider, "patreon"),
                eq(accounts.providerAccountId, account.providerAccountId),
              ),
            );
        }
        await afterSignIn(user.id, account);
      },
      async linkAccount({ user, account }) {
        if (user.id) await afterSignIn(user.id, account);
      },
    },
  } satisfies NextAuthConfig;
});

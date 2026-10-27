import "server-only";

const API = "https://discord.com/api/v10";

export class DiscordUnavailableError extends Error {}

/**
 * The member's role ids on our server, or null when they are not on it.
 * Uses the bot token, so no user token has to be stored or refreshed.
 * Throws DiscordUnavailableError on errors that say nothing about the member
 * (outage, bad bot token), so callers keep what they had instead of revoking.
 */
export async function fetchMemberRoles(params: {
  guildId: string;
  userId: string;
  botToken: string;
}): Promise<string[] | null> {
  const url = `${API}/guilds/${params.guildId}/members/${params.userId}`;

  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await fetch(url, {
      headers: { Authorization: `Bot ${params.botToken}`, "User-Agent": "moetsukita.xyz" },
      cache: "no-store",
    });

    if (response.ok) {
      const member = (await response.json()) as { roles?: string[] };
      return member.roles ?? [];
    }
    if (response.status === 404) {
      // 10007 Unknown Member: not on the server. Any other 404 (a wrong guild
      // id, 10004) must not read as "everyone left".
      const body = (await response.json().catch(() => ({}))) as { code?: number };
      if (body.code === 10007) return null;
      throw new DiscordUnavailableError(`Discord API 404 (code ${body.code ?? "none"})`);
    }
    if (response.status === 429) {
      const body = (await response.json().catch(() => ({}))) as { retry_after?: number };
      await new Promise((resolve) =>
        setTimeout(resolve, Math.ceil((body.retry_after ?? 1) * 1000)),
      );
      continue;
    }
    throw new DiscordUnavailableError(`Discord API ${response.status} for guild member`);
  }
  throw new DiscordUnavailableError("Discord API rate limit");
}

/** The server's roles, for mapping them to tiers in the admin panel. */
export async function fetchGuildRoles(params: { guildId: string; botToken: string }) {
  const response = await fetch(`${API}/guilds/${params.guildId}/roles`, {
    headers: { Authorization: `Bot ${params.botToken}`, "User-Agent": "moetsukita.xyz" },
    cache: "no-store",
  });
  if (!response.ok) throw new DiscordUnavailableError(`Discord API ${response.status} for roles`);
  const roles = (await response.json()) as {
    id: string;
    name: string;
    position: number;
    managed: boolean;
  }[];
  return roles
    .filter((role) => role.name !== "@everyone")
    .sort((a, b) => b.position - a.position)
    .map((role) => ({ id: role.id, name: role.name }));
}

import { afterEach, describe, expect, it, vi } from "vitest";
import { DiscordUnavailableError, fetchMemberRoles } from "./discord";

const params = { guildId: "g", userId: "u", botToken: "token" };
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

afterEach(() => vi.unstubAllGlobals());

describe("fetchMemberRoles", () => {
  it("returns the member's roles, authenticated as the bot", async () => {
    const fetch = vi.fn().mockResolvedValue(json(200, { roles: ["r1", "r2"] }));
    vi.stubGlobal("fetch", fetch);
    await expect(fetchMemberRoles(params)).resolves.toEqual(["r1", "r2"]);
    expect(fetch.mock.calls[0][0]).toBe("https://discord.com/api/v10/guilds/g/members/u");
    expect(fetch.mock.calls[0][1].headers.Authorization).toBe("Bot token");
  });

  it("returns null when the user is not on the server", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(404, { code: 10007 })));
    await expect(fetchMemberRoles(params)).resolves.toBeNull();
  });

  it("does not mistake a wrong guild for a missing member", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(404, { code: 10004 })));
    await expect(fetchMemberRoles(params)).rejects.toBeInstanceOf(DiscordUnavailableError);
  });

  it("waits out a rate limit and retries", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(json(429, { retry_after: 0.01 }))
      .mockResolvedValueOnce(json(200, { roles: ["r1"] }));
    vi.stubGlobal("fetch", fetch);
    await expect(fetchMemberRoles(params)).resolves.toEqual(["r1"]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("reports outages instead of returning an empty role list", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(503, {})));
    await expect(fetchMemberRoles(params)).rejects.toBeInstanceOf(DiscordUnavailableError);
  });
});

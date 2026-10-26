import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

// Patreon speaks JSON:API: resources reference each other by { type, id } and
// the referenced ones arrive in `included`.
type Ref = { id: string; type: string };
type Resource = {
  id: string;
  type: string;
  attributes?: Record<string, unknown>;
  relationships?: Record<string, { data?: Ref | Ref[] | null }>;
};
export type PatreonDocument = {
  data: Resource | Resource[];
  included?: Resource[];
  links?: { next?: string };
  meta?: { pagination?: { cursors?: { next?: string | null } } };
};

/** What a member's pledge entitles them to on our side. */
export type PatreonMembership = {
  patreonUserId: string;
  /** Only an active patron gets anything; declined, former and free members do not. */
  active: boolean;
  tierIds: string[];
};

const API = "https://www.patreon.com/api/oauth2/v2";

const refs = (value: Ref | Ref[] | null | undefined): Ref[] =>
  value ? (Array.isArray(value) ? value : [value]) : [];

function membershipOf(member: Resource, patreonUserId: string): PatreonMembership {
  const active = member.attributes?.patron_status === "active_patron";
  return {
    patreonUserId,
    active,
    tierIds: active
      ? refs(member.relationships?.currently_entitled_tiers?.data).map((t) => t.id)
      : [],
  };
}

/** The member's pledge to our campaign in a `/identity` response, if any. */
export function membershipFromIdentity(
  doc: PatreonDocument,
  campaignId: string,
): PatreonMembership {
  const user = Array.isArray(doc.data) ? doc.data[0] : doc.data;
  const member = (doc.included ?? []).find(
    (resource) =>
      resource.type === "member" &&
      refs(resource.relationships?.campaign?.data).some((campaign) => campaign.id === campaignId),
  );
  if (!member) return { patreonUserId: user.id, active: false, tierIds: [] };
  return membershipOf(member, user.id);
}

/** Memberships in one page of `/campaigns/{id}/members`, keyed by Patreon user id. */
export function membershipsFromMembersPage(doc: PatreonDocument): PatreonMembership[] {
  const members = Array.isArray(doc.data) ? doc.data : [doc.data];
  return members.flatMap((member) => {
    const [user] = refs(member.relationships?.user?.data);
    return user ? [membershipOf(member, user.id)] : [];
  });
}

/** The member a `members:*` / `members:pledge:*` webhook is about. */
export function membershipFromWebhook(doc: PatreonDocument, campaignId: string) {
  const member = Array.isArray(doc.data) ? doc.data[0] : doc.data;
  if (member?.type !== "member") return null;
  const [campaign] = refs(member.relationships?.campaign?.data);
  if (campaign && campaign.id !== campaignId) return null;
  const [user] = refs(member.relationships?.user?.data);
  return user ? membershipOf(member, user.id) : null;
}

/** Patreon signs webhook bodies with HMAC-MD5 of the webhook secret, hex-encoded. */
export function verifyWebhookSignature(body: string, signature: string | null, secret: string) {
  if (!signature) return false;
  const expected = createHmac("md5", secret).update(body).digest();
  const given = Buffer.from(signature, "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export class PatreonAuthError extends Error {}

async function get(url: string, accessToken: string): Promise<PatreonDocument> {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}`, "User-Agent": "moetsukita.xyz" },
    cache: "no-store",
  });
  if (response.status === 401) throw new PatreonAuthError("Patreon token rejected");
  if (!response.ok) throw new Error(`Patreon API ${response.status}: ${url}`);
  return response.json();
}

/** The signed-in user with their memberships; also the sign-in `userinfo` request. */
export const identityUrl = `${API}/identity?${new URLSearchParams({
  include: "memberships.campaign,memberships.currently_entitled_tiers",
  "fields[user]": "full_name,image_url",
  "fields[member]": "patron_status",
})}`;

export function fetchIdentity(accessToken: string) {
  return get(identityUrl, accessToken);
}

/** Every member of the campaign, through the creator's token. */
export async function fetchCampaignMemberships(campaignId: string, creatorToken: string) {
  const memberships: PatreonMembership[] = [];
  let url: string | undefined = `${API}/campaigns/${campaignId}/members?${new URLSearchParams({
    include: "user,currently_entitled_tiers",
    "fields[member]": "patron_status",
    "page[count]": "500",
  })}`;
  while (url) {
    const page = await get(url, creatorToken);
    memberships.push(...membershipsFromMembersPage(page));
    url = page.links?.next;
  }
  return memberships;
}

/** Tiers of the campaign, for picking mappings in the admin panel. */
export async function fetchCampaignTiers(campaignId: string, creatorToken: string) {
  const doc = await get(
    `${API}/campaigns/${campaignId}?${new URLSearchParams({
      include: "tiers",
      "fields[tier]": "title,amount_cents,published",
    })}`,
    creatorToken,
  );
  return (doc.included ?? [])
    .filter((resource) => resource.type === "tier")
    .map((tier) => ({
      id: tier.id,
      title: String(tier.attributes?.title ?? tier.id),
      amountCents: Number(tier.attributes?.amount_cents ?? 0),
    }));
}

export async function refreshAccessToken(params: {
  refreshToken: string;
  clientId: string;
  clientSecret: string;
}) {
  const response = await fetch("https://www.patreon.com/api/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: params.refreshToken,
      client_id: params.clientId,
      client_secret: params.clientSecret,
    }),
    cache: "no-store",
  });
  if (response.status === 400 || response.status === 401) {
    throw new PatreonAuthError("Patreon refresh token rejected");
  }
  if (!response.ok) throw new Error(`Patreon token refresh ${response.status}`);
  const tokens = (await response.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };
  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: Math.floor(Date.now() / 1000) + tokens.expires_in,
  };
}

import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  membershipFromIdentity,
  membershipFromWebhook,
  membershipsFromMembersPage,
  verifyWebhookSignature,
} from "./patreon";

const CAMPAIGN = "111";

const member = (id: string, status: string | null, tiers: string[], campaign = CAMPAIGN) => ({
  id,
  type: "member",
  attributes: { patron_status: status },
  relationships: {
    campaign: { data: { id: campaign, type: "campaign" } },
    currently_entitled_tiers: { data: tiers.map((tier) => ({ id: tier, type: "tier" })) },
    user: { data: { id: `user-of-${id}`, type: "user" } },
  },
});

describe("membershipFromIdentity", () => {
  const identity = (...members: ReturnType<typeof member>[]) => ({
    data: { id: "42", type: "user" },
    included: members,
  });

  it("returns the tiers of an active pledge to our campaign", () => {
    expect(
      membershipFromIdentity(identity(member("m1", "active_patron", ["t1", "t2"])), CAMPAIGN),
    ).toEqual({ patreonUserId: "42", active: true, tierIds: ["t1", "t2"] });
  });

  it("ignores pledges to other campaigns", () => {
    const doc = identity(member("m1", "active_patron", ["t9"], "999"));
    expect(membershipFromIdentity(doc, CAMPAIGN)).toEqual({
      patreonUserId: "42",
      active: false,
      tierIds: [],
    });
  });

  it.each(["declined_patron", "former_patron", null])("grants nothing for %s", (status) => {
    const doc = identity(member("m1", status, ["t1"]));
    expect(membershipFromIdentity(doc, CAMPAIGN).tierIds).toEqual([]);
  });

  it("handles a user with no memberships at all", () => {
    expect(membershipFromIdentity({ data: { id: "42", type: "user" } }, CAMPAIGN).active).toBe(
      false,
    );
  });
});

describe("membershipsFromMembersPage", () => {
  it("keys every member by its Patreon user", () => {
    const page = {
      data: [member("a", "active_patron", ["t1"]), member("b", "former_patron", ["t1"])],
    };
    expect(membershipsFromMembersPage(page)).toEqual([
      { patreonUserId: "user-of-a", active: true, tierIds: ["t1"] },
      { patreonUserId: "user-of-b", active: false, tierIds: [] },
    ]);
  });
});

describe("membershipFromWebhook", () => {
  it("reads the member the event is about", () => {
    expect(membershipFromWebhook({ data: member("a", "active_patron", ["t2"]) }, CAMPAIGN)).toEqual(
      {
        patreonUserId: "user-of-a",
        active: true,
        tierIds: ["t2"],
      },
    );
  });

  it("ignores other campaigns and other resource types", () => {
    expect(
      membershipFromWebhook({ data: member("a", "active_patron", [], "999") }, CAMPAIGN),
    ).toBeNull();
    expect(membershipFromWebhook({ data: { id: "1", type: "post" } }, CAMPAIGN)).toBeNull();
  });
});

describe("verifyWebhookSignature", () => {
  const body = JSON.stringify({ data: { id: "1" } });
  const sign = (secret: string) => createHmac("md5", secret).update(body).digest("hex");

  it("accepts the HMAC-MD5 of the body", () => {
    expect(verifyWebhookSignature(body, sign("s3cret"), "s3cret")).toBe(true);
  });

  it("rejects a wrong secret, a tampered body and a missing or malformed header", () => {
    expect(verifyWebhookSignature(body, sign("other"), "s3cret")).toBe(false);
    expect(verifyWebhookSignature(`${body} `, sign("s3cret"), "s3cret")).toBe(false);
    expect(verifyWebhookSignature(body, null, "s3cret")).toBe(false);
    expect(verifyWebhookSignature(body, "not-hex", "s3cret")).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { dbTierFromStripePriceId, dbTierFromSubscriptionStatus } from "@/lib/billing/stripe-tier";

describe("stripe-tier", () => {
  it("maps known price ids when env is set", () => {
    const proId = "price_test_pro";
    process.env.STRIPE_PRICE_PRO_MONTHLY = proId;
    expect(dbTierFromStripePriceId(proId)).toBe("pro");
    delete process.env.STRIPE_PRICE_PRO_MONTHLY;
  });

  it("returns free for unknown price on active subscription", () => {
    expect(dbTierFromSubscriptionStatus("active", "price_unknown_xyz")).toBe("free");
  });

  it("returns free when subscription canceled", () => {
    expect(dbTierFromSubscriptionStatus("canceled", "price_any")).toBe("free");
  });
});

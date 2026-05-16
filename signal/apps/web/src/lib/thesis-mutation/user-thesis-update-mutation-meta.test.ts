import { describe, expect, it } from "vitest";
import { userThesisUpdateMutationMeta } from "@/lib/thesis-mutation/user-thesis-update-mutation-meta";

describe("userThesisUpdateMutationMeta", () => {
  it("includes reason when updateReason is non-null", () => {
    expect(userThesisUpdateMutationMeta("user-1", "New CPI data weakens timing")).toEqual({
      actorType: "user",
      actorId: "user-1",
      reason: "New CPI data weakens timing",
    });
  });

  it("omits reason when updateReason is null (service default applies)", () => {
    expect(userThesisUpdateMutationMeta("user-1", null)).toEqual({
      actorType: "user",
      actorId: "user-1",
    });
  });
});

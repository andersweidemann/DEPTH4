import { describe, expect, it } from "vitest";

/** Mirrors CreateThesisModal expand gate — API draft usable even when meta.passes is false. */
function expandDraftIsUsable(d: Record<string, unknown> | undefined | null): boolean {
  if (!d || typeof d !== "object") return false;
  return (
    String(d.title ?? "").trim().length >= 4 && String(d.thesis_statement ?? "").trim().length >= 20
  );
}

describe("CreateThesisModal expand draft gate", () => {
  it("accepts a substantive draft when ok is false (anatomy warnings only)", () => {
    const draft = {
      title: "BTC rerates on US clarity",
      thesis_statement:
        "If the Clarity Act passes with workable custody rules, BTC can rerate as regulated pipes absorb flows the market still prices as years away.",
    };
    expect(expandDraftIsUsable(draft)).toBe(true);
  });

  it("rejects empty or title-only payloads", () => {
    expect(expandDraftIsUsable({ title: "Hi" })).toBe(false);
    expect(expandDraftIsUsable(null)).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { checkAutoResolutionFromPrice, parsePriceLevel } from "@/lib/thesis/auto-resolution-price";

describe("auto-resolution-price", () => {
  it("parses dollar strings", () => {
    expect(parsePriceLevel("$2,480")).toBe(2480);
  });

  it("detects clean win on short when price hits target2", () => {
    const outcome = checkAutoResolutionFromPrice(
      { direction: "down" },
      { target2: "70", stop: "85" },
      68,
    );
    expect(outcome).toBe("won_clean");
  });
});

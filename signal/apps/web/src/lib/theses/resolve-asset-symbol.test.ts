import { describe, expect, it } from "vitest";
import { resolveAssetSymbol, tickerFromTitle } from "@/lib/theses/resolve-asset-symbol";

describe("resolveAssetSymbol", () => {
  it("extracts RTX from title when asset label is placeholder", () => {
    expect(
      resolveAssetSymbol({
        assetLabel: "—",
        title: "RTX reprices higher on defense budget tailwind",
      }),
    ).toBe("RTX");
  });

  it("prefers body target_asset over title", () => {
    expect(
      resolveAssetSymbol({
        title: "RTX reprices higher",
        body: { target_asset: "CL.1" },
      }),
    ).toBe("CL.1");
  });

  it("returns em dash when nothing resolves", () => {
    expect(resolveAssetSymbol({ title: "Macro risk builds slowly" })).toBe("—");
  });
});

describe("tickerFromTitle", () => {
  it("skips common English words", () => {
    expect(tickerFromTitle("THE market and oil")).toBeNull();
  });
});

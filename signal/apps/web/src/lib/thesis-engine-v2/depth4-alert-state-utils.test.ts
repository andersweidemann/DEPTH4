import { describe, expect, it } from "vitest";
import {
  applyDepth4AlertStateMapToAlerts,
  mergeDepth4AlertStateRecords,
  parseDepth4AlertStateApiEntries,
} from "@/lib/thesis-engine-v2/depth4-alert-state-utils";

describe("parseDepth4AlertStateApiEntries", () => {
  it("maps GET response entries", () => {
    const m = parseDepth4AlertStateApiEntries([
      { alert_key: "evidence:1", state: "read" },
      { alert_key: "evidence:2", state: "dismissed" },
      { bad: true },
    ]);
    expect(m["evidence:1"]).toBe("read");
    expect(m["evidence:2"]).toBe("dismissed");
  });
});

describe("mergeDepth4AlertStateRecords", () => {
  it("incoming overwrites same keys", () => {
    const m = mergeDepth4AlertStateRecords({ a: "read" }, { a: "dismissed", b: "read" });
    expect(m.a).toBe("dismissed");
    expect(m.b).toBe("read");
  });
});

describe("applyDepth4AlertStateMapToAlerts", () => {
  it("drops dismissed and forces read", () => {
    const cur = [
      { id: "evidence:1", read: false, x: 1 },
      { id: "evidence:2", read: false, x: 2 },
    ];
    const out = applyDepth4AlertStateMapToAlerts(cur, {
      "evidence:1": "dismissed",
      "evidence:2": "read",
    });
    expect(out.map((a) => a.id)).toEqual(["evidence:2"]);
    expect(out[0]!.read).toBe(true);
  });

  it("leaves unknown keys unchanged", () => {
    const cur = [{ id: "evidence:9", read: false, x: 1 }];
    const out = applyDepth4AlertStateMapToAlerts(cur, {});
    expect(out).toEqual(cur);
  });
});

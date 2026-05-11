import { describe, expect, it } from "vitest";
import { parseAlertStatePatchBody } from "@/app/api/user/alert-state/route";

describe("parseAlertStatePatchBody", () => {
  it("accepts valid batch", () => {
    const p = parseAlertStatePatchBody({
      entries: [
        { alert_key: "evidence:550e8400-e29b-41d4-a716-446655440000", state: "read" },
        { alert_key: "manual-outcome:tid:2026-01-01T00:00:00.000Z", state: "dismissed" },
      ],
    });
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect(p.entries).toHaveLength(2);
  });

  it("rejects bad keys", () => {
    const p = parseAlertStatePatchBody({ entries: [{ alert_key: "bad key spaces", state: "read" }] });
    expect(p.ok).toBe(false);
  });

  it("rejects invalid state", () => {
    const p = parseAlertStatePatchBody({ entries: [{ alert_key: "evidence:x", state: "gone" }] });
    expect(p.ok).toBe(false);
  });

  it("rejects too many entries", () => {
    const entries = Array.from({ length: 81 }, (_, i) => ({ alert_key: `evidence:${i}`, state: "read" as const }));
    const p = parseAlertStatePatchBody({ entries });
    expect(p.ok).toBe(false);
  });
});

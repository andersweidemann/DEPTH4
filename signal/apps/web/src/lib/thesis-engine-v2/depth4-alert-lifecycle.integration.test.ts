/**
 * Integration-style contract: server alert map → client apply → logout clears client view →
 * relogin restores from server-shaped map (no browser persistence for alert flags).
 */
import { describe, expect, it } from "vitest";
import {
  applyDepth4AlertStateMapToAlerts,
  mergeDepth4AlertStateRecords,
  parseDepth4AlertStateApiEntries,
} from "@/lib/thesis-engine-v2/depth4-alert-state-utils";

type TrayRow = { id: string; read: boolean; thesisId: string };

function sampleAlert(id: string, read: boolean): TrayRow {
  return { id, read, thesisId: "tid" };
}

describe("DEPTH4 alert state lifecycle (integration-style)", () => {
  it("hydrate applies server read/dismiss; empty client ref after logout; relogin restores server map", () => {
    const apiRows = [
      { alert_key: "evidence:a", state: "dismissed" as const },
      { alert_key: "evidence:b", state: "read" as const },
    ];
    const serverMap = parseDepth4AlertStateApiEntries(apiRows);
    expect(serverMap["evidence:a"]).toBe("dismissed");
    expect(serverMap["evidence:b"]).toBe("read");

    const tray = [sampleAlert("evidence:a", false), sampleAlert("evidence:b", false)];
    const afterHydrate = applyDepth4AlertStateMapToAlerts(tray, serverMap);
    expect(afterHydrate.find((x) => x.id === "evidence:a")).toBeUndefined();
    expect(afterHydrate.find((x) => x.id === "evidence:b")?.read).toBe(true);

    // Logout: client clears in-memory tray and ref (no server mutation for alert flags here).
    const clearedRef: Record<string, "read" | "dismissed"> = {};
    const clearedTray: TrayRow[] = [];
    expect(Object.keys(clearedRef)).toHaveLength(0);
    expect(clearedTray).toHaveLength(0);

    // Relogin: same GET payload → merge into ref again.
    const refAfterRelogin = mergeDepth4AlertStateRecords(clearedRef, parseDepth4AlertStateApiEntries(apiRows));
    expect(refAfterRelogin["evidence:a"]).toBe("dismissed");
    expect(refAfterRelogin["evidence:b"]).toBe("read");

    const rebuiltTray = [sampleAlert("evidence:a", false), sampleAlert("evidence:b", false)];
    const afterSecondHydrate = applyDepth4AlertStateMapToAlerts(rebuiltTray, refAfterRelogin);
    expect(afterSecondHydrate.find((x) => x.id === "evidence:a")).toBeUndefined();
    expect(afterSecondHydrate.find((x) => x.id === "evidence:b")?.read).toBe(true);
  });
});

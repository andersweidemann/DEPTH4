import { describe, expect, it } from "vitest";
import { mergeBellNotificationsIntoAlerts } from "@/lib/thesis-engine-v2/fetch-bell-notifications";
import type { ThesisAlertEntry } from "@/lib/thesis-engine-v2/thesis-live-context";

function alert(id: string, read: boolean): ThesisAlertEntry {
  return {
    id,
    thesisId: "t1",
    thesisTitle: "T",
    type: "probability_change",
    confirmText: "x",
    consequenceText: "y",
    impact: "neutral",
    read,
    createdAt: 1000,
  };
}

describe("mergeBellNotificationsIntoAlerts", () => {
  it("keeps read state from current tray when bell refetch is unread", () => {
    const merged = mergeBellNotificationsIntoAlerts([alert("remodel:n1", true)], [alert("remodel:n1", false)]);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.read).toBe(true);
  });
});

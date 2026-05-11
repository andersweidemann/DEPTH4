import { describe, expect, it } from "vitest";
import {
  buildThesisAlertFromEvidenceRow,
  evidenceLogRowStableAlertId,
  manualOutcomeStableAlertId,
} from "@/lib/thesis-engine-v2/thesis-alert-from-evidence";

describe("evidenceLogRowStableAlertId", () => {
  it("prefixes thesis_evidence_log id", () => {
    expect(evidenceLogRowStableAlertId("abc-123")).toBe("evidence:abc-123");
  });
});

describe("manualOutcomeStableAlertId", () => {
  it("embeds thesis id and outcome timestamp", () => {
    expect(manualOutcomeStableAlertId("tid", "2026-01-02T00:00:00.000Z")).toBe(
      "manual-outcome:tid:2026-01-02T00:00:00.000Z",
    );
  });
});

describe("buildThesisAlertFromEvidenceRow", () => {
  const baseRow = {
    id: "log-1",
    createdAt: 1_700_000_000_000,
    thesisId: "gold-thesis",
    eventType: "insider_flow",
    description: "Tape spike",
    probabilityBefore: null,
    probabilityAfter: null,
    metadata: {},
  };

  it("returns null when thesis is not followed", () => {
    const a = buildThesisAlertFromEvidenceRow(baseRow, {
      starred: new Set(),
      openIds: new Set(),
      userPollIds: new Set(),
      prefs: { "gold-thesis": "major" },
      titleForThesisId: () => "Gold",
    });
    expect(a).toBeNull();
  });

  it("builds insider_flow system alert when starred", () => {
    const a = buildThesisAlertFromEvidenceRow(baseRow, {
      starred: new Set(["gold-thesis"]),
      openIds: new Set(),
      userPollIds: new Set(),
      prefs: { "gold-thesis": "major" },
      titleForThesisId: () => "Gold",
    });
    expect(a).not.toBeNull();
    expect(a!.id).toBe("evidence:log-1");
    expect(a!.type).toBe("system");
    expect(a!.confirmText).toContain("Unusual flow");
  });

  it("returns null on mute pref", () => {
    const a = buildThesisAlertFromEvidenceRow(baseRow, {
      starred: new Set(["gold-thesis"]),
      openIds: new Set(),
      userPollIds: new Set(),
      prefs: { "gold-thesis": "mute" },
      titleForThesisId: () => "Gold",
    });
    expect(a).toBeNull();
  });

  it("builds probability_change when before/after present and pref allows", () => {
    const row = {
      ...baseRow,
      id: "log-2",
      eventType: "news",
      probabilityBefore: { base: 40, bull: 35, bear: 25 },
      probabilityAfter: { base: 30, bull: 45, bear: 25 },
      metadata: { signal_level: 0 },
    };
    const a = buildThesisAlertFromEvidenceRow(row, {
      starred: new Set(["gold-thesis"]),
      openIds: new Set(),
      userPollIds: new Set(),
      prefs: { "gold-thesis": "any" },
      titleForThesisId: () => "Gold",
    });
    expect(a).not.toBeNull();
    expect(a!.id).toBe("evidence:log-2");
    expect(a!.type).toBe("probability_change");
  });
});

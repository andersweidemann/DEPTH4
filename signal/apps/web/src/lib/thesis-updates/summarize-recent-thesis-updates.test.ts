import { describe, expect, it } from "vitest";
import type { ThesisUpdateListItem } from "@/types/thesis";
import {
  classifyScenarioShiftMagnitude,
  summarizeRecentThesisUpdates,
} from "@/lib/thesis-updates/summarize-recent-thesis-updates";

const NOW = Date.parse("2026-05-16T12:00:00.000Z");

function row(partial: Partial<ThesisUpdateListItem> & Pick<ThesisUpdateListItem, "createdAt">): ThesisUpdateListItem {
  return {
    id: partial.id ?? "u1",
    thesisId: "t1",
    actorType: partial.actorType ?? "system",
    actorId: null,
    changeType: partial.changeType ?? "field_update",
    reason: partial.reason ?? null,
    oldValues: partial.oldValues ?? null,
    newValues: partial.newValues ?? null,
    metadata: partial.metadata ?? {},
    createdAt: partial.createdAt,
  };
}

describe("summarizeRecentThesisUpdates", () => {
  it("returns empty copy when no updates in window", () => {
    const old = row({
      createdAt: "2026-05-01T00:00:00.000Z",
      actorType: "news",
    });
    const s = summarizeRecentThesisUpdates([old], NOW);
    expect(s.updateCount).toBe(0);
    expect(s.lines[0]).toBe("No meaningful changes recorded in the last 7 days.");
  });

  it("summarizes mixed news and macro updates", () => {
    const items = [
      row({ createdAt: "2026-05-15T10:00:00.000Z", actorType: "news", changeType: "evidence" }),
      row({ createdAt: "2026-05-14T10:00:00.000Z", actorType: "news", changeType: "evidence" }),
      row({ createdAt: "2026-05-13T10:00:00.000Z", actorType: "macro" }),
    ];
    const s = summarizeRecentThesisUpdates(items, NOW);
    expect(s.updateCount).toBe(3);
    expect(s.lines[0]).toBe("Last 7 days: 3 updates — 2 news-linked, 1 macro-linked.");
    expect(s.lines[1]).toBe("Recent updates recorded, with no major scenario shift.");
  });

  it("summarizes user edit only", () => {
    const s = summarizeRecentThesisUpdates(
      [row({ createdAt: "2026-05-15T10:00:00.000Z", actorType: "user", reason: "CPI timing shifted." })],
      NOW,
    );
    expect(s.lines[0]).toBe("Last 7 days: 1 update — user edit.");
    expect(s.lines[1]).toBe("Recent updates recorded, with no major scenario shift.");
  });

  it("detects material scenario shift from probability deltas", () => {
    const s = summarizeRecentThesisUpdates(
      [
        row({
          createdAt: "2026-05-15T10:00:00.000Z",
          actorType: "news",
          oldValues: { scenario_probabilities: { base: 40, bull: 35, bear: 25 } },
          newValues: { scenario_probabilities: { base: 18, bull: 55, bear: 27 } },
        }),
      ],
      NOW,
    );
    expect(classifyScenarioShiftMagnitude(15)).toBe("modestly");
    expect(s.scenarioShift).toBe("materially");
    expect(s.lines[1]).toBe("Scenario probabilities shifted materially.");
  });

  it("classifies slight scenario moves", () => {
    const s = summarizeRecentThesisUpdates(
      [
        row({
          createdAt: "2026-05-15T10:00:00.000Z",
          actorType: "news",
          oldValues: { scenario_probabilities: { base: 40, bull: 35, bear: 25 } },
          newValues: { scenario_probabilities: { base: 42, bull: 33, bear: 25 } },
        }),
      ],
      NOW,
    );
    expect(s.scenarioShift).toBe("slightly");
    expect(s.lines[1]).toBe("Scenario probabilities changed slightly.");
  });

  it("exposes relative last-updated time", () => {
    const s = summarizeRecentThesisUpdates(
      [row({ createdAt: "2026-05-16T09:00:00.000Z", actorType: "macro" })],
      NOW,
    );
    expect(s.lastUpdatedRelative).toBe("3h ago");
  });
});

import { describe, expect, it } from "vitest";
import {
  buildEvidencePollThesisIds,
  collectEligibleUserThesisPollIdSet,
  EVIDENCE_POLL_MAX_THESIS_IDS,
  isFreshEvidenceAlertEligible,
} from "@/lib/thesis-engine-v2/thesis-evidence-poll-scope";
import { SYSTEM_THESIS_IDS } from "@/lib/thesis-engine-v2/system-thesis-ids";
import type { Thesis } from "@/lib/thesis-engine-v2/types";

function thesisStub(id: string, status: Thesis["status"]): Thesis {
  return { id, slug: id, title: "stub", status } as Thesis;
}

describe("buildEvidencePollThesisIds", () => {
  it("includes eligible user theses even when not starred (DEPTH4 cron writes evidence for them)", () => {
    const ids = buildEvidencePollThesisIds({
      starred: new Set(),
      openIds: new Set(),
      userTheses: [thesisStub("user-a", "watching"), thesisStub("user-b", "resolved")],
    });
    expect(ids).toContain("user-a");
    expect(ids).not.toContain("user-b");
  });

  it("prioritizes starred and open book, then curated catalog, then user theses", () => {
    const users = Array.from({ length: 40 }, (_, i) => thesisStub(`u${i}`, "active"));
    const ids = buildEvidencePollThesisIds({
      starred: new Set(["star-1"]),
      openIds: new Set(["book-1"]),
      userTheses: users,
      maxTotal: 12,
    });
    expect(ids.slice(0, 2)).toEqual(["star-1", "book-1"]);
    expect(ids[2]).toBe(SYSTEM_THESIS_IDS.qqq);
    expect(ids).toContain(SYSTEM_THESIS_IDS.opec);
    const idxFirstUser = ids.indexOf("u0");
    const idxOpec = ids.indexOf(SYSTEM_THESIS_IDS.opec);
    expect(idxOpec).toBeGreaterThan(-1);
    expect(idxOpec).toBeLessThan(idxFirstUser);
    expect(ids.length).toBe(12);
  });

  it("includes focus catalog theses when nothing is starred (so /theses can pick up macro evidence)", () => {
    const ids = buildEvidencePollThesisIds({
      starred: new Set(),
      openIds: new Set(),
      userTheses: [],
      maxTotal: 20,
    });
    expect(ids).toContain(SYSTEM_THESIS_IDS.opec);
    expect(ids).toContain(SYSTEM_THESIS_IDS.qqq);
    expect(ids[0]).toBe(SYSTEM_THESIS_IDS.qqq);
  });

  it("defaults max to EVIDENCE_POLL_MAX_THESIS_IDS", () => {
    const users = Array.from({ length: 200 }, (_, i) => thesisStub(`u${i}`, "ready"));
    const ids = buildEvidencePollThesisIds({
      starred: new Set(),
      openIds: new Set(),
      userTheses: users,
    });
    expect(ids.length).toBe(EVIDENCE_POLL_MAX_THESIS_IDS);
  });

  it("prepends priorityIds so the open thesis is always in the poll set", () => {
    const ids = buildEvidencePollThesisIds({
      starred: new Set(["star-1"]),
      openIds: new Set(),
      userTheses: [thesisStub("user-a", "active")],
      priorityIds: ["user-focus"],
    });
    expect(ids[0]).toBe("user-focus");
    expect(ids).toContain("star-1");
    expect(ids).toContain("user-a");
  });
});

describe("isFreshEvidenceAlertEligible", () => {
  it("allows eligible user thesis ids without star", () => {
    const userPoll = collectEligibleUserThesisPollIdSet([thesisStub("u-watch", "watching")]);
    expect(
      isFreshEvidenceAlertEligible({
        thesisId: "u-watch",
        starred: new Set(),
        openIds: new Set(),
        userPollIds: userPoll,
      }),
    ).toBe(true);
  });

  it("denies random thesis ids", () => {
    expect(
      isFreshEvidenceAlertEligible({
        thesisId: "stranger",
        starred: new Set(),
        openIds: new Set(),
        userPollIds: new Set(),
      }),
    ).toBe(false);
  });
});

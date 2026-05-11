import { describe, expect, it } from "vitest";
import { buildEvidencePollThesisIds, EVIDENCE_POLL_MAX_THESIS_IDS } from "@/lib/thesis-engine-v2/thesis-evidence-poll-scope";
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

  it("prioritizes starred and open book before filling with user theses", () => {
    const users = Array.from({ length: 40 }, (_, i) => thesisStub(`u${i}`, "active"));
    const ids = buildEvidencePollThesisIds({
      starred: new Set(["star-1"]),
      openIds: new Set(["book-1"]),
      userTheses: users,
      maxTotal: 10,
    });
    expect(ids.slice(0, 2)).toEqual(["star-1", "book-1"]);
    expect(ids.length).toBe(10);
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
});

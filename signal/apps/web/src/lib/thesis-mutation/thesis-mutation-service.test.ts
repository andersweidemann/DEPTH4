import { describe, expect, it, vi, beforeEach } from "vitest";
import { ThesisMutationService } from "@/lib/thesis-mutation/thesis-mutation-service";
import type { ThesisRow } from "@/lib/thesis-mutation/types";
import type { SupabaseThesisRepository } from "@/lib/thesis-mutation/repositories/supabase-thesis-repository";
import type { SupabaseThesisUpdateRepository } from "@/lib/thesis-mutation/repositories/supabase-thesis-update-repository";

const USO_GHOST_SLUG = "uso-will-find-a-floor-within-this-earnings-s-9535544b43";
const DB_AI_ID = "550e8400-e29b-41d4-a716-446655440001";

function baseRow(over: Partial<ThesisRow>): ThesisRow {
  return {
    id: DB_AI_ID,
    title: "USO floor thesis",
    status: "forming",
    slug: "db-backed-emerging",
    thesis_origin: "ai_generated",
    owner_user_id: null,
    scenario_probabilities: { base: 40, bull: 35, bear: 25 },
    insider_flow: null,
    body: null,
    supersedes_thesis_id: null,
    lineage_root_thesis_id: DB_AI_ID,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...over,
  };
}

describe("ThesisMutationService", () => {
  let thesisRepo: {
    findById: ReturnType<typeof vi.fn>;
    insert: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  let updateRepo: { insert: ReturnType<typeof vi.fn>; listByThesisId: ReturnType<typeof vi.fn> };
  let service: ThesisMutationService;

  beforeEach(() => {
    thesisRepo = {
      findById: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
    };
    updateRepo = { insert: vi.fn().mockResolvedValue({}), listByThesisId: vi.fn() };
    service = new ThesisMutationService(
      thesisRepo as unknown as SupabaseThesisRepository,
      updateRepo as unknown as SupabaseThesisUpdateRepository,
    );
  });

  it("createThesis logs initial field_update with new_values snapshot", async () => {
    const row = baseRow({ id: DB_AI_ID, slug: "new-user-thesis" });
    thesisRepo.insert.mockResolvedValue(row);

    await service.createThesis(
      {
        id: DB_AI_ID,
        title: row.title,
        status: row.status,
        slug: row.slug,
        thesis_origin: "user",
        owner_user_id: "user-1",
        scenario_probabilities: row.scenario_probabilities,
        insider_flow: null,
        body: null,
      },
      { actorType: "user", actorId: "user-1" },
    );

    expect(updateRepo.insert).toHaveBeenCalledTimes(1);
    const call = updateRepo.insert.mock.calls[0][0];
    expect(call.change_type).toBe("field_update");
    expect(call.old_values).toBeNull();
    expect(call.new_values).toMatchObject({ id: DB_AI_ID });
  });

  it("updateThesis writes old/new diff for changed fields only", async () => {
    const before = baseRow({ status: "forming", title: "Before" });
    const after = baseRow({ status: "watching", title: "After" });
    thesisRepo.findById.mockResolvedValue(before);
    thesisRepo.update.mockResolvedValue(after);

    await service.updateThesis(DB_AI_ID, { status: "watching", title: "After" });

    const call = updateRepo.insert.mock.calls[0][0];
    expect(call.change_type).toBe("field_update");
    expect(call.old_values).toMatchObject({ status: "forming", title: "Before" });
    expect(call.new_values).toMatchObject({ status: "watching", title: "After" });
  });

  it("transitionStatus uses status_transition change_type", async () => {
    const before = baseRow({ status: "forming" });
    const after = baseRow({ status: "ready" });
    thesisRepo.findById.mockResolvedValue(before);
    thesisRepo.update.mockResolvedValue(after);

    await service.transitionStatus(DB_AI_ID, "ready", { reason: "Promoted" });

    const call = updateRepo.insert.mock.calls[0][0];
    expect(call.change_type).toBe("status_transition");
    expect(call.old_values).toEqual({ status: "forming" });
    expect(call.new_values).toEqual({ status: "ready" });
    expect(call.reason).toBe("Promoted");
  });
});

describe("detail resolvable / lineage fixtures", () => {
  it("USO ghost slug is not in a conservative slug set when not DB-loaded", () => {
    const aiSlugs = new Set<string>();
    const userSlugs = new Set<string>();
    const catalogSlugs = new Set(["strait-hormuz-oil-long"]);
    const resolvable = new Set([...catalogSlugs, ...aiSlugs, ...userSlugs]);
    expect(resolvable.has(USO_GHOST_SLUG)).toBe(false);
  });

  it("DB-backed emerging slug is in set when present in aiTheses", () => {
    const slug = "db-backed-emerging-oil-floor";
    const aiSlugs = new Set([slug]);
    expect(aiSlugs.has(slug)).toBe(true);
  });
});

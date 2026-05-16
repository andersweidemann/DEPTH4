import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import * as catalogLoader from "@/lib/theses/load-catalog-engine-theses";
import * as serviceClient from "@/lib/supabase/service-role-client";
import { GET } from "@/app/api/theses/home-signals/route";

describe("GET /api/theses/home-signals", () => {
  beforeEach(() => {
    vi.spyOn(serviceClient, "createServiceRoleClient").mockReturnValue({} as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns catalogLeader from loadCatalogEngineTheses without requiring auth", async () => {
    vi.spyOn(catalogLoader, "loadCatalogEngineTheses").mockResolvedValue({
      catalogEngine: [
        {
          id: "th-a",
          slug: "thesis-a",
          title: "A",
          status: "ready",
          lastUpdated: new Date().toISOString(),
        } as never,
        {
          id: "th-b",
          slug: "thesis-b",
          title: "B",
          status: "ready",
          lastUpdated: new Date().toISOString(),
        } as never,
      ],
      discardBulkWriterCollapse: false,
      dbSurfacingByThesisId: new Map([
        ["th-a", { thesis_score: 40 }],
        ["th-b", { thesis_score: 72 }],
      ]),
    });

    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { catalogLeader: { slug: string; thesisScore: number } | null };
    expect(body.catalogLeader?.slug).toBe("thesis-b");
    expect(body.catalogLeader?.thesisScore).toBe(72);
  });

  it("returns 500 when service role env is missing", async () => {
    vi.mocked(serviceClient.createServiceRoleClient).mockReturnValue(null);
    const res = await GET();
    expect(res.status).toBe(500);
  });
});

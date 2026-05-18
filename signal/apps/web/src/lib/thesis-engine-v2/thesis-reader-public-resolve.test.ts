import { beforeEach, describe, expect, it, vi } from "vitest";
import * as catalogData from "@/lib/thesis-engine-v2/catalog-data";
import * as serviceClient from "@/lib/supabase/service-role-client";
import {
  fetchThesisReaderPublicRow,
  isThesisReaderPublic,
  pickThesisReaderPublicRowFromDbRows,
  resolveThesisReaderPublicRow,
} from "./thesis-reader-public";

function mockSupabaseQuery(result: { data: unknown; error: unknown }) {
  const limit = vi.fn().mockResolvedValue(result);
  const chain: { order: ReturnType<typeof vi.fn>; limit: typeof limit } = {
    order: vi.fn(),
    limit,
  };
  chain.order.mockReturnValue(chain);
  const eq = vi.fn().mockReturnValue(chain);
  const select = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ select });
  return { from, select, eq, order: chain.order, limit };
}

describe("thesis-reader-public resolve", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("pickThesisReaderPublicRowFromDbRows prefers public row over private duplicate", () => {
    const picked = pickThesisReaderPublicRowFromDbRows([
      {
        id: "older-private",
        slug: "strait-hormuz-oil-long",
        reader_public_enabled: false,
        updated_at: "2026-05-20T00:00:00Z",
        thesis_origin: "seeded_system",
      },
      {
        id: "newer-public",
        slug: "strait-hormuz-oil-long",
        reader_public_enabled: true,
        updated_at: "2026-05-18T00:00:00Z",
        thesis_origin: "seeded_system",
      },
    ]);
    expect(picked?.id).toBe("newer-public");
    expect(picked?.reader_public_enabled).toBe(true);
  });

  it("pickThesisReaderPublicRowFromDbRows prefers newest when both share public flag", () => {
    const picked = pickThesisReaderPublicRowFromDbRows([
      {
        id: "a",
        slug: "x",
        reader_public_enabled: true,
        updated_at: "2026-05-10T00:00:00Z",
      },
      {
        id: "b",
        slug: "x",
        reader_public_enabled: true,
        updated_at: "2026-05-20T00:00:00Z",
      },
    ]);
    expect(picked?.id).toBe("b");
  });

  it("fetchThesisReaderPublicRow uses ordered limit(1) query (not maybeSingle)", async () => {
    const chain = mockSupabaseQuery({
      data: [
        {
          id: "t-public",
          slug: "strait-hormuz-oil-long",
          reader_public_enabled: true,
          owner_user_id: null,
          thesis_origin: "seeded_system",
          updated_at: "2026-05-20T00:00:00Z",
        },
      ],
      error: null,
    });
    vi.spyOn(serviceClient, "createServiceRoleClient").mockReturnValue({
      from: chain.from,
    } as never);

    const row = await fetchThesisReaderPublicRow("strait-hormuz-oil-long");
    expect(row?.reader_public_enabled).toBe(true);
    expect(chain.eq).toHaveBeenCalledWith("slug", "strait-hormuz-oil-long");
    expect(chain.order).toHaveBeenCalledWith("reader_public_enabled", { ascending: false });
    expect(chain.order).toHaveBeenCalledWith("updated_at", { ascending: false });
    expect(chain.limit).toHaveBeenCalledWith(1);
  });

  it("resolveThesisReaderPublicRow and isThesisReaderPublic agree for public catalog slug", async () => {
    const chain = mockSupabaseQuery({
      data: [
        {
          id: "hormuz-id",
          slug: "strait-hormuz-oil-long",
          reader_public_enabled: true,
          owner_user_id: null,
          thesis_origin: "seeded_system",
          updated_at: "2026-05-20T00:00:00Z",
        },
      ],
      error: null,
    });
    vi.spyOn(serviceClient, "createServiceRoleClient").mockReturnValue({
      from: chain.from,
    } as never);
    vi.spyOn(catalogData, "getThesisDetail").mockReturnValue({
      thesis: { id: "hormuz-id", slug: "strait-hormuz-oil-long", title: "Hormuz" },
    } as never);

    const resolved = await resolveThesisReaderPublicRow("strait-hormuz-oil-long");
    const isPublic = await isThesisReaderPublic("strait-hormuz-oil-long");

    expect(resolved?.reader_public_enabled).toBe(true);
    expect(isPublic).toBe(true);
  });

  it("resolveThesisReaderPublicRow uses catalog ensure when DB fetch returns null", async () => {
    const fetchChain = mockSupabaseQuery({ data: [], error: null });
    const upsertSingle = vi.fn().mockResolvedValue({
      data: {
        id: "catalog-id",
        slug: "strait-hormuz-oil-long",
        reader_public_enabled: true,
        owner_user_id: null,
        thesis_origin: "seeded_system",
      },
      error: null,
    });
    const upsertSelect = vi.fn().mockReturnValue({ single: upsertSingle });
    const upsert = vi.fn().mockReturnValue({ select: upsertSelect });

    vi.spyOn(serviceClient, "createServiceRoleClient").mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "theses") {
          return { select: fetchChain.select, upsert };
        }
        return { select: fetchChain.select };
      }),
    } as never);

    vi.spyOn(catalogData, "getThesisDetail").mockReturnValue({
      thesis: {
        id: "catalog-id",
        slug: "strait-hormuz-oil-long",
        title: "Hormuz",
        status: "active",
      },
    } as never);

    const resolved = await resolveThesisReaderPublicRow("strait-hormuz-oil-long");
    expect(resolved?.reader_public_enabled).toBe(true);
    expect(upsert).toHaveBeenCalled();
  });
});

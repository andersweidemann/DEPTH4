import { describe, expect, it } from "vitest";
import { fetchThesisRowBySlug } from "@/lib/thesis-engine-v2/fetch-thesis-row-by-slug";

describe("fetchThesisRowBySlug", () => {
  it("prefers user-owned row over ai_generated for the same slug", async () => {
    const rows = [
      {
        id: "ai-id",
        slug: "test-slug",
        title: "AI thesis",
        status: "watching",
        thesis_origin: "ai_generated",
        owner_user_id: null,
      },
      {
        id: "user-id",
        slug: "test-slug",
        title: "User thesis",
        status: "watching",
        thesis_origin: "user",
        owner_user_id: "user-1",
      },
    ];
    const supabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            in: async () => ({ data: rows, error: null }),
          }),
        }),
      }),
    } as never;

    const row = await fetchThesisRowBySlug(supabase, "test-slug", "user-1");
    expect(row?.id).toBe("user-id");
  });

  it("returns ai_generated when no user row matches", async () => {
    const rows = [
      {
        id: "ai-id",
        slug: "gold-short",
        title: "AI thesis",
        status: "watching",
        thesis_origin: "ai_generated",
        owner_user_id: null,
      },
    ];
    const supabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            in: async () => ({ data: rows, error: null }),
          }),
        }),
      }),
    } as never;

    const row = await fetchThesisRowBySlug(supabase, "gold-short", null);
    expect(row?.thesis_origin).toBe("ai_generated");
  });
});

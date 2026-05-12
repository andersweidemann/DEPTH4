import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/auth-from-request", () => ({
  getAuthedSupabase: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

import { getAuthedSupabase } from "@/lib/supabase/auth-from-request";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseAndUserIdForThesisDetailApi } from "@/lib/thesis-engine-v2/thesis-detail-api-auth";

describe("getSupabaseAndUserIdForThesisDetailApi", () => {
  beforeEach(() => {
    vi.mocked(getAuthedSupabase).mockReset();
    vi.mocked(createClient).mockReset();
  });

  it("returns Bearer-resolved client and user id when getAuthedSupabase succeeds", async () => {
    const sb = { tag: "bearer-sb" } as never;
    vi.mocked(getAuthedSupabase).mockResolvedValue({ sb, user: { id: "user-bearer" } });
    const r = await getSupabaseAndUserIdForThesisDetailApi(new Request("https://example.com/api/theses/x"));
    expect(r.userId).toBe("user-bearer");
    expect(r.supabase).toBe(sb);
    expect(createClient).not.toHaveBeenCalled();
  });

  it("falls back to createClient and null userId for anonymous catalog reads", async () => {
    const cookieSb = { tag: "cookie-sb" } as never;
    vi.mocked(getAuthedSupabase).mockResolvedValue(null);
    vi.mocked(createClient).mockResolvedValue(cookieSb);
    const r = await getSupabaseAndUserIdForThesisDetailApi(new Request("https://example.com/api/theses/x"));
    expect(r.userId).toBeNull();
    expect(r.supabase).toBe(cookieSb);
    expect(createClient).toHaveBeenCalledTimes(1);
  });
});

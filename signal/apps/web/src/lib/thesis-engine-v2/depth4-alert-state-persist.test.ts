import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { persistDepth4AlertStates } from "@/lib/thesis-engine-v2/depth4-alert-state-persist";

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      getSession: vi.fn(() => Promise.resolve({ data: { session: { access_token: "test-token" } } })),
    },
  }),
}));

describe("persistDepth4AlertStates", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("PATCHes /api/user/alert-state with bearer and JSON body", async () => {
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    await persistDepth4AlertStates([{ alert_key: "evidence:row-1", state: "read" }]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toContain("/api/user/alert-state");
    expect(init.method).toBe("PATCH");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer test-token");
    expect(JSON.parse(String(init.body))).toEqual({
      entries: [{ alert_key: "evidence:row-1", state: "read" }],
    });
  });
});

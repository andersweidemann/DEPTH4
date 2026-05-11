import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { schedulePersistBookPositionsDebounced } from "@/lib/thesis-engine-v2/depth4-book-positions-persist";

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      getSession: vi.fn(() => Promise.resolve({ data: { session: { access_token: "book-token" } } })),
    },
  }),
}));

vi.mock("@/lib/thesis-engine-v2/positions-store", () => ({
  loadPositions: vi.fn(() => [{ id: "p1", symbol: "GLD", side: "long", linkedThesisId: "t1", openedAt: "2026-01-01", tradeStatus: "open" }]),
}));

describe("schedulePersistBookPositionsDebounced", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    vi.stubGlobal("window", {} as Window & typeof globalThis);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("eventually PATCHes book-positions with current positions", async () => {
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    schedulePersistBookPositionsDebounced();
    await vi.advanceTimersByTimeAsync(900);
    expect(fetchMock).toHaveBeenCalled();
    const call = fetchMock.mock.calls.find((c) => String(c[0]).includes("book-positions"));
    expect(call).toBeDefined();
    const init = call![1] as RequestInit;
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(String(init.body)).positions).toHaveLength(1);
  });
});

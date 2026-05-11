import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEPTH4_NOTIFY_PREFS_SESSION_KEY,
  DEPTH4_THESIS_OUTCOMES_SESSION_KEY,
} from "@/lib/thesis-engine-v2/depth4-session-keys";
import { schedulePersistDepth4AccountPrefsDebounced } from "@/lib/thesis-engine-v2/depth4-account-prefs-persist";

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      getSession: vi.fn(() => Promise.resolve({ data: { session: { access_token: "prefs-token" } } })),
    },
  }),
}));

describe("schedulePersistDepth4AccountPrefsDebounced", () => {
  const sessionBag: Record<string, string> = {};

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    vi.stubGlobal("window", {
      sessionStorage: {
        getItem: (k: string) => (Object.prototype.hasOwnProperty.call(sessionBag, k) ? sessionBag[k]! : null),
        setItem: (k: string, v: string) => {
          sessionBag[k] = v;
        },
        removeItem: (k: string) => {
          delete sessionBag[k];
        },
      },
    } as unknown as Window & typeof globalThis);
    sessionBag[DEPTH4_NOTIFY_PREFS_SESSION_KEY] = JSON.stringify({ t1: "any" });
    sessionBag[DEPTH4_THESIS_OUTCOMES_SESSION_KEY] = JSON.stringify({
      t1: { status: "resolved", at: "2026-01-01T00:00:00.000Z" },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    for (const k of Object.keys(sessionBag)) delete sessionBag[k];
  });

  it("eventually PATCHes /api/user/preferences with notify + outcomes payload", async () => {
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    schedulePersistDepth4AccountPrefsDebounced();
    await vi.advanceTimersByTimeAsync(800);
    expect(fetchMock).toHaveBeenCalled();
    const call = fetchMock.mock.calls.find((c) => String(c[0]).includes("/api/user/preferences"));
    expect(call).toBeDefined();
    const init = call![1] as RequestInit;
    expect(init.method).toBe("PATCH");
    const body = JSON.parse(String(init.body));
    expect(body.notification_preferences.depth4ThesisNotifyPrefs.t1).toBe("any");
    expect(body.notification_preferences.depth4ManualThesisOutcomes.t1.status).toBe("resolved");
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Thesis } from "@/lib/thesis-engine-v2/types";

const authFetchMock = vi.fn();
const getSessionMock = vi.fn();

vi.mock("@/lib/api", () => ({
  authFetch: (...args: unknown[]) => authFetchMock(...args),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: { getSession: getSessionMock },
  }),
}));

import { putUserThesisToSupabase } from "@/lib/thesis-engine-v2/sync-user-thesis-client";

function mockStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k: string) => map.get(k) ?? null,
    key: (i: number) => [...map.keys()][i] ?? null,
    removeItem: (k: string) => {
      map.delete(k);
    },
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
  };
}

const minimalThesis = {
  id: "user-abc",
  slug: "test-slug",
  title: "Test thesis",
  status: "watching",
} as Thesis;

describe("putUserThesisToSupabase", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", mockStorage());
    vi.stubGlobal("sessionStorage", mockStorage());
    vi.stubGlobal("window", { localStorage, sessionStorage });
    authFetchMock.mockReset();
    getSessionMock.mockReset();
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("calls PUT without requiring getSession when authFetch succeeds (cookie session path)", async () => {
    getSessionMock.mockResolvedValue({ data: { session: null } });
    authFetchMock.mockResolvedValue({ ok: true, status: 200 });

    const result = await putUserThesisToSupabase(minimalThesis);

    expect(result).toEqual({ ok: true });
    expect(authFetchMock).toHaveBeenCalledWith(
      "/api/user/theses",
      expect.objectContaining({ method: "PUT" }),
    );
  });

  it("hydrates depth4_token from getSession when storage is empty", async () => {
    getSessionMock.mockResolvedValue({
      data: { session: { access_token: "tok-from-session" } },
    });
    authFetchMock.mockResolvedValue({ ok: true, status: 200 });

    await putUserThesisToSupabase(minimalThesis);

    expect(localStorage.getItem("depth4_token")).toBe("tok-from-session");
  });
});

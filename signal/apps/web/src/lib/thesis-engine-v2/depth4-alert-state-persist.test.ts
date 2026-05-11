import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  flushPendingDepth4AlertStates,
  persistDepth4AlertStates,
  resetDepth4AlertStatePersistForTests,
} from "@/lib/thesis-engine-v2/depth4-alert-state-persist";

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      getSession: vi.fn(() => Promise.resolve({ data: { session: { access_token: "test-token" } } })),
    },
  }),
}));

describe("persistDepth4AlertStates", () => {
  beforeEach(() => {
    resetDepth4AlertStatePersistForTests();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200 }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    resetDepth4AlertStatePersistForTests();
  });

  it("PATCHes /api/user/alert-state with bearer and JSON body", async () => {
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    await persistDepth4AlertStates([{ alert_key: "evidence:row-1", state: "read" }], { action: "markAllRead" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toContain("/api/user/alert-state");
    expect(init.method).toBe("PATCH");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer test-token");
    expect(JSON.parse(String(init.body))).toEqual({
      entries: [{ alert_key: "evidence:row-1", state: "read" }],
    });
  });

  it("retries once on 503 then succeeds", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);
    await persistDepth4AlertStates([{ alert_key: "evidence:a", state: "read" }], { action: "dismiss" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("logs and queues after two retryable failures, then merges pending on next successful persist", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 503 });
    vi.stubGlobal("fetch", fetchMock);

    await persistDepth4AlertStates([{ alert_key: "evidence:x", state: "dismissed" }], { action: "dismiss" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalled();
    const logLine = String(warn.mock.calls[0]?.[0] ?? "");
    expect(logLine).toContain("depth4_alert_state_write_failed");
    expect(logLine).toContain('"action":"dismiss"');
    expect(logLine).toContain('"signedIn":true');
    expect(logLine).toContain('"entryCount":1');

    fetchMock.mockReset();
    fetchMock.mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);
    await persistDepth4AlertStates([{ alert_key: "evidence:y", state: "read" }], { action: "markAllRead" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(String((fetchMock.mock.calls[0]![1] as RequestInit).body));
    const keys = new Set(body.entries.map((e: { alert_key: string }) => e.alert_key));
    expect(keys.has("evidence:x")).toBe(true);
    expect(keys.has("evidence:y")).toBe(true);

    warn.mockRestore();
  });

  it("flushPendingDepth4AlertStates drains in-memory queue after failed writes", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 503 });
    vi.stubGlobal("fetch", fetchMock);
    await persistDepth4AlertStates([{ alert_key: "evidence:q", state: "read" }], { action: "markReadOnOpen" });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    fetchMock.mockReset();
    fetchMock.mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);
    await flushPendingDepth4AlertStates();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(String((fetchMock.mock.calls[0]![1] as RequestInit).body));
    expect(body.entries.some((e: { alert_key: string }) => e.alert_key === "evidence:q")).toBe(true);
    warn.mockRestore();
  });

  it("does not retry on 401 (single attempt, no queue)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 401 });
    vi.stubGlobal("fetch", fetchMock);
    await persistDepth4AlertStates([{ alert_key: "evidence:u", state: "read" }], { action: "markAllRead" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});

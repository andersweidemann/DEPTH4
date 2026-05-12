import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/headers", () => ({
  cookies: vi.fn(),
}));

const createServerClientMock = vi.fn(() => ({}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: createServerClientMock,
}));

import { cookies } from "next/headers";

describe("lib/supabase/server createClient", () => {
  beforeEach(() => {
    createServerClientMock.mockClear();
    vi.mocked(cookies).mockReset();
  });

  it("regression: uses getAll/setAll cookie adapter (chunked Supabase session cookies)", async () => {
    const getAll = vi.fn(() => [
      { name: "sb-test-auth-token.0", value: "a" },
      { name: "sb-test-auth-token.1", value: "b" },
    ]);
    const set = vi.fn();
    vi.mocked(cookies).mockResolvedValue({
      getAll,
      set,
    } as never);

    const { createClient } = await import("@/lib/supabase/server");
    await createClient();

    expect(createServerClientMock).toHaveBeenCalledTimes(1);
    const call = createServerClientMock.mock.calls[0] as unknown as [
      string,
      string,
      { cookies: Record<string, unknown> },
    ];
    expect(call.length).toBeGreaterThanOrEqual(3);
    const cookieAdapter = call[2].cookies;
    expect(cookieAdapter.getAll).toBeTypeOf("function");
    expect(cookieAdapter.setAll).toBeTypeOf("function");
    expect(cookieAdapter.get).toBeUndefined();
    expect(cookieAdapter.set).toBeUndefined();

    (cookieAdapter.getAll as () => unknown[])();
    expect(getAll).toHaveBeenCalled();
    (cookieAdapter.setAll as (rows: { name: string; value: string; options: object }[]) => void)([
      { name: "x", value: "y", options: { path: "/" } },
    ]);
    expect(set).toHaveBeenCalledWith("x", "y", { path: "/" });
  });
});

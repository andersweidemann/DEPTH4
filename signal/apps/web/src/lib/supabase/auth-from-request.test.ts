import { describe, expect, it, vi, beforeEach } from "vitest";

const cookieGetUser = vi.fn();
const bearerGetUser = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    kind: "cookie",
    auth: { getUser: cookieGetUser },
  })),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    kind: "bearer",
    auth: { getUser: bearerGetUser },
  })),
}));

vi.mock("@/lib/cron-auth", () => ({
  configuredCronSecrets: vi.fn(() => ["cron-secret-xyz"]),
}));

import { createClient as createSupabaseJsClient } from "@supabase/supabase-js";
import { bearerToken, getAuthedSupabase, isUserSessionBearerToken } from "@/lib/supabase/auth-from-request";

describe("auth-from-request", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://abc.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY =
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSJ9.test.signature";
  });

  it("isUserSessionBearerToken rejects configured cron secrets", () => {
    expect(isUserSessionBearerToken("cron-secret-xyz")).toBe(false);
    expect(isUserSessionBearerToken("eyJ.user.jwt")).toBe(true);
  });

  it("prefers cookie session over stale Bearer token", async () => {
    cookieGetUser.mockResolvedValue({
      data: { user: { id: "cookie-user", email: "a@b.com" } },
      error: null,
    });
    bearerGetUser.mockResolvedValue({ data: { user: null }, error: { message: "invalid" } });

    const req = new Request("https://example.com/api/theses", {
      headers: { Authorization: "Bearer stale-jwt-token" },
    });

    const auth = await getAuthedSupabase(req);
    expect(auth?.user.id).toBe("cookie-user");
    expect(createSupabaseJsClient).not.toHaveBeenCalled();
  });

  it("falls back to Bearer when cookie session is absent", async () => {
    cookieGetUser.mockResolvedValue({ data: { user: null }, error: { message: "no session" } });
    bearerGetUser.mockResolvedValue({
      data: { user: { id: "bearer-user", email: "b@c.com" } },
      error: null,
    });

    const req = new Request("https://example.com/api/theses", {
      headers: { Authorization: "Bearer valid-jwt" },
    });

    const auth = await getAuthedSupabase(req);
    expect(auth?.user.id).toBe("bearer-user");
    expect(createSupabaseJsClient).toHaveBeenCalled();
  });

  it("bearerToken parses Authorization header", () => {
    const req = new Request("https://x", { headers: { Authorization: "Bearer abc" } });
    expect(bearerToken(req)).toBe("abc");
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as serviceClient from "@/lib/supabase/service-role-client";
import {
  fetchDepth4RolesFromDb,
  getDepth4RolePolicy,
  isDepth4AdminUserAsync,
  isDepth4ElevatedUserAsync,
  legacyDepth4AdminEmailsFromEnv,
  legacyDepth4OperatorUserIdsFromEnv,
  resolveDepth4Privileges,
} from "./depth4-user-roles";

function mockSvc(handlers: { roles?: { role: string }[]; tableCount?: number }) {
  const rolesByUser = handlers.roles ?? [];
  const tableCount = handlers.tableCount ?? (rolesByUser.length ? 1 : 0);

  const from = vi.fn((table: string) => {
    if (table === "depth4_user_role_audit") {
      return { insert: vi.fn().mockResolvedValue({ error: null }) };
    }

    if (table !== "depth4_user_roles") return {};

    return {
      select: vi.fn((_cols?: string, opts?: { count?: string; head?: boolean }) => {
        if (opts?.head) {
          return Promise.resolve({ count: tableCount, error: null });
        }
        return {
          eq: vi.fn().mockResolvedValue({ data: rolesByUser, error: null }),
          order: vi.fn().mockResolvedValue({
            data: rolesByUser.map((r, i) => ({
              user_id: "user-1",
              role: r.role,
              created_at: `2026-01-0${i + 1}T00:00:00Z`,
            })),
            error: null,
          }),
        };
      }),
      upsert: vi.fn().mockResolvedValue({ error: null }),
      delete: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      }),
    };
  });

  return { from } as never;
}

describe("depth4-user-roles", () => {
  const env = process.env;

  beforeEach(() => {
    vi.restoreAllMocks();
    delete process.env.DEPTH4_ROLE_ENV_FALLBACK;
    delete process.env.DEPTH4_ROLE_ENV_BOOTSTRAP;
    delete process.env.DEPTH4_ADMIN_EMAILS;
    delete process.env.DEPTH4_OPERATOR_USER_IDS;
    delete process.env.NEXT_PUBLIC_DEPTH4_ADMIN_EMAILS;
    delete process.env.NEXT_PUBLIC_DEPTH4_OPERATOR_USER_IDS;
  });

  afterEach(() => {
    process.env = env;
  });

  it("defaults policy to DB-only (fallback and bootstrap off)", () => {
    expect(getDepth4RolePolicy()).toEqual({
      envFallbackEnabled: false,
      envBootstrapEnabled: false,
    });
  });

  it("parses server-only env allowlists (ignores NEXT_PUBLIC_*)", () => {
    process.env.DEPTH4_ADMIN_EMAILS = "A@x.com";
    process.env.NEXT_PUBLIC_DEPTH4_ADMIN_EMAILS = "public@should-not-read.com";
    process.env.DEPTH4_OPERATOR_USER_IDS = "uid-1";
    process.env.NEXT_PUBLIC_DEPTH4_OPERATOR_USER_IDS = "public-uid";
    expect(legacyDepth4AdminEmailsFromEnv()).toEqual(["a@x.com"]);
    expect(legacyDepth4OperatorUserIdsFromEnv()).toEqual(["uid-1"]);
  });

  it("fetchDepth4RolesFromDb returns admin and operator", async () => {
    const svc = mockSvc({ roles: [{ role: "operator" }, { role: "admin" }] });
    const roles = await fetchDepth4RolesFromDb(svc, "user-1");
    expect(roles).toEqual(["operator", "admin"]);
  });

  it("resolveDepth4Privileges uses db when roles exist (default policy)", async () => {
    vi.spyOn(serviceClient, "createServiceRoleClient").mockReturnValue(
      mockSvc({ roles: [{ role: "admin" }], tableCount: 1 }),
    );
    const p = await resolveDepth4Privileges({ userId: "user-1", email: "a@x.com" });
    expect(p.source).toBe("db");
    expect(p.isAdmin).toBe(true);
    expect(p.isElevated).toBe(true);
  });

  it("operator is elevated but not admin", async () => {
    vi.spyOn(serviceClient, "createServiceRoleClient").mockReturnValue(
      mockSvc({ roles: [{ role: "operator" }], tableCount: 1 }),
    );
    const p = await resolveDepth4Privileges({ userId: "op-1" });
    expect(p.isOperator).toBe(true);
    expect(p.isElevated).toBe(true);
    expect(p.isAdmin).toBe(false);
    expect(await isDepth4ElevatedUserAsync({ userId: "op-1" })).toBe(true);
    expect(await isDepth4AdminUserAsync({ userId: "op-1" })).toBe(false);
  });

  it("denies env-only user when fallback and bootstrap are off", async () => {
    vi.spyOn(serviceClient, "createServiceRoleClient").mockReturnValue(
      mockSvc({ roles: [], tableCount: 0 }),
    );
    process.env.DEPTH4_OPERATOR_USER_IDS = "op-env";
    const p = await resolveDepth4Privileges({ userId: "op-env" });
    expect(p.source).toBe("none");
    expect(p.isElevated).toBe(false);
  });

  it("env_fallback only when DEPTH4_ROLE_ENV_FALLBACK=1", async () => {
    vi.spyOn(serviceClient, "createServiceRoleClient").mockReturnValue(null);
    process.env.DEPTH4_ROLE_ENV_FALLBACK = "1";
    process.env.DEPTH4_OPERATOR_USER_IDS = "op-env";
    const p = await resolveDepth4Privileges({ userId: "op-env" });
    expect(p.source).toBe("env_fallback");
    expect(p.isElevated).toBe(true);
  });

  it("bootstraps admin from env when DEPTH4_ROLE_ENV_BOOTSTRAP=1", async () => {
    vi.spyOn(serviceClient, "createServiceRoleClient").mockReturnValue(
      mockSvc({ roles: [], tableCount: 0 }),
    );
    process.env.DEPTH4_ROLE_ENV_BOOTSTRAP = "1";
    process.env.DEPTH4_ADMIN_EMAILS = "admin@test.com";
    const p = await resolveDepth4Privileges({ userId: "user-new", email: "admin@test.com" });
    expect(p.source).toBe("env_bootstrap");
    expect(p.isAdmin).toBe(true);
    expect(p.isElevated).toBe(true);
  });
});

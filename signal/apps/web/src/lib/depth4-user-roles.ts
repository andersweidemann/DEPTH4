/**
 * Phase 4E / 4E.1 — DB-backed internal roles for DEPTH4 privileged actions.
 *
 * Source of truth: `depth4_user_roles` (admin | operator).
 *
 * Production (4E.1): DB-only by default. Env is opt-in only:
 * - DEPTH4_ROLE_ENV_BOOTSTRAP=1 — write env allowlists into DB (migration / one-time seed)
 * - DEPTH4_ROLE_ENV_FALLBACK=1 — emergency env-only grants without DB (avoid in prod)
 *
 * Role semantics:
 * - admin: admin-only surfaces + all elevated actions
 * - operator: elevated actions + anatomy debug
 * - elevated = admin OR operator
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceRoleClient } from "@/lib/supabase/service-role-client";

export type Depth4Role = "admin" | "operator";

export type Depth4Privileges = {
  userId: string;
  roles: Depth4Role[];
  isAdmin: boolean;
  isOperator: boolean;
  isElevated: boolean;
  source: "db" | "env_bootstrap" | "env_fallback" | "none";
};

export type Depth4RolePolicy = {
  /** Emergency only: env grants without DB. Default off (DEPTH4_ROLE_ENV_FALLBACK=1 to enable). */
  envFallbackEnabled: boolean;
  /** Migration only: persist env matches to DB. Default off (DEPTH4_ROLE_ENV_BOOTSTRAP=1 to enable). */
  envBootstrapEnabled: boolean;
};

const ROLE_RANK: Record<Depth4Role, number> = { admin: 2, operator: 1 };

function privilegesFromRoles(
  userId: string,
  roles: Depth4Role[],
  source: Depth4Privileges["source"],
): Depth4Privileges {
  const isAdmin = roles.includes("admin");
  const isOperator = isAdmin || roles.includes("operator");
  return {
    userId,
    roles: [...roles].sort((a, b) => ROLE_RANK[b] - ROLE_RANK[a]),
    isAdmin,
    isOperator,
    isElevated: isOperator,
    source,
  };
}

/** Production policy: both flags default off unless explicitly set to "1". */
export function getDepth4RolePolicy(): Depth4RolePolicy {
  return {
    envFallbackEnabled: (process.env.DEPTH4_ROLE_ENV_FALLBACK ?? "0").trim() === "1",
    envBootstrapEnabled: (process.env.DEPTH4_ROLE_ENV_BOOTSTRAP ?? "0").trim() === "1",
  };
}

/** Server-only bootstrap allowlist — never read NEXT_PUBLIC_* (not for client gating). */
export function legacyDepth4AdminEmailsFromEnv(): string[] {
  return (process.env.DEPTH4_ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/** Server-only bootstrap allowlist — never read NEXT_PUBLIC_* */
export function legacyDepth4OperatorUserIdsFromEnv(): string[] {
  return (process.env.DEPTH4_OPERATOR_USER_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function legacyEnvMatch(userId: string, email: string | null | undefined): Depth4Role[] {
  const roles: Depth4Role[] = [];
  const uid = userId.trim();
  if (uid && legacyDepth4OperatorUserIdsFromEnv().includes(uid)) roles.push("operator");
  const em = (email ?? "").trim().toLowerCase();
  const admins = legacyDepth4AdminEmailsFromEnv();
  if (em && admins.length > 0 && admins.includes(em)) roles.push("admin");
  return roles;
}

export async function fetchDepth4RolesFromDb(
  svc: SupabaseClient,
  userId: string,
): Promise<Depth4Role[]> {
  const uid = userId.trim();
  if (!uid) return [];

  const { data, error } = await svc
    .from("depth4_user_roles")
    .select("role")
    .eq("user_id", uid);

  if (error) {
    console.error("[DEPTH4] fetchDepth4RolesFromDb failed", error.message);
    return [];
  }

  const roles: Depth4Role[] = [];
  for (const row of data ?? []) {
    const r = (row as { role?: string }).role;
    if (r === "admin" || r === "operator") roles.push(r);
  }
  return roles;
}

async function writeRoleAudit(
  svc: SupabaseClient,
  input: {
    userId: string;
    role: Depth4Role;
    action: "granted" | "revoked" | "bootstrap_from_env";
    actorId: string | null;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  await svc.from("depth4_user_role_audit").insert({
    user_id: input.userId,
    role: input.role,
    action: input.action,
    actor_id: input.actorId,
    metadata: input.metadata ?? {},
  } as never);
}

export async function grantDepth4Role(
  svc: SupabaseClient,
  input: {
    userId: string;
    role: Depth4Role;
    actorId: string | null;
    reason?: string;
  },
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await svc.from("depth4_user_roles").upsert(
    {
      user_id: input.userId,
      role: input.role,
      created_by: input.actorId,
    } as never,
    { onConflict: "user_id,role" },
  );

  if (error) return { ok: false, error: error.message };

  const action = input.reason === "bootstrap_from_env" ? "bootstrap_from_env" : "granted";
  await writeRoleAudit(svc, {
    userId: input.userId,
    role: input.role,
    action,
    actorId: input.actorId,
    metadata: { reason: input.reason ?? null },
  });

  return { ok: true };
}

export async function revokeDepth4Role(
  svc: SupabaseClient,
  input: {
    userId: string;
    role: Depth4Role;
    actorId: string | null;
    reason?: string;
  },
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await svc
    .from("depth4_user_roles")
    .delete()
    .eq("user_id", input.userId)
    .eq("role", input.role);

  if (error) return { ok: false, error: error.message };

  await writeRoleAudit(svc, {
    userId: input.userId,
    role: input.role,
    action: "revoked",
    actorId: input.actorId,
    metadata: { reason: input.reason ?? null },
  });

  return { ok: true };
}

/** One-time bulk seed of operator user ids from env when table is empty (requires BOOTSTRAP=1). */
export async function seedOperatorRolesFromEnvIfEmpty(svc: SupabaseClient): Promise<number> {
  if (!getDepth4RolePolicy().envBootstrapEnabled) return 0;

  const { count, error: countErr } = await svc
    .from("depth4_user_roles")
    .select("user_id", { count: "exact", head: true });

  if (countErr || (count ?? 0) > 0) return 0;

  const ids = legacyDepth4OperatorUserIdsFromEnv();
  let seeded = 0;
  for (const userId of ids) {
    const res = await grantDepth4Role(svc, {
      userId,
      role: "operator",
      actorId: null,
      reason: "bootstrap_from_env",
    });
    if (res.ok) seeded += 1;
  }
  return seeded;
}

async function bootstrapUserRolesFromEnv(
  svc: SupabaseClient,
  userId: string,
  email: string | null | undefined,
): Promise<Depth4Role[]> {
  const matched = legacyEnvMatch(userId, email);
  if (!matched.length) return [];

  for (const role of matched) {
    await grantDepth4Role(svc, {
      userId,
      role,
      actorId: null,
      reason: "bootstrap_from_env",
    });
  }
  return matched;
}

export async function listDepth4UserRoles(
  svc: SupabaseClient,
): Promise<{ userId: string; role: Depth4Role; createdAt: string }[]> {
  const { data, error } = await svc
    .from("depth4_user_roles")
    .select("user_id, role, created_at")
    .order("created_at", { ascending: false });

  if (error || !data) return [];

  return (data as { user_id: string; role: Depth4Role; created_at: string }[]).map((r) => ({
    userId: r.user_id,
    role: r.role,
    createdAt: r.created_at,
  }));
}

export type Depth4RoleOperationalHealth = {
  policy: Depth4RolePolicy;
  dbRoleCount: number;
  dbUserIds: string[];
  envConfigured: {
    adminEmails: string[];
    operatorUserIds: string[];
  };
  /** Operator UUIDs in env but missing any row in depth4_user_roles */
  operatorUserIdsNotInDb: string[];
  envOnlyPrivilegePossible: boolean;
  notes: string[];
};

/** Admin visibility: who is in DB vs who might only match env allowlists. */
export async function getDepth4RoleOperationalHealth(
  svc: SupabaseClient,
): Promise<Depth4RoleOperationalHealth> {
  const policy = getDepth4RolePolicy();
  const roles = await listDepth4UserRoles(svc);
  const dbUserIds = [...new Set(roles.map((r) => r.userId))];
  const operatorUserIds = legacyDepth4OperatorUserIdsFromEnv();
  const operatorUserIdsNotInDb = operatorUserIds.filter((id) => !dbUserIds.includes(id));
  const adminEmails = legacyDepth4AdminEmailsFromEnv();

  const notes: string[] = [
    "Source of truth: public.depth4_user_roles. elevated = admin OR operator.",
  ];
  if (policy.envFallbackEnabled) {
    notes.push("WARNING: DEPTH4_ROLE_ENV_FALLBACK=1 — env can grant access without a DB row.");
  } else {
    notes.push("Normal mode: DEPTH4_ROLE_ENV_FALLBACK is off — DB rows required for privilege.");
  }
  if (policy.envBootstrapEnabled) {
    notes.push("DEPTH4_ROLE_ENV_BOOTSTRAP=1 — env allowlists may be written to DB on match.");
  } else {
    notes.push("DEPTH4_ROLE_ENV_BOOTSTRAP is off — use /admin/depth4-roles or SQL to grant roles.");
  }
  if (adminEmails.length) {
    notes.push(
      "Admin emails in DEPTH4_ADMIN_EMAILS are not auto-mapped to UUIDs; grant admin by user_id in the UI.",
    );
  }

  return {
    policy,
    dbRoleCount: roles.length,
    dbUserIds,
    envConfigured: { adminEmails, operatorUserIds },
    operatorUserIdsNotInDb,
    envOnlyPrivilegePossible: policy.envFallbackEnabled,
    notes,
  };
}

/**
 * Resolve privileges for a user. DB is the normal authority (4E.1).
 */
export async function resolveDepth4Privileges(input: {
  userId: string;
  email?: string | null;
}): Promise<Depth4Privileges> {
  const userId = input.userId.trim();
  if (!userId) {
    return privilegesFromRoles("", [], "none");
  }

  const policy = getDepth4RolePolicy();
  const svc = createServiceRoleClient();

  if (!svc) {
    if (policy.envFallbackEnabled) {
      const legacy = legacyEnvMatch(userId, input.email);
      if (legacy.length) return privilegesFromRoles(userId, legacy, "env_fallback");
    }
    return privilegesFromRoles(userId, [], "none");
  }

  if (policy.envBootstrapEnabled) {
    await seedOperatorRolesFromEnvIfEmpty(svc);
  }

  const roles = await fetchDepth4RolesFromDb(svc, userId);
  if (roles.length) return privilegesFromRoles(userId, roles, "db");

  if (policy.envBootstrapEnabled) {
    const legacy = legacyEnvMatch(userId, input.email);
    if (legacy.length) {
      const bootstrapped = await bootstrapUserRolesFromEnv(svc, userId, input.email);
      if (bootstrapped.length) {
        return privilegesFromRoles(userId, bootstrapped, "env_bootstrap");
      }
    }
  }

  if (policy.envFallbackEnabled) {
    const legacy = legacyEnvMatch(userId, input.email);
    if (legacy.length) return privilegesFromRoles(userId, legacy, "env_fallback");
  }

  return privilegesFromRoles(userId, [], "none");
}

export async function isDepth4ElevatedUserAsync(input: {
  userId: string;
  email?: string | null;
}): Promise<boolean> {
  const p = await resolveDepth4Privileges(input);
  return p.isElevated;
}

export async function isDepth4AdminUserAsync(input: {
  userId: string;
  email?: string | null;
}): Promise<boolean> {
  const p = await resolveDepth4Privileges(input);
  return p.isAdmin;
}

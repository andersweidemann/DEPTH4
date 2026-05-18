"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { authFetch } from "@/lib/api";
import { useDepth4AdminGate } from "@/hooks/use-depth4-privileges";
import { cn } from "@/lib/utils";

type RoleRow = {
  userId: string;
  role: "admin" | "operator";
  createdAt: string;
};

type OperationalHealth = {
  policy: { envFallbackEnabled: boolean; envBootstrapEnabled: boolean };
  dbRoleCount: number;
  dbUserIds: string[];
  envConfigured: { adminEmails: string[]; operatorUserIds: string[] };
  operatorUserIdsNotInDb: string[];
  envOnlyPrivilegePossible: boolean;
  notes: string[];
};

export default function Depth4RolesAdminPage() {
  const { denied, loading: gateLoading } = useDepth4AdminGate();
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [health, setHealth] = useState<OperationalHealth | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [userId, setUserId] = useState("");
  const [role, setRole] = useState<"admin" | "operator">("operator");
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    if (gateLoading || denied) return;
    setLoadErr(null);
    void authFetch("/api/admin/depth4-user-roles")
      .then(async (res) => {
        const j = (await res.json()) as {
          ok: boolean;
          roles?: RoleRow[];
          health?: OperationalHealth;
          error?: string;
        };
        if (!res.ok || !j.ok) {
          setLoadErr(j.error ?? `HTTP ${res.status}`);
          return;
        }
        setRoles(j.roles ?? []);
        setHealth(j.health ?? null);
      })
      .catch(() => setLoadErr("Failed to load roles."));
  }, [denied, gateLoading]);

  useEffect(() => {
    load();
  }, [load]);

  const grant = async () => {
    const uid = userId.trim();
    if (!uid || saving) return;
    setSaving(true);
    setLoadErr(null);
    try {
      const res = await authFetch("/api/admin/depth4-user-roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: uid, role }),
      });
      const j = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !j.ok) {
        setLoadErr(j.error ?? `HTTP ${res.status}`);
        return;
      }
      setUserId("");
      load();
    } finally {
      setSaving(false);
    }
  };

  const revoke = async (targetUserId: string, targetRole: "admin" | "operator") => {
    if (saving) return;
    setSaving(true);
    setLoadErr(null);
    try {
      const params = new URLSearchParams({ userId: targetUserId, role: targetRole });
      const res = await authFetch(`/api/admin/depth4-user-roles?${params.toString()}`, { method: "DELETE" });
      const j = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !j.ok) {
        setLoadErr(j.error ?? `HTTP ${res.status}`);
        return;
      }
      load();
    } finally {
      setSaving(false);
    }
  };

  if (gateLoading) {
    return <div className="py-16 text-center text-sm text-zinc-500">Checking access…</div>;
  }

  if (denied) {
    return (
      <div className="py-16 text-center text-sm text-zinc-500">
        Admin access required.{" "}
        <Link href="/theses" className="text-[#E8473F] hover:underline">
          Back
        </Link>
      </div>
    );
  }

  const policyOk =
    health && !health.policy.envFallbackEnabled && !health.policy.envBootstrapEnabled;

  return (
    <div className="pb-16">
      <Link href="/admin/thesis-live" className="text-[11px] text-zinc-500 hover:text-zinc-300">
        ← Admin
      </Link>
      <h1 className="mt-4 text-xl font-semibold text-zinc-50">DEPTH4 roles</h1>
      <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-zinc-500">
        Source of truth: <span className="font-mono text-zinc-400">depth4_user_roles</span>. Audited in{" "}
        <span className="font-mono text-zinc-400">depth4_user_role_audit</span>. See{" "}
        <span className="font-mono text-zinc-500">apps/web/docs/DEPTH4_INTERNAL_ROLES.md</span>.
      </p>

      {health ? (
        <div
          className={cn(
            "mt-6 border px-4 py-3 text-[12px]",
            policyOk ? "border-emerald-500/30 bg-emerald-950/20 text-emerald-200/90" : "border-amber-500/35 bg-amber-950/20 text-amber-200/90",
          )}
        >
          <p className="font-semibold">
            {policyOk ? "DB-only mode (production default)" : "Transitional env policy active"}
          </p>
          <p className="mt-1 text-zinc-400">
            Fallback: {health.policy.envFallbackEnabled ? "ON — env can grant without DB" : "off"} · Bootstrap:{" "}
            {health.policy.envBootstrapEnabled ? "ON — env writes to DB" : "off"} · DB assignments: {health.dbRoleCount}
          </p>
          {health.operatorUserIdsNotInDb.length > 0 ? (
            <p className="mt-2 font-mono text-[11px] text-zinc-300">
              Operator UUIDs in DEPTH4_OPERATOR_USER_IDS but not in DB:{" "}
              {health.operatorUserIdsNotInDb.join(", ")}
            </p>
          ) : null}
          {health.envConfigured.adminEmails.length > 0 ? (
            <p className="mt-2 text-[11px] text-zinc-500">
              {health.envConfigured.adminEmails.length} admin email(s) in env — grant admin by user UUID in this UI.
            </p>
          ) : null}
          <ul className="mt-2 list-inside list-disc text-[11px] text-zinc-500">
            {health.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-6 flex flex-wrap items-end gap-3 border border-white/[0.06] bg-zinc-900/20 p-4">
        <label className="text-[11px] text-zinc-500">
          User ID (UUID)
          <input
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            placeholder="00000000-0000-0000-0000-000000000000"
            className="mt-1 block w-72 max-w-full rounded border border-white/[0.08] bg-[#1a1a19] px-2 py-1.5 font-mono text-[11px] text-zinc-200"
          />
        </label>
        <label className="text-[11px] text-zinc-500">
          Role
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as "admin" | "operator")}
            className="mt-1 block rounded border border-white/[0.08] bg-[#1a1a19] px-2 py-1.5 text-[12px] text-zinc-200"
          >
            <option value="operator">operator</option>
            <option value="admin">admin</option>
          </select>
        </label>
        <button
          type="button"
          disabled={saving || !userId.trim()}
          onClick={() => void grant()}
          className={cn(
            "rounded border border-[#E8473F]/50 px-3 py-1.5 text-[12px] font-medium text-[#E8473F]",
            (saving || !userId.trim()) && "opacity-50",
          )}
        >
          Grant role
        </button>
      </div>

      {loadErr ? <p className="mt-4 text-[12px] text-[#E8473F]">{loadErr}</p> : null}

      <div className="mt-8 overflow-x-auto border border-white/[0.06]">
        <table className="w-full min-w-[520px] text-left text-[12px]">
          <thead>
            <tr className="border-b border-white/[0.06] text-[10px] uppercase tracking-wider text-zinc-600">
              <th className="px-3 py-2">User ID</th>
              <th className="px-3 py-2">Role</th>
              <th className="px-3 py-2">Granted</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {roles.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-8 text-center text-zinc-600">
                  No rows in depth4_user_roles. Grant roles here or enable BOOTSTRAP for one-time env seed.
                </td>
              </tr>
            ) : (
              roles.map((r) => (
                <tr key={`${r.userId}-${r.role}`} className="border-b border-white/[0.04]">
                  <td className="px-3 py-2 font-mono text-[11px] text-zinc-300">{r.userId}</td>
                  <td className="px-3 py-2 capitalize text-zinc-200">{r.role}</td>
                  <td className="px-3 py-2 font-mono text-[10px] text-zinc-500">{r.createdAt}</td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => void revoke(r.userId, r.role)}
                      className="text-[11px] text-zinc-500 hover:text-[#E8473F]"
                    >
                      Revoke
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="mt-6 text-[11px] text-zinc-600">
        <span className="font-semibold text-zinc-500">admin</span> — admin consoles + elevated.{" "}
        <span className="font-semibold text-zinc-500">operator</span> — elevated only. Production: leave{" "}
        <span className="font-mono">DEPTH4_ROLE_ENV_FALLBACK</span> and{" "}
        <span className="font-mono">DEPTH4_ROLE_ENV_BOOTSTRAP</span> unset or <span className="font-mono">0</span>.
      </p>
    </div>
  );
}

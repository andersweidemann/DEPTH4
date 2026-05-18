"use client";

import { useEffect, useState } from "react";
import { authFetch } from "@/lib/api";

export type Depth4PrivilegesClient = {
  roles: string[];
  isAdmin: boolean;
  isOperator: boolean;
  isElevated: boolean;
  source: string;
};

export function useDepth4Privileges() {
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(true);
  const [privileges, setPrivileges] = useState<Depth4PrivilegesClient | null>(null);

  useEffect(() => {
    void authFetch("/api/me/depth4-privileges")
      .then(async (res) => {
        if (!res.ok) {
          setDenied(true);
          return;
        }
        const j = (await res.json()) as Depth4PrivilegesClient & { ok?: boolean };
        if (j.ok === false) {
          setDenied(true);
          return;
        }
        setPrivileges({
          roles: j.roles ?? [],
          isAdmin: j.isAdmin === true,
          isOperator: j.isOperator === true,
          isElevated: j.isElevated === true,
          source: j.source ?? "none",
        });
        setDenied(false);
      })
      .finally(() => setLoading(false));
  }, []);

  return { loading, denied, privileges };
}

/** Admin-only console gate — uses GET /api/me/depth4-privileges (DB-backed). */
export function useDepth4AdminGate() {
  const { loading, denied, privileges } = useDepth4Privileges();
  return {
    loading,
    denied: denied || !privileges?.isAdmin,
    privileges,
  };
}

/** Elevated gate (admin or operator). */
export function useDepth4ElevatedGate() {
  const { loading, denied, privileges } = useDepth4Privileges();
  return {
    loading,
    denied: denied || !privileges?.isElevated,
    privileges,
  };
}

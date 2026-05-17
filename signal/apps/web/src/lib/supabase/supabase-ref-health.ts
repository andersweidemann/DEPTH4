import { normalizeSupabaseUrl } from "@/lib/supabase/env";

export type SupabaseRefHealthPayload = {
  supabase_url_host: string | null;
  supabase_project_ref: string | null;
  jwt_ref: string | null;
  user_id: string | null;
  has_session: boolean;
  env_present: {
    NEXT_PUBLIC_SUPABASE_URL: boolean;
    NEXT_PUBLIC_SUPABASE_ANON_KEY: boolean;
  };
};

export function supabaseEnvPresent(): SupabaseRefHealthPayload["env_present"] {
  return {
    NEXT_PUBLIC_SUPABASE_URL: Boolean((process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim()),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: Boolean((process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim()),
  };
}

/** Host + project ref from configured `NEXT_PUBLIC_SUPABASE_URL` (no secrets). */
export function supabaseHostAndRefFromConfiguredUrl(): {
  supabase_url_host: string | null;
  supabase_project_ref: string | null;
} {
  const normalized = normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  if (!normalized) {
    return { supabase_url_host: null, supabase_project_ref: null };
  }
  try {
    const host = new URL(normalized).hostname.toLowerCase();
    if (!host.endsWith(".supabase.co")) {
      return { supabase_url_host: host || null, supabase_project_ref: null };
    }
    const ref = host.slice(0, -".supabase.co".length);
    return {
      supabase_url_host: host,
      supabase_project_ref: ref || null,
    };
  } catch {
    return { supabase_url_host: null, supabase_project_ref: null };
  }
}

/** Decode `ref` from a Supabase user JWT payload only — no signature verification, no token echo. */
export function decodeJwtRef(token: string | null | undefined): string | null {
  const raw = (token ?? "").trim();
  if (!raw) return null;
  const parts = raw.split(".");
  if (parts.length !== 3) return null;
  try {
    const segment = parts[1]!;
    const padded = segment + "=".repeat((4 - (segment.length % 4)) % 4);
    const b64 = padded.replace(/-/g, "+").replace(/_/g, "/");
    const json = Buffer.from(b64, "base64").toString("utf8");
    const payload = JSON.parse(json) as { ref?: unknown };
    const ref = payload.ref;
    return typeof ref === "string" && ref.length > 0 ? ref : null;
  } catch {
    return null;
  }
}

export function buildSupabaseRefHealthPayload(input: {
  jwt_ref: string | null;
  user_id: string | null;
  has_session: boolean;
}): SupabaseRefHealthPayload {
  const { supabase_url_host, supabase_project_ref } = supabaseHostAndRefFromConfiguredUrl();
  return {
    supabase_url_host,
    supabase_project_ref,
    jwt_ref: input.jwt_ref,
    user_id: input.user_id,
    has_session: input.has_session,
    env_present: supabaseEnvPresent(),
  };
}

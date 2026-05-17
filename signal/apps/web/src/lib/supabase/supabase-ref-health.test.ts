import { afterEach, describe, expect, it } from "vitest";
import {
  buildSupabaseRefHealthPayload,
  decodeJwtRef,
  supabaseHostAndRefFromConfiguredUrl,
} from "@/lib/supabase/supabase-ref-health";

const SAMPLE_REF = "dfefddnpyrykfknbarvr";

function jwtWithRef(ref: string): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ ref, sub: "user-1", role: "authenticated" })).toString(
    "base64url",
  );
  return `${header}.${payload}.signature`;
}

describe("supabase-ref-health", () => {
  const prevUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const prevAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  afterEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = prevUrl;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = prevAnon;
  });

  it("extracts host and ref from normalized Supabase URL", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = `https://${SAMPLE_REF}.supabase.co/`;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "set";
    expect(supabaseHostAndRefFromConfiguredUrl()).toEqual({
      supabase_url_host: `${SAMPLE_REF}.supabase.co`,
      supabase_project_ref: SAMPLE_REF,
    });
  });

  it("decodeJwtRef returns ref without echoing the token", () => {
    const token = jwtWithRef(SAMPLE_REF);
    expect(decodeJwtRef(token)).toBe(SAMPLE_REF);
    expect(decodeJwtRef("not-a-jwt")).toBeNull();
  });

  it("buildSupabaseRefHealthPayload merges env, jwt, and session fields", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = `https://${SAMPLE_REF}.supabase.co`;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test.sig";
    const payload = buildSupabaseRefHealthPayload({
      jwt_ref: SAMPLE_REF,
      user_id: "uuid-1",
      has_session: true,
    });
    expect(payload.supabase_url_host).toBe(`${SAMPLE_REF}.supabase.co`);
    expect(payload.supabase_project_ref).toBe(SAMPLE_REF);
    expect(payload.jwt_ref).toBe(SAMPLE_REF);
    expect(payload.user_id).toBe("uuid-1");
    expect(payload.has_session).toBe(true);
    expect(payload.env_present.NEXT_PUBLIC_SUPABASE_URL).toBe(true);
    expect(payload.env_present.NEXT_PUBLIC_SUPABASE_ANON_KEY).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import { bearerTokenFromAuthHeader } from "./supabase-route-client";

describe("bearerTokenFromAuthHeader", () => {
  it("returns empty string when missing", () => {
    expect(bearerTokenFromAuthHeader(new Request("https://example.com/api/book"))).toBe("");
  });

  it("extracts Bearer token case-insensitively", () => {
    const req = new Request("https://example.com", {
      headers: { Authorization: "bearer eyJhbGci.test.token" },
    });
    expect(bearerTokenFromAuthHeader(req)).toBe("eyJhbGci.test.token");
  });
});

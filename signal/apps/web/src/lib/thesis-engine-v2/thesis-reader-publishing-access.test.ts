import { describe, expect, it } from "vitest";
import { canManageThesisReaderPublic } from "./thesis-reader-publishing-access";
import type { ThesisReaderPublicRow } from "./thesis-reader-public";

function row(overrides: Partial<ThesisReaderPublicRow> = {}): ThesisReaderPublicRow {
  return {
    id: "t1",
    slug: "example-thesis",
    reader_public_enabled: false,
    owner_user_id: null,
    thesis_origin: "seeded_system",
    ...overrides,
  };
}

const owner = { userId: "user-a", isElevated: false };
const other = { userId: "user-b", isElevated: false };
const elevated = { userId: "op-1", isElevated: true };

describe("thesis-reader-publishing-access", () => {
  it("owner can manage own user thesis", () => {
    const r = row({ owner_user_id: "user-a", thesis_origin: "user" });
    expect(canManageThesisReaderPublic(r, owner)).toBe(true);
    expect(canManageThesisReaderPublic(r, other)).toBe(false);
  });

  it("elevated user can manage owner thesis they do not own", () => {
    const r = row({ owner_user_id: "user-a", thesis_origin: "user" });
    expect(canManageThesisReaderPublic(r, elevated)).toBe(true);
  });

  it("ordinary user cannot manage catalog thesis", () => {
    const r = row({ owner_user_id: null, thesis_origin: "seeded_system" });
    expect(canManageThesisReaderPublic(r, owner)).toBe(false);
    expect(canManageThesisReaderPublic(r, other)).toBe(false);
  });

  it("elevated user can manage catalog thesis", () => {
    const r = row({ owner_user_id: null, thesis_origin: "seeded_system" });
    expect(canManageThesisReaderPublic(r, elevated)).toBe(true);
  });

  it("ordinary user cannot manage owner-less AI thesis", () => {
    const r = row({ owner_user_id: null, thesis_origin: "ai_generated" });
    expect(canManageThesisReaderPublic(r, other)).toBe(false);
  });

  it("elevated user can manage owner-less AI thesis", () => {
    const r = row({ owner_user_id: null, thesis_origin: "ai_generated" });
    expect(canManageThesisReaderPublic(r, elevated)).toBe(true);
  });
});

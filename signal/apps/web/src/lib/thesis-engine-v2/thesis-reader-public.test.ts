import { describe, expect, it } from "vitest";
import { canManageThesisReaderPublic, isThesisReaderSharePath } from "./thesis-reader-public";
import type { ThesisReaderPublicRow } from "./thesis-reader-public";

describe("thesis-reader-public", () => {
  it("detects reader share paths for middleware", () => {
    expect(isThesisReaderSharePath("/theses/foo/read")).toBe(true);
    expect(isThesisReaderSharePath("/theses/foo/read/opengraph-image")).toBe(true);
    expect(isThesisReaderSharePath("/theses/foo")).toBe(false);
    expect(isThesisReaderSharePath("/theses/foo/debug")).toBe(false);
  });

  it("allows owner to manage user thesis", () => {
    const row: ThesisReaderPublicRow = {
      id: "u1",
      slug: "my-thesis",
      reader_public_enabled: false,
      owner_user_id: "user-a",
      thesis_origin: "user",
    };
    expect(canManageThesisReaderPublic(row, "user-a")).toBe(true);
    expect(canManageThesisReaderPublic(row, "user-b")).toBe(false);
  });

  it("allows authenticated catalog manage for seeded system rows", () => {
    const row: ThesisReaderPublicRow = {
      id: "th-hormuz",
      slug: "strait-hormuz-oil-long",
      reader_public_enabled: false,
      owner_user_id: null,
      thesis_origin: "seeded_system",
    };
    expect(canManageThesisReaderPublic(row, "any-user")).toBe(true);
  });
});

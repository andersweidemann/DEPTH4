import { describe, expect, it } from "vitest";
import { isThesisReaderSharePath } from "./thesis-reader-public";

describe("thesis-reader-public paths", () => {
  it("detects reader share paths for middleware", () => {
    expect(isThesisReaderSharePath("/theses/foo/read")).toBe(true);
    expect(isThesisReaderSharePath("/theses/foo/read/opengraph-image")).toBe(true);
    expect(isThesisReaderSharePath("/theses/foo")).toBe(false);
    expect(isThesisReaderSharePath("/theses/foo/debug")).toBe(false);
  });
});

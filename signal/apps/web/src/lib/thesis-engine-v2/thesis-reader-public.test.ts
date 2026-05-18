import { describe, expect, it } from "vitest";
import {
  isPublicReaderViewApiPath,
  isThesisReaderSharePath,
} from "./thesis-reader-public";

describe("thesis-reader-public paths", () => {
  it("detects reader share paths for middleware", () => {
    expect(isThesisReaderSharePath("/theses/foo/read")).toBe(true);
    expect(isThesisReaderSharePath("/theses/foo/read/opengraph-image")).toBe(true);
    expect(isThesisReaderSharePath("/theses/foo")).toBe(false);
    expect(isThesisReaderSharePath("/theses/foo/debug")).toBe(false);
  });

  it("detects public reader-view API path", () => {
    expect(isPublicReaderViewApiPath("/api/theses/foo/reader-view")).toBe(true);
    expect(isPublicReaderViewApiPath("/api/theses/foo/reader-public")).toBe(false);
  });
});

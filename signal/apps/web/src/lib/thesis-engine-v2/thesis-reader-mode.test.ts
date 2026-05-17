import { describe, expect, it } from "vitest";
import {
  isThesisReaderViewSearchParam,
  thesisReaderPath,
  thesisReaderUrl,
  THESIS_READER_VIEW_VALUE,
} from "./thesis-reader-mode";

describe("thesis-reader-mode", () => {
  it("builds stable read paths", () => {
    expect(thesisReaderPath("oil-supply-shock")).toBe("/theses/oil-supply-shock/read");
    expect(thesisReaderUrl("x", "https://depth4.com")).toBe("https://depth4.com/theses/x/read");
  });

  it("detects reader search param", () => {
    expect(isThesisReaderViewSearchParam(THESIS_READER_VIEW_VALUE)).toBe(true);
    expect(isThesisReaderViewSearchParam("full")).toBe(false);
    expect(isThesisReaderViewSearchParam(null)).toBe(false);
  });
});

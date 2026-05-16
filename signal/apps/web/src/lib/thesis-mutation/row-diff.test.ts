import { describe, expect, it } from "vitest";
import { rowFieldDiff } from "@/lib/thesis-mutation/row-diff";

describe("rowFieldDiff", () => {
  it("returns only changed fields from the first row", () => {
    const oldRow = { status: "forming", title: "A", slug: "same" };
    const newRow = { status: "ready", title: "A", slug: "same" };
    expect(rowFieldDiff(oldRow, newRow)).toEqual({ status: "forming" });
    expect(rowFieldDiff(newRow, oldRow)).toEqual({ status: "ready" });
  });
});

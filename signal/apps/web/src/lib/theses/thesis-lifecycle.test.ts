import { describe, expect, it } from "vitest";
import {
  effectiveLifecycleState,
  isTerminalThesis,
  parseLifecycleState,
} from "@/lib/theses/thesis-lifecycle";

describe("thesis-lifecycle", () => {
  it("isTerminalThesis: lifecycle_state wins over non-terminal status", () => {
    expect(isTerminalThesis({ lifecycle_state: "archived", status: "ready" })).toBe(true);
    expect(isTerminalThesis({ lifecycle_state: "invalidated", status: "active" })).toBe(true);
    expect(isTerminalThesis({ lifecycle_state: "live", status: "resolved" })).toBe(false);
  });

  it("effectiveLifecycleState falls back to status when lifecycle_state absent", () => {
    expect(effectiveLifecycleState({ status: "forming" })).toBe("discovered");
    expect(effectiveLifecycleState({ status: "resolved" })).toBe("resolved");
    expect(parseLifecycleState("archived")).toBe("archived");
  });
});

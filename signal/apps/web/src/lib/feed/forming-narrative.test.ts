import { describe, expect, it } from "vitest";
import type { MacroEventReasoning } from "@/lib/macro-reasoning/schema";
import { formingNarrativeLineFromMacro } from "@/lib/feed/forming-narrative";

describe("formingNarrativeLineFromMacro", () => {
  it("prefers thesis_trade_line over short event summary", () => {
    const line = formingNarrativeLineFromMacro({
      thesis_trade_line: "Crude may keep a geopolitical premium while Hormuz risk stays two-way.",
      event_summary: "Oil moved on headlines.",
    } as unknown as MacroEventReasoning);
    expect(line).toContain("Hormuz");
  });

  it("falls back to event_summary when trade line empty", () => {
    const line = formingNarrativeLineFromMacro({
      thesis_trade_line: "",
      event_summary: "Durable goods surprised to the upside.",
    } as unknown as MacroEventReasoning);
    expect(line).toContain("Durable");
  });
});

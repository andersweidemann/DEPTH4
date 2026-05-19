import { describe, expect, it } from "vitest";
import { extractJsonFromLlmText } from "@/lib/ai/parse-llm-json";
import {
  cleanMessyBrokenToTriple,
  normalizeRemodelPayload,
  normalizeScenarioTriple,
  tripleToCleanMessyBroken,
} from "@/lib/thesis/remodel-scenarios";

describe("remodel-scenarios", () => {
  it("normalizes scenario triples to sum 100", () => {
    const n = normalizeScenarioTriple({ clean: 50, messy: 30, broken: 30 });
    expect(n.clean + n.messy + n.broken).toBe(100);
    expect(n.clean).toBeGreaterThanOrEqual(5);
    expect(n.broken).toBeGreaterThanOrEqual(5);
  });

  it("maps clean/messy/broken to bull/base/bear", () => {
    const t = cleanMessyBrokenToTriple({ clean: 40, messy: 35, broken: 25 });
    expect(t).toEqual({ bull: 40, base: 35, bear: 25 });
    expect(tripleToCleanMessyBroken(t)).toEqual({ clean: 40, messy: 35, broken: 25 });
  });

  it("normalizes snake_case remodel JSON from Kimi", () => {
    const n = normalizeRemodelPayload({
      scenarios: { clean: { probability: 45 }, messy: { probability: 35 }, broken: { probability: 20 } },
      trade_plan: { entry_zone: "$78-80", stop_loss: "$72", target_price: "$88" },
    });
    expect(n?.scenarios?.clean?.probability).toBe(45);
    expect(n?.tradePlan?.entryZone).toBe("$78-80");
  });

  it("extracts trailing JSON after Kimi-style reasoning text", () => {
    const raw = extractJsonFromLlmText(
      'Thinking…\n\n```json\n{"scenarios":{"clean":{"probability":50}}}\n```',
    );
    expect(raw).toEqual({ scenarios: { clean: { probability: 50 } } });
  });

  it("parses root remodel JSON instead of nested tradePlan only", () => {
    const kimi =
      '{"scenarios":{"clean":35,"messy":45,"broken":20},"tradePlan":{"entryZone":"79-80","stopLoss":82.3,"targetPrice":74},"confidenceDelta":-12,"whatChanged":"updated"}';
    const raw = extractJsonFromLlmText(kimi);
    expect(normalizeRemodelPayload(raw)?.scenarios?.clean?.probability).toBe(35);
    expect(normalizeRemodelPayload(raw)?.tradePlan?.entryZone).toBe("79-80");
  });
});

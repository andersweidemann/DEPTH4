import { describe, expect, it } from "vitest";
import { buildThesisAlertFromRemodelNotification } from "@/lib/thesis-engine-v2/thesis-alert-from-remodel-notification";
import { remodelNotificationAlertKey } from "@/lib/thesis/remodel-notifications";

describe("buildThesisAlertFromRemodelNotification", () => {
  it("maps title, body, and probability shift like evidence alerts", () => {
    const alert = buildThesisAlertFromRemodelNotification({
      id: "n1",
      created_at: "2026-05-19T12:00:00.000Z",
      thesis_id: "t1",
      title: "Short WTI on ceasefire risk",
      body: "Ceasefire odds rose; clean path down, messy chop up.",
      read_at: null,
      dismissed_at: null,
      metadata: {
        scenario_probabilities_before: { base: 40, bull: 35, bear: 25 },
        scenario_probabilities_after: { base: 30, bull: 30, bear: 40 },
        probability_diffs: {
          clean: { before: 40, after: 30 },
          messy: { before: 35, after: 30 },
          broken: { before: 25, after: 40 },
        },
      },
    });

    expect(alert.id).toBe(remodelNotificationAlertKey("n1"));
    expect(alert.thesisTitle).toBe("Short WTI on ceasefire risk");
    expect(alert.type).toBe("probability_change");
    expect(alert.confirmText).toContain("→");
    expect(alert.consequenceText).toContain("Ceasefire odds rose");
    expect(alert.impact).toBe("major_negative");
  });
});

"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { maxScenarioDelta } from "@/lib/ai/resolution-probability-update";
import type { DbScenarioTriple } from "@/lib/thesis-engine-v2/thesis-display-scenarios";
import { createClient } from "@/lib/supabase/client";

const TOAST_DELTA_MIN = 5;
const SEEN_MAX = 200;

function parseTriple(raw: unknown): DbScenarioTriple | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const base = Number(o.base);
  const bull = Number(o.bull);
  const bear = Number(o.bear);
  if (![base, bull, bear].every((n) => Number.isFinite(n))) return null;
  return { base: Math.round(base), bull: Math.round(bull), bear: Math.round(bear) };
}

function shouldToastRow(payload: {
  change_type?: string;
  metadata?: Record<string, unknown>;
}): { show: boolean; whatChanged: string; slug: string | null; delta: number } {
  const changeType = String(payload.change_type ?? "");
  if (changeType !== "scenario_shift" && changeType !== "evidence") {
    return { show: false, whatChanged: "", slug: null, delta: 0 };
  }

  const meta = payload.metadata ?? {};
  const whatChanged = typeof meta.what_changed === "string" ? meta.what_changed.trim() : "";
  if (!whatChanged) return { show: false, whatChanged: "", slug: null, delta: 0 };

  const before = parseTriple(meta.scenario_probabilities_before);
  const after = parseTriple(meta.scenario_probabilities_after);
  if (!before || !after) return { show: false, whatChanged: "", slug: null, delta: 0 };

  const delta = maxScenarioDelta(before, after);
  const oldTp = meta.old_trade_plan as Record<string, unknown> | undefined;
  const newTp = meta.new_trade_plan as Record<string, unknown> | undefined;
  const levelsChanged =
    oldTp &&
    newTp &&
    (String(oldTp.entryZone) !== String(newTp.entryZone) ||
      String(oldTp.stopLoss) !== String(newTp.stopLoss) ||
      String(oldTp.targetPrice) !== String(newTp.targetPrice));
  if (delta < TOAST_DELTA_MIN && !levelsChanged) return { show: false, whatChanged: "", slug: null, delta: 0 };

  const slug =
    typeof meta.thesis_slug === "string" && meta.thesis_slug.trim() ? meta.thesis_slug.trim() : null;

  return { show: true, whatChanged, slug, delta };
}

/** Realtime toasts when scenario paths shift ≥5% after evidence-driven updates. */
export function useThesisUpdateToasts() {
  const seenIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("thesis-updates-toasts")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "thesis_updates" },
        (payload) => {
          const row = payload.new as {
            id?: string;
            change_type?: string;
            metadata?: Record<string, unknown>;
          };
          const id = String(row.id ?? "");
          if (!id || seenIds.current.has(id)) return;

          const { show, whatChanged, slug, delta } = shouldToastRow(row);
          if (!show) return;

          seenIds.current.add(id);
          if (seenIds.current.size > SEEN_MAX) {
            const first = seenIds.current.values().next().value;
            if (first) seenIds.current.delete(first);
          }

          const href = slug ? `/theses/${encodeURIComponent(slug)}` : null;
          toast("Thesis paths shifted", {
            description: whatChanged,
            duration: 12_000,
            action: href
              ? {
                  label: "Open thesis",
                  onClick: () => {
                    window.location.href = href;
                  },
                }
              : undefined,
          });

          if (process.env.NODE_ENV === "development") {
            console.log("[thesis-update-toast]", { id, delta, slug });
          }
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);
}

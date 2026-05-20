"use client";

import { closeReasonLabel, isCloseReason } from "@/lib/thesis-engine-v2/close-reason";
import type { CloseReason, Position, TradeStatus } from "@/lib/thesis-engine-v2/types";

const KEY = "depth4.v2.positions.v1";
const LEGACY_SESSION_KEY = KEY;

/** Fired on same-tab session writes so Book header + lists stay in sync. */
export const DEPTH4_POSITIONS_CHANGED = "depth4:positions-changed";

function safeParse(raw: string | null): unknown {
  try {
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function isTradeStatus(x: unknown): x is TradeStatus {
  return x === "draft" || x === "open" || x === "closed" || x === "stopped" || x === "cancelled";
}

function isPosition(x: unknown): x is Position {
  if (!x || typeof x !== "object") return false;
  const p = x as Record<string, unknown>;
  if (
    typeof p.id !== "string" ||
    typeof p.symbol !== "string" ||
    (p.side !== "long" && p.side !== "short") ||
    typeof p.linkedThesisId !== "string" ||
    typeof p.openedAt !== "string" ||
    !isTradeStatus(p.tradeStatus)
  ) {
    return false;
  }
  if (p.closeReason !== undefined && !isCloseReason(p.closeReason)) return false;
  if (p.exitPrice !== undefined && (typeof p.exitPrice !== "number" || Number.isNaN(p.exitPrice))) return false;
  if (p.realizedPnlNumeric !== undefined && (typeof p.realizedPnlNumeric !== "number" || Number.isNaN(p.realizedPnlNumeric)))
    return false;
  if (p.unrealizedPnlNumeric !== undefined && (typeof p.unrealizedPnlNumeric !== "number" || Number.isNaN(p.unrealizedPnlNumeric)))
    return false;
  return true;
}

function readPositionsRaw(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(KEY) ?? window.sessionStorage.getItem(LEGACY_SESSION_KEY);
}

export function loadPositions(): Position[] {
  if (typeof window === "undefined") return [];
  const parsed = safeParse(readPositionsRaw());
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(isPosition);
}

export type SavePositionsOptions = { /** Skip PATCH to `depth4_user_book` (e.g. when applying server hydration). */ skipRemote?: boolean };

export function savePositions(next: Position[], opts?: SavePositionsOptions) {
  if (typeof window === "undefined") return;
  try {
    const json = JSON.stringify(next);
    window.localStorage.setItem(KEY, json);
    window.sessionStorage.removeItem(LEGACY_SESSION_KEY);
    window.dispatchEvent(new CustomEvent(DEPTH4_POSITIONS_CHANGED));
  } catch {
    // ignore
  }
  if (!opts?.skipRemote) {
    void import("@/lib/thesis-engine-v2/depth4-book-positions-persist").then((m) => {
      void m.flushBookPositionsImmediately();
      m.schedulePersistBookPositionsDebounced();
    });
  }
}

export function upsertPosition(pos: Position): Position[] {
  const cur = loadPositions();
  const idx = cur.findIndex((p) => p.id === pos.id);
  const next = idx >= 0 ? [...cur.slice(0, idx), pos, ...cur.slice(idx + 1)] : [pos, ...cur];
  savePositions(next);
  return next;
}

export function positionsForThesis(thesisId: string): Position[] {
  return loadPositions().filter((p) => p.linkedThesisId === thesisId);
}

export function openPositionForThesis(thesisId: string): Position | null {
  return loadPositions().find((p) => p.linkedThesisId === thesisId && p.tradeStatus === "open") ?? null;
}

export function latestClosedForThesis(thesisId: string): Position | null {
  const settled = loadPositions().filter((p) => p.linkedThesisId === thesisId && (p.tradeStatus === "closed" || p.tradeStatus === "stopped"));
  if (!settled.length) return null;
  settled.sort((a, b) => (b.closedAt ?? "").localeCompare(a.closedAt ?? ""));
  return settled[0] ?? null;
}

export type ClosePositionInput = {
  exitPrice: number;
  realizedPnlNumeric: number;
  closeReason: CloseReason;
};

export function closePosition(id: string, input: ClosePositionInput): Position | null {
  const cur = loadPositions();
  const p = cur.find((x) => x.id === id);
  if (!p || p.tradeStatus !== "open") return null;

  const closedAt = new Date().toISOString();
  const sign = input.realizedPnlNumeric >= 0 ? "+" : "";
  const realizedPnl = `${sign}${input.realizedPnlNumeric.toFixed(2)}`;
  const reasonLine = closeReasonLabel(input.closeReason);

  const next: Position = {
    ...p,
    tradeStatus: "closed",
    closedAt,
    exitPrice: input.exitPrice,
    closeReason: input.closeReason,
    realizedPnlNumeric: input.realizedPnlNumeric,
    realizedPnl,
    currentPnl: undefined,
    latestUpdate: [
      `Position closed (${reasonLine}).`,
      `Exit ${input.exitPrice} · Realized ${realizedPnl} (%).`,
      `Thesis link kept so you can compare outcome to the idea.`,
    ].join(" "),
  };

  upsertPosition(next);
  return next;
}


"use client";

import type { Position, TradeStatus } from "@/lib/thesis-engine-v2/types";

const KEY = "depth4.v2.positions.v1";

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
  return (
    typeof p.id === "string" &&
    typeof p.symbol === "string" &&
    (p.side === "long" || p.side === "short") &&
    typeof p.linkedThesisId === "string" &&
    typeof p.openedAt === "string" &&
    isTradeStatus(p.tradeStatus)
  );
}

export function loadPositions(): Position[] {
  if (typeof window === "undefined") return [];
  const raw = window.sessionStorage.getItem(KEY);
  const parsed = safeParse(raw);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(isPosition);
}

export function savePositions(next: Position[]) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // ignore
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


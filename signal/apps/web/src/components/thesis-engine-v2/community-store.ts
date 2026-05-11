"use client";

/**
 * Community “follow” toggles are **sessionStorage-only** by product choice: lightweight demo UX,
 * not account-backed social graph. If follows must survive logout/devices, add a Supabase table +
 * hydrate/write-through similar to `thesis_stars`.
 */
const FOLLOW_KEY = "depth4.v2.community.followed.v1";

function readSet(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.sessionStorage.getItem(FOLLOW_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.filter((x) => typeof x === "string") as string[]);
  } catch {
    return new Set();
  }
}

function writeSet(s: Set<string>) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(FOLLOW_KEY, JSON.stringify(Array.from(s)));
  } catch {
    // ignore
  }
}

export function isFollowed(id: string): boolean {
  return readSet().has(id);
}

export function toggleFollow(id: string): boolean {
  const s = readSet();
  if (s.has(id)) s.delete(id);
  else s.add(id);
  writeSet(s);
  return s.has(id);
}


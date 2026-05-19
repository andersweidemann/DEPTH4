/** Normalize prose for duplicate detection (statement vs market misread). */
export function normalizeThesisProse(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

export function thesisProseEquals(a: string, b: string): boolean {
  const na = normalizeThesisProse(a);
  const nb = normalizeThesisProse(b);
  if (!na || !nb) return false;
  return na === nb;
}

export function truncateToMaxWords(text: string, maxWords: number): string {
  const t = text.trim();
  if (!t || maxWords < 1) return "";
  const words = t.split(/\s+/);
  if (words.length <= maxWords) return t;
  return `${words.slice(0, maxWords).join(" ")}…`;
}

/** Keep the first N sentence-like segments (splits on `.` `!` `?` followed by space). */
export function truncateToMaxSentences(text: string, maxSentences: number): string {
  const t = text.trim();
  if (!t || maxSentences < 1) return "";
  const parts = t.split(/(?<=[.!?])\s+/).map((p) => p.trim()).filter(Boolean);
  if (parts.length <= maxSentences) return t;
  return parts.slice(0, maxSentences).join(" ");
}

/** Above-fold blocks: ~2–3 sentences or word cap. */
export function retailDetailSnippet(text: string, opts?: { maxSentences?: number; maxWords?: number }): string {
  const maxSentences = opts?.maxSentences ?? 3;
  const maxWords = opts?.maxWords ?? 55;
  const bySentence = truncateToMaxSentences(text, maxSentences);
  return truncateToMaxWords(bySentence, maxWords);
}

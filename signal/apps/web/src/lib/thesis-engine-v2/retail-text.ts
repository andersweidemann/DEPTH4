/** Keep retail thesis copy scannable — one idea per sentence. */
export function truncateToMaxWords(text: string, maxWords = 25): string {
  const t = text.trim();
  if (!t) return "";
  const words = t.split(/\s+/);
  if (words.length <= maxWords) return t;
  return `${words.slice(0, maxWords).join(" ")}…`;
}

/** Truncate each sentence in a paragraph to maxWords. */
export function clampParagraphSentences(text: string, maxWordsPerSentence = 25): string {
  const t = text.trim();
  if (!t) return "";
  const parts = t.split(/(?<=[.!?])\s+/);
  return parts
    .map((s) => truncateToMaxWords(s, maxWordsPerSentence))
    .filter(Boolean)
    .join(" ");
}

export function normalizeComparableText(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

export function textsAreEquivalent(a: string, b: string): boolean {
  const x = normalizeComparableText(a);
  const y = normalizeComparableText(b);
  if (!x || !y) return false;
  return x === y || x.includes(y) || y.includes(x);
}

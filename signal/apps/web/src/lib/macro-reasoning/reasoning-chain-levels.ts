/**
 * Parses reasoning_chain text when the model uses DEPTH4 four-level headers.
 * Legacy rows without "LEVEL 1 (...)" fall back to a single block.
 */

export type ReasoningLevelBlock = {
  num: string;
  label: string;
  body: string;
};

const CHUNK_HEAD = /^LEVEL\s*(\d)\s*\(([^)]+)\)\s*:\s*([\s\S]*)$/i;

/** Find start indices of each "LEVEL n (" at line start (or string start). */
function levelChunkStarts(text: string): number[] {
  const starts: number[] = [];
  const re = /(^|\n)\s*LEVEL\s*\d\s*\(/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const idx = m.index + (m[1] === "\n" ? 1 : 0);
    if (!starts.includes(idx)) starts.push(idx);
  }
  return starts.sort((a, b) => a - b);
}

/**
 * If the chain uses LEVEL 1–4 headers, return structured blocks; otherwise null.
 */
export function parseReasoningChainLevels(chain: string): ReasoningLevelBlock[] | null {
  const t = chain.trim();
  if (!t) return null;
  const starts = levelChunkStarts(t);
  if (starts.length === 0) return null;

  const chunks: string[] = [];
  for (let i = 0; i < starts.length; i++) {
    const a = starts[i];
    const b = i + 1 < starts.length ? starts[i + 1] : t.length;
    chunks.push(t.slice(a, b).trim());
  }

  const blocks: ReasoningLevelBlock[] = [];
  for (const chunk of chunks) {
    const m = chunk.match(CHUNK_HEAD);
    if (!m) return null;
    const body = m[3].trim();
    if (!body) return null;
    blocks.push({ num: m[1], label: m[2].trim(), body });
  }

  return blocks.length ? blocks : null;
}

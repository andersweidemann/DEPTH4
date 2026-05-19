/** Walk from `{` at `start` and return index of matching `}`, or -1. */
function indexOfMatchingBraceClose(body: string, start: number): number {
  if (body[start] !== "{") return -1;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < body.length; i++) {
    const ch = body[i];
    if (inString) {
      if (escape) escape = false;
      else if (ch === "\\") escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function tryParseJsonSlice(body: string, start: number): unknown | null {
  const end = indexOfMatchingBraceClose(body, start);
  if (end < 0) return null;
  try {
    return JSON.parse(body.slice(start, end + 1));
  } catch {
    return null;
  }
}

/** Extract a JSON object from model text (fences, thinking wrappers, trailing answer). */
export function extractJsonFromLlmText(text: string): unknown | null {
  const trimmed = text.trim();
  const fenceRe = /```(?:json)?\s*([\s\S]*?)```/gi;
  const fencedInners: string[] = [];
  let fenceMatch: RegExpExecArray | null;
  while ((fenceMatch = fenceRe.exec(trimmed)) !== null) {
    fencedInners.push(fenceMatch[1].trim());
  }
  for (let i = fencedInners.length - 1; i >= 0; i--) {
    const inner = fencedInners[i];
    const start = inner.indexOf("{");
    if (start >= 0) {
      const parsed = tryParseJsonSlice(inner, start);
      if (parsed) return parsed;
    }
  }

  const body = trimmed;
  if (body.startsWith("{")) {
    const root = tryParseJsonSlice(body, 0);
    if (root) return root;
  }

  const starts: number[] = [];
  for (let i = 0; i < body.length; i++) {
    if (body[i] === "{") starts.push(i);
  }
  for (let k = 0; k < starts.length; k++) {
    const parsed = tryParseJsonSlice(body, starts[k]);
    if (parsed) return parsed;
  }
  return null;
}

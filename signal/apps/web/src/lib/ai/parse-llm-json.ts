/** Extract first JSON object from model text (handles optional markdown fences). */
export function extractJsonFromLlmText(text: string): unknown | null {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced?.[1]?.trim() ?? trimmed;
  const jsonStart = body.indexOf("{");
  const jsonEnd = body.lastIndexOf("}");
  if (jsonStart < 0 || jsonEnd <= jsonStart) return null;
  try {
    return JSON.parse(body.slice(jsonStart, jsonEnd + 1));
  } catch {
    return null;
  }
}

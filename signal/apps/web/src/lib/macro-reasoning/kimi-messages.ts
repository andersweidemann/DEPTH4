/**
 * Moonshot Kimi — OpenAI-compatible chat/completions (mirrors apps/api llm_client).
 */

export type KimiChatResult = {
  text: string;
  raw: unknown;
};

/** Kimi K2.x models on Moonshot only accept temperature = 1. */
export function resolveKimiTemperature(model: string, requested?: number): number {
  const m = model.toLowerCase();
  if (m.includes("k2") || m.includes("kimi-k2")) return 1;
  return requested ?? 0.2;
}

export function isKimiK2Model(model: string): boolean {
  const m = model.toLowerCase();
  return m.includes("k2") || m.includes("kimi-k2");
}

/**
 * kimi-k2.6 defaults to thinking enabled — JSON pipelines should disable it so
 * the answer lands in `message.content` (see Kimi API `thinking.type`).
 */
export function kimiK2ThinkingBody(
  model: string,
  mode: "enabled" | "disabled",
): Record<string, unknown> {
  if (!isKimiK2Model(model)) return {};
  return { thinking: { type: mode } };
}

export async function kimiChatCompletions(params: {
  apiKey: string;
  baseUrl: string;
  model: string;
  maxTokens: number;
  system: string;
  user: string;
  temperature?: number;
  /** When true, send `thinking: { type: "disabled" }` for K2 models (structured JSON). */
  disableThinking?: boolean;
}): Promise<KimiChatResult> {
  const base = params.baseUrl.replace(/\/$/, "");
  const url = `${base}/chat/completions`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${params.apiKey}`,
    },
    body: JSON.stringify({
      model: params.model,
      max_tokens: params.maxTokens,
      temperature: resolveKimiTemperature(params.model, params.temperature),
      ...kimiK2ThinkingBody(params.model, params.disableThinking ? "disabled" : "enabled"),
      messages: [
        { role: "system", content: params.system },
        { role: "user", content: params.user },
      ],
    }),
  });

  const raw: unknown = await res.json().catch(() => ({}));
  if (!res.ok) {
    const snippet =
      typeof raw === "object" && raw !== null
        ? JSON.stringify(raw).slice(0, 800)
        : String(raw).slice(0, 800);
    throw new Error(`kimi_chat_http_${res.status}: ${snippet}`);
  }

  if (typeof raw !== "object" || raw === null) {
    throw new Error("kimi_chat_invalid_shape");
  }
  const choices = (raw as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || !choices[0]) {
    throw new Error("kimi_chat_missing_choices");
  }
  const message = (choices[0] as { message?: Record<string, unknown> }).message;
  const text = extractKimiMessageText(message);
  return { text, raw };
}

/** Kimi K2 may return string content, part arrays, or reasoning fields — collect all text for JSON parse. */
export function extractKimiMessageText(message: Record<string, unknown> | undefined): string {
  if (!message) return "";
  const parts: string[] = [];
  const push = (v: unknown) => {
    if (typeof v === "string" && v.trim()) parts.push(v.trim());
  };
  push(message.content);
  push(message.reasoning_content);
  push(message.reasoning);
  const content = message.content;
  if (Array.isArray(content)) {
    for (const part of content) {
      if (typeof part === "string") push(part);
      else if (part && typeof part === "object") {
        const p = part as Record<string, unknown>;
        push(p.text);
        push(p.content);
      }
    }
  }
  return parts.join("\n\n");
}

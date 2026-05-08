/**
 * Minimal Anthropic Messages API client for server-side cron routes.
 */

const ANTHROPIC_VERSION = "2023-06-01";

export type AnthropicMessagesResult = {
  text: string;
  raw: unknown;
};

export async function anthropicMessages(params: {
  apiKey: string;
  model: string;
  maxTokens: number;
  system: string;
  user: string;
}): Promise<AnthropicMessagesResult> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": params.apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model: params.model,
      max_tokens: params.maxTokens,
      system: params.system,
      messages: [{ role: "user", content: params.user }],
    }),
  });

  const raw: unknown = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      typeof raw === "object" && raw !== null && "error" in raw
        ? JSON.stringify((raw as { error?: unknown }).error)
        : JSON.stringify(raw);
    throw new Error(`anthropic_messages_http_${res.status}: ${msg}`);
  }

  if (typeof raw !== "object" || raw === null || !("content" in raw)) {
    throw new Error("anthropic_messages_invalid_shape");
  }
  const content = (raw as { content?: unknown }).content;
  if (!Array.isArray(content) || !content[0] || typeof (content[0] as { text?: unknown }).text !== "string") {
    throw new Error("anthropic_messages_missing_text");
  }
  const text = (content[0] as { text: string }).text;
  return { text, raw };
}

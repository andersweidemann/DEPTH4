/**
 * Minimal Anthropic Messages API client for server-side cron routes.
 */

const ANTHROPIC_VERSION = "2023-06-01";

export type AnthropicMessagesResult = {
  text: string;
  raw: unknown;
};

/** Parsed from Anthropic error JSON (`type: "error"` envelope or legacy shapes). */
export type AnthropicApiErrorFields = {
  httpStatus: number;
  requestId?: string;
  /** Anthropic `error.type`, e.g. `invalid_request_error`, `authentication_error`. */
  errorType?: string;
  /** Anthropic `error.message`. */
  errorMessage?: string;
  /** Short JSON snippet for logs (no secrets). */
  rawSnippet: string;
};

function snippetJson(value: unknown, maxLen: number): string {
  try {
    const s = JSON.stringify(value);
    return s.length <= maxLen ? s : `${s.slice(0, maxLen)}…`;
  } catch {
    return String(value).slice(0, maxLen);
  }
}

export function parseAnthropicErrorBody(raw: unknown, httpStatus: number): AnthropicApiErrorFields {
  let requestId: string | undefined;
  let errorType: string | undefined;
  let errorMessage: string | undefined;

  if (typeof raw === "object" && raw !== null) {
    const o = raw as Record<string, unknown>;
    if (typeof o.request_id === "string") requestId = o.request_id;
    const err = o.error;
    if (typeof err === "object" && err !== null) {
      const e = err as Record<string, unknown>;
      if (typeof e.type === "string") errorType = e.type;
      if (typeof e.message === "string") errorMessage = e.message;
    }
    if (!errorMessage && typeof o.message === "string") errorMessage = o.message;
  }

  return {
    httpStatus,
    requestId,
    errorType,
    errorMessage,
    rawSnippet: snippetJson(raw, 1200),
  };
}

/** Thrown when `POST /v1/messages` returns non-2xx; carries parsed Anthropic error fields for logging. */
export class AnthropicMessagesHttpError extends Error {
  readonly fields: AnthropicApiErrorFields;

  constructor(fields: AnthropicApiErrorFields) {
    const msg =
      fields.errorMessage && fields.errorType
        ? `anthropic_messages_http_${fields.httpStatus}: ${fields.errorType}: ${fields.errorMessage}`
        : `anthropic_messages_http_${fields.httpStatus}: ${fields.rawSnippet}`;
    super(msg);
    this.name = "AnthropicMessagesHttpError";
    this.fields = fields;
  }
}

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
    const fields = parseAnthropicErrorBody(raw, res.status);
    throw new AnthropicMessagesHttpError(fields);
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

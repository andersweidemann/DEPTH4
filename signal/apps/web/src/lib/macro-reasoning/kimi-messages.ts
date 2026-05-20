/**
 * Moonshot Kimi — OpenAI-compatible chat/completions (mirrors apps/api llm_client).
 */

import { extractJsonFromLlmText } from "@/lib/ai/parse-llm-json";
import { DEPTH4_PLATFORM_JSON_SYSTEM } from "@/lib/thesis-engine-v2/depth4-llm-system-prompt";
import {
  isKimiConfigured,
  normalizeKimiApiKey,
  resolveKimiBaseUrl,
  resolveKimiModel,
} from "@/lib/macro-reasoning/model-routing";

export type KimiChatResult = {
  text: string;
  raw: unknown;
};

/**
 * Kimi K2 temperature varies by endpoint/model (intl often 1; CN kimi-k2.6 may require 0.6).
 * Override with KIMI_TEMPERATURE in env when needed.
 */
export function resolveKimiTemperature(
  model: string,
  requested?: number,
  baseUrl?: string,
  options?: { disableThinking?: boolean },
): number {
  const cn = (baseUrl ?? "").includes("moonshot.cn");
  /** CN kimi-k2.6 + thinking disabled requires exactly 0.6 — overrides env and caller. */
  if (cn && options?.disableThinking) return 0.6;

  const envOverride = Number((process.env.KIMI_TEMPERATURE ?? "").trim());
  if (Number.isFinite(envOverride)) return envOverride;
  if (requested != null && Number.isFinite(requested)) return requested;
  const m = model.toLowerCase();
  if (m.includes("k2") || m.includes("kimi-k2")) return 1;
  return 0.2;
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
  /** When true, request `response_format: json_object` and parse `content` only. */
  jsonObjectMode?: boolean;
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
      temperature: resolveKimiTemperature(params.model, params.temperature, params.baseUrl, {
        disableThinking: params.disableThinking,
      }),
      ...kimiK2ThinkingBody(params.model, params.disableThinking ? "disabled" : "enabled"),
      ...(params.jsonObjectMode ? { response_format: { type: "json_object" } } : {}),
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
  const text = extractKimiMessageText(message, { contentOnly: params.jsonObjectMode === true });
  return { text, raw };
}

/** Kimi K2 may return string content, part arrays, or reasoning fields — collect all text for JSON parse. */
export function extractKimiMessageText(
  message: Record<string, unknown> | undefined,
  options?: { contentOnly?: boolean },
): string {
  if (!message) return "";
  if (options?.contentOnly) {
    const content = message.content;
    if (typeof content === "string") return content.trim();
    if (Array.isArray(content)) {
      return content
        .map((part) => {
          if (typeof part === "string") return part;
          if (part && typeof part === "object") {
            const p = part as Record<string, unknown>;
            return typeof p.text === "string" ? p.text : typeof p.content === "string" ? p.content : "";
          }
          return "";
        })
        .filter(Boolean)
        .join("\n")
        .trim();
    }
    return "";
  }
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

const KIMI_JSON_SYSTEM = DEPTH4_PLATFORM_JSON_SYSTEM;

/**
 * Kimi path for structured JSON (remodel, pipeline) — matches diagnostic script settings:
 * thinking disabled, json_object response_format, content-only parse.
 */
export async function completeKimiJsonObject(params: {
  system?: string;
  user: string;
  maxTokens: number;
}): Promise<unknown | null> {
  const apiKey = normalizeKimiApiKey(process.env.KIMI_API_KEY);
  if (!apiKey) throw new Error("KIMI_API_KEY not set");
  const baseUrl = resolveKimiBaseUrl();
  const model = resolveKimiModel();
  const { text } = await kimiChatCompletions({
    apiKey,
    baseUrl,
    model,
    maxTokens: params.maxTokens,
    system: params.system ?? KIMI_JSON_SYSTEM,
    user: params.user,
    disableThinking: true,
    jsonObjectMode: true,
  });
  console.log("[kimi-debug] request", {
    baseUrl,
    model,
    textLength: text.length,
  });
  console.log(`[kimi-debug] raw text: ${text.substring(0, 800)}`);
  const parsed = extractJsonFromLlmText(text);
  console.log(
    `[kimi-debug] parsed: ${parsed != null ? JSON.stringify(parsed).substring(0, 800) : "null"}`,
  );
  return parsed;
}

export function isKimiJsonConfigured(): boolean {
  return isKimiConfigured();
}

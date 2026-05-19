/**
 * NVIDIA NIM — OpenAI-compatible chat/completions (mirrors apps/api llm_client).
 */

export type NvidiaChatResult = {
  text: string;
  raw: unknown;
};

export async function nvidiaChatCompletions(params: {
  apiKey: string;
  baseUrl: string;
  model: string;
  maxTokens: number;
  system: string;
  user: string;
  temperature?: number;
}): Promise<NvidiaChatResult> {
  const base = params.baseUrl.replace(/\/$/, "");
  const url = `${base}/chat/completions`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${params.apiKey}`,
      accept: "application/json",
    },
    body: JSON.stringify({
      model: params.model,
      max_tokens: params.maxTokens,
      temperature: params.temperature ?? 0.2,
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
    throw new Error(`nvidia_chat_http_${res.status}: ${snippet}`);
  }

  if (typeof raw !== "object" || raw === null) {
    throw new Error("nvidia_chat_invalid_shape");
  }
  const choices = (raw as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || !choices[0]) {
    throw new Error("nvidia_chat_missing_choices");
  }
  const message = (choices[0] as { message?: { content?: unknown } }).message;
  const text = typeof message?.content === "string" ? message.content : "";
  return { text, raw };
}

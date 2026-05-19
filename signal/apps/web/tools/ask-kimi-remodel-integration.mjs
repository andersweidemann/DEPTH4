#!/usr/bin/env node
/**
 * Ask Kimi (Moonshot) how to integrate kimi-k2.6 for strict JSON remodel output.
 *
 * Usage (from signal/apps/web):
 *   KIMI_API_KEY=sk-... node tools/ask-kimi-remodel-integration.mjs
 *   node --env-file=../../../.env.local tools/ask-kimi-remodel-integration.mjs
 *   KIMI_BASE_URL=https://api.moonshot.ai/v1  # optional
 *   KIMI_MODEL=kimi-k2.6                       # optional
 */

const KIMI_API_KEY = (process.env.KIMI_API_KEY ?? "").trim().replace(/^Bearer\s+/i, "");
const KIMI_BASE_URL = (process.env.KIMI_BASE_URL ?? "https://api.moonshot.ai/v1").replace(/\/$/, "");
const KIMI_MODEL = (process.env.KIMI_MODEL ?? "kimi-k2.6").trim();

const DIAGNOSTIC_PROMPT = `We are integrating the Moonshot Kimi API (model kimi-k2.6) into a production fintech app (DEPTH4) on Vercel serverless. We call POST /v1/chat/completions with OpenAI-compatible JSON.

## Problem
Our "thesis remodel" job asks the model to return ONLY a single JSON object (scenario probabilities + trade plan levels). In production we often get \`llm_remodel_failed\` because our server cannot parse a usable JSON object from the response.

## Our current integration
- System message: "You output strict JSON only. No markdown fences or commentary outside the JSON object."
- User message: macro thesis context + required schema (scenarios.clean|messy|broken with probability + reasoning; tradePlan entryZone/stopLoss/targetPrice; confidenceDelta; whatChanged).
- We do NOT send response_format (we heard it may not be supported on kimi-k2.6).
- We read message.content and also message.reasoning_content / reasoning fields.
- We parse JSON with brace-matching from the combined text.
- Fallback chain: Kimi → NVIDIA NIM → Anthropic Haiku → Anthropic Opus.
- max_tokens: 720 (cheap) or 1200 (premium retry).
- temperature: 1 for K2 models (per your API constraints).

## Example schema we need (must be machine-parseable)
{
  "scenarios": {
    "clean": { "probability": 40, "reasoning": "..." },
    "messy": { "probability": 35, "reasoning": "..." },
    "broken": { "probability": 25, "reasoning": "..." }
  },
  "tradePlan": {
    "entryZone": "$78.50-80.50",
    "stopLoss": "$72.00",
    "targetPrice": "$88.00",
    "rationale": "..."
  },
  "confidenceDelta": -5,
  "whatChanged": "..."
}

## Questions for Moonshot / Kimi team
1. For kimi-k2.6, what is the recommended way to get reliable JSON-only output for automated parsing (no human in the loop)?
2. Should we set thinking.type to "disabled" for JSON tasks? What is the default, and where does the JSON appear when thinking is enabled — content vs reasoning_content?
3. Is response_format: { type: "json_object" } supported on kimi-k2.6 or any K2 model? If not, what is the official alternative?
4. Any required parameters (temperature, max_tokens, message format) we are violating for K2.6?
5. For serverless (60–120s timeout), what max_tokens and latency should we expect for ~600-token JSON responses?
6. Common failure modes (empty content, markdown fences, prose before JSON) and the official mitigation?

Please answer with concrete API request body examples for kimi-k2.6 that we can copy into our Node fetch() call.`;

async function callKimi(bodyExtra) {
  const url = `${KIMI_BASE_URL}/chat/completions`;
  const thinkingDisabled = bodyExtra?.thinking?.type === "disabled";
  const temperature =
    KIMI_BASE_URL.includes("moonshot.cn") && thinkingDisabled ? 0.6 : 1;
  const body = {
    model: KIMI_MODEL,
    max_tokens: 2048,
    temperature,
    messages: [
      {
        role: "system",
        content:
          "You are a Moonshot/Kimi API integration expert. Answer with specific API parameters and JSON examples.",
      },
      { role: "user", content: DIAGNOSTIC_PROMPT },
    ],
    ...bodyExtra,
  };
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${KIMI_API_KEY}`,
    },
    body: JSON.stringify(body),
  });
  const raw = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error("HTTP", res.status, JSON.stringify(raw, null, 2).slice(0, 2000));
    process.exit(1);
  }
  const msg = raw?.choices?.[0]?.message ?? {};
  const text = [msg.content, msg.reasoning_content, msg.reasoning]
    .filter((x) => typeof x === "string" && x.trim())
    .join("\n\n---\n\n");
  return { text, raw };
}

async function main() {
  if (!KIMI_API_KEY) {
    console.error("Set KIMI_API_KEY in the environment.");
    console.error("Or paste DIAGNOSTIC_PROMPT into https://platform.kimi.ai chat.");
    console.error("\n--- PROMPT TO PASTE ---\n");
    console.error(DIAGNOSTIC_PROMPT);
    process.exit(1);
  }

  console.log("Calling Kimi", KIMI_MODEL, "at", KIMI_BASE_URL, "\n");

  console.log("=== A) thinking ENABLED (default) ===\n");
  const a = await callKimi({ thinking: { type: "enabled" } });
  console.log(a.text.slice(0, 6000));
  console.log("\n(content length:", String(a.raw?.choices?.[0]?.message?.content ?? "").length);
  console.log(
    "reasoning_content length:",
    String(a.raw?.choices?.[0]?.message?.reasoning_content ?? "").length,
    ")\n",
  );

  console.log("=== B) thinking DISABLED ===\n");
  const b = await callKimi({ thinking: { type: "disabled" } });
  console.log(b.text.slice(0, 6000));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

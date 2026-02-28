import { sleep, isRetryableError, resolveBackoff, maxRetriesForStatus } from "./retry.js";
import logger from "../observability/logger.js";

const log = logger.child({ module: "gemini" });

const FETCH_TIMEOUT_MS = 15_000;
const FETCH_MAX_RETRIES = 3;
const FETCH_MAX_RETRIES_429 = 2;
const FETCH_BACKOFF_BASE_MS = 500;

const RETRYABLE_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);

const GEMINI_RESPONSE_SCHEMA = {
  type: "OBJECT",
  required: [
    "score",
    "confidence",
    "score_breakdown",
    "pros",
    "cons",
    "evidence",
    "rationale",
    "uncertainty_flags",
  ],
  properties: {
    score: { type: "NUMBER", minimum: 0, maximum: 100 },
    confidence: { type: "NUMBER", minimum: 0, maximum: 100 },
    score_breakdown: {
      type: "OBJECT",
      required: ["primary", "secondary", "tertiary"],
      properties: {
        primary: { type: "NUMBER", minimum: 0, maximum: 100 },
        secondary: { type: "NUMBER", minimum: 0, maximum: 100 },
        tertiary: { type: "NUMBER", minimum: 0, maximum: 100 },
      },
    },
    pros: { type: "ARRAY", maxItems: 5, items: { type: "STRING" } },
    cons: { type: "ARRAY", maxItems: 5, items: { type: "STRING" } },
    evidence: { type: "ARRAY", maxItems: 3, items: { type: "STRING" } },
    rationale: { type: "STRING" },
    uncertainty_flags: {
      type: "ARRAY",
      maxItems: 3,
      items: { type: "STRING" },
    },
  },
};

export async function callGemini({
  apiKey,
  model,
  prompt,
  seed = null,
  temperature = 0.2,
}) {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const maxAttempts = FETCH_MAX_RETRIES_429;

  const generationConfig = {
    temperature,
    responseMimeType: "application/json",
    responseSchema: GEMINI_RESPONSE_SCHEMA,
  };
  if (seed !== null) generationConfig.seed = seed;

  for (let attempt = 0; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          generationConfig,
          contents: [{ role: "user", parts: [{ text: prompt }] }],
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const detail = await res.text();
        const allowed = maxRetriesForStatus(res.status);
        if (attempt < allowed && RETRYABLE_STATUS_CODES.has(res.status)) {
          const backoffMs = resolveBackoff(res.status, attempt, res.headers);
          log.warn(
            { status: res.status, attempt: attempt + 1, backoffMs },
            "retrying after error",
          );
          await sleep(backoffMs);
          continue;
        }
        throw new Error(`LLM call failed (${res.status}): ${detail}`);
      }

      const json = await res.json();
      const parts = json?.candidates?.[0]?.content?.parts;
      const content = Array.isArray(parts)
        ? parts
            .map((part) => (typeof part?.text === "string" ? part.text : ""))
            .join("")
            .trim()
        : "";

      if (!content || typeof content !== "string") {
        throw new Error("LLM response missing message content");
      }
      return content;
    } catch (error) {
      if (attempt < FETCH_MAX_RETRIES && isRetryableError(error)) {
        const backoffMs = FETCH_BACKOFF_BASE_MS * 2 ** attempt;
        await sleep(backoffMs);
        continue;
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error("LLM call failed after retries");
}

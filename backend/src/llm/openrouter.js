import { sleep, isRetryableError, resolveBackoff, maxRetriesForStatus } from "./retry.js";
import logger from "../observability/logger.js";

const log = logger.child({ module: "openrouter" });

const FETCH_TIMEOUT_MS = 15_000;
const FETCH_MAX_RETRIES = 3;
const FETCH_MAX_RETRIES_429 = 2;
const FETCH_BACKOFF_BASE_MS = 500;

const RETRYABLE_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);

export async function callOpenRouter({
  apiKey,
  model,
  systemPrompt,
  userPrompt,
  seed = null,
  temperature = 0.2,
}) {
  const endpoint = "https://openrouter.ai/api/v1/chat/completions";
  const maxAttempts = FETCH_MAX_RETRIES_429;

  const body = {
    model,
    temperature,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  };
  if (seed !== null) body.seed = seed;

  for (let attempt = 0; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
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
      const content = json?.choices?.[0]?.message?.content?.trim() ?? "";
      if (!content) {
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

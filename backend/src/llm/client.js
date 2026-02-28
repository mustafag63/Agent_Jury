import { callGemini } from "./gemini.js";
import { callOpenRouter } from "./openrouter.js";
import logger from "../observability/logger.js";
import metrics from "../observability/metrics.js";

export async function callLLM({
  provider,
  apiKey,
  model,
  systemPrompt,
  userPrompt,
  seed = null,
  temperature = 0.2,
}) {
  if (provider === "openrouter") {
    return callOpenRouter({
      apiKey,
      model,
      systemPrompt,
      userPrompt,
      seed,
      temperature,
    });
  }
  const prompt = `${systemPrompt}\n\n${userPrompt}`;
  return callGemini({ apiKey, model, prompt, seed, temperature });
}

export async function callLLMWithProviderFallback({
  providers,
  systemPrompt,
  userPrompt,
  seed = null,
  temperature = 0.2,
}) {
  let lastError;
  for (let i = 0; i < providers.length; i++) {
    const { provider, apiKey, model } = providers[i];
    const elapsed = metrics.llmCallStart();

    try {
      const result = await callLLM({
        provider,
        apiKey,
        model,
        systemPrompt,
        userPrompt,
        seed,
        temperature,
      });

      metrics.llmCallEnd(elapsed, { provider, model, success: true });
      return result;
    } catch (err) {
      metrics.llmCallEnd(elapsed, { provider, model, success: false });

      const isLast = i === providers.length - 1;
      const log = logger.child({ provider, model });

      if (isLast) {
        log.error(
          { err, attempt: i + 1, totalProviders: providers.length },
          "all LLM providers exhausted",
        );
      } else {
        const next = providers[i + 1];
        metrics.llmFallback(provider, model, next.provider, next.model);
        log.warn(
          {
            err: { message: err.message },
            attempt: i + 1,
            nextProvider: `${next.provider}/${next.model}`,
          },
          "LLM provider failed, falling back",
        );
      }

      lastError = err;
    }
  }
  throw lastError;
}

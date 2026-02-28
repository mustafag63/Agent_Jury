import metrics from "../observability/metrics.js";

export function classifyEvaluationError(err) {
  const message = err instanceof Error ? err.message : "Unknown error";
  const normalized = message.toLowerCase();

  let classification;

  if (normalized.includes("model response is not valid json")) {
    classification = {
      status: 502,
      error: "Model response is not valid JSON",
      details:
        "Gemini output did not match strict JSON expectations. Retry the request and verify LLM_MODEL (recommended: gemini-2.5-flash).",
      category: "llm_parse_error",
    };
  } else if (normalized.includes("schema validation")) {
    classification = {
      status: 502,
      error: "Model response failed schema validation",
      details:
        "Gemini returned JSON but not in required schema. Retry request and keep prompt/model stable.",
      category: "llm_schema_error",
    };
  } else if (normalized.includes("(401)") || normalized.includes("invalid api key")) {
    classification = {
      status: 401,
      error: "LLM call failed (401) / invalid API key",
      details:
        "Use a valid Gemini API key and make sure there are no extra spaces or wrong characters in LLM_API_KEY.",
      category: "auth_error",
    };
  } else if (normalized.includes("(429)") || normalized.includes("quota")) {
    classification = {
      status: 429,
      error: "LLM call failed (429) / quota-rate limit",
      details: "Check Gemini quota/billing, wait a bit, then retry.",
      category: "rate_limit_error",
    };
  } else if (normalized.includes("fetch failed") || normalized.includes("aborterror")) {
    classification = {
      status: 504,
      error: "LLM provider timeout/network failure",
      details: "Temporary provider/network issue. Retry shortly.",
      category: "network_error",
    };
  } else {
    classification = {
      status: 500,
      error: "Evaluation failed",
      details: message,
      category: "unknown_error",
    };
  }

  metrics.inc("evaluation_errors_total", {
    category: classification.category,
    status: String(classification.status),
  });

  return classification;
}

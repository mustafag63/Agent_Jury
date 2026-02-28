const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:4000";
const API_KEY = process.env.NEXT_PUBLIC_API_KEY || "";
const TIMEOUT_MS = 120_000;
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 2000;

function buildHeaders() {
  const headers = { "Content-Type": "application/json" };
  if (API_KEY) {
    headers["X-API-Key"] = API_KEY;
  }
  return headers;
}

export class ApiError extends Error {
  constructor(message, { status, category, details, retryable } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status || 0;
    this.category = category || "unknown";
    this.details = details || "";
    this.retryable = retryable ?? false;
  }
}

function classifyError(status, data) {
  const msg = data?.error || "Evaluation failed";
  const details = data?.details || "";

  if (status === 0) {
    return new ApiError("Network error — check your internet connection.", {
      status: 0,
      category: "network",
      details: "Could not reach the backend server.",
      retryable: true,
    });
  }
  if (status === 401) {
    return new ApiError("Authentication failed.", {
      status,
      category: "auth",
      details,
      retryable: false,
    });
  }
  if (status === 429) {
    return new ApiError("Too many requests — please wait a moment and retry.", {
      status,
      category: "rate_limit",
      details,
      retryable: true,
    });
  }
  if (status === 400) {
    return new ApiError(msg, {
      status,
      category: "validation",
      details,
      retryable: false,
    });
  }
  if (status === 502 || status === 503 || status === 504) {
    return new ApiError(
      "AI model temporarily unavailable — retry in a moment.",
      { status, category: "llm_error", details, retryable: true },
    );
  }
  if (status >= 500) {
    return new ApiError("Server error — please retry.", {
      status,
      category: "server",
      details,
      retryable: true,
    });
  }
  return new ApiError(msg, {
    status,
    category: "unknown",
    details,
    retryable: false,
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function evaluateCase(caseText, { onRetry } = {}) {
  let lastError;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const delayMs = RETRY_DELAY_MS * attempt;
      if (onRetry) onRetry(attempt, delayMs);
      await sleep(delayMs);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const res = await fetch(`${BACKEND_URL}/evaluate`, {
        method: "POST",
        headers: buildHeaders(),
        body: JSON.stringify({ case_text: caseText }),
        signal: controller.signal,
      });

      let data;
      try {
        data = await res.json();
      } catch {
        data = {};
      }

      if (!res.ok) {
        const err = classifyError(res.status, data);
        if (err.retryable && attempt < MAX_RETRIES) {
          lastError = err;
          continue;
        }
        throw err;
      }

      data._request_id = res.headers.get("x-request-id") || null;
      return data;
    } catch (err) {
      if (err instanceof ApiError) {
        lastError = err;
        if (!err.retryable || attempt >= MAX_RETRIES) throw err;
        continue;
      }

      if (err.name === "AbortError") {
        lastError = new ApiError(
          "Request timed out — the AI evaluation is taking too long.",
          { status: 0, category: "timeout", retryable: true },
        );
      } else {
        lastError = classifyError(0, {});
      }

      if (attempt >= MAX_RETRIES) throw lastError;
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError;
}

export async function checkHealth() {
  try {
    const res = await fetch(`${BACKEND_URL}/health`, {
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

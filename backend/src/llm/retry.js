const FETCH_BACKOFF_BASE_MS_429 = 2_000;

export function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function isRetryableError(error) {
  if (!(error instanceof Error)) return false;
  return error.name === "AbortError" || error.message.includes("fetch failed");
}

export function resolveBackoff(status, attempt, headers) {
  if (status === 429) {
    const retryAfter = headers?.get?.("retry-after");
    if (retryAfter) {
      const seconds = Number(retryAfter);
      if (Number.isFinite(seconds) && seconds > 0) {
        return Math.min(seconds * 1000, 60_000);
      }
    }
    return Math.min(FETCH_BACKOFF_BASE_MS_429 * 2 ** attempt, 30_000);
  }
  const FETCH_BACKOFF_BASE_MS = 500;
  return FETCH_BACKOFF_BASE_MS * 2 ** attempt;
}

export function maxRetriesForStatus(status) {
  const FETCH_MAX_RETRIES_429 = 2;
  const FETCH_MAX_RETRIES = 3;
  return status === 429 ? FETCH_MAX_RETRIES_429 : FETCH_MAX_RETRIES;
}

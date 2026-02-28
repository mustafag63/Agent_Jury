"use client";

const CATEGORY_ICONS = {
  network: "🔌",
  timeout: "⏱",
  rate_limit: "🚦",
  llm_error: "🤖",
  auth: "🔒",
  validation: "⚠",
  server: "🖥",
  wallet: "👛",
};

export default function ErrorAlert({ error, onRetry, onDismiss }) {
  if (!error) return null;

  const message = typeof error === "string" ? error : error.message || "Something went wrong.";
  const category = error?.category || "unknown";
  const details = error?.details || "";
  const retryable = error?.retryable ?? !!onRetry;
  const icon = CATEGORY_ICONS[category] || "❗";

  return (
    <div role="alert" aria-live="assertive" className="error-alert">
      <div className="error-alert-header">
        <span aria-hidden="true">{icon}</span>
        <strong>{message}</strong>
      </div>
      {details && <p className="error-alert-details">{details}</p>}
      <div className="error-alert-actions">
        {retryable && onRetry && (
          <button className="button button-sm" onClick={onRetry} type="button">
            Retry
          </button>
        )}
        {onDismiss && (
          <button
            className="button button-sm button-ghost"
            onClick={onDismiss}
            type="button"
          >
            Dismiss
          </button>
        )}
      </div>
    </div>
  );
}

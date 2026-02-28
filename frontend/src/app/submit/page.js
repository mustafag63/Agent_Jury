"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { evaluateCase } from "@/lib/api";
import { getSession, setSession } from "@/lib/storage";
import ErrorAlert from "@/components/ErrorAlert";

const MAX_CHARS = 4000;

const PROGRESS_STEPS = [
  "Sending case to AI agents…",
  "Feasibility Agent analyzing…",
  "Innovation Agent analyzing…",
  "Risk & Ethics Agent analyzing…",
  "Computing final verdict…",
];

export default function SubmitPage() {
  const router = useRouter();
  const [caseText, setCaseText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [progressIdx, setProgressIdx] = useState(0);
  const [retryAttempt, setRetryAttempt] = useState(0);
  const progressTimer = useRef(null);
  const walletAddress = getSession()?.walletAddress;

  function startProgress() {
    setProgressIdx(0);
    let idx = 0;
    progressTimer.current = setInterval(() => {
      idx = Math.min(idx + 1, PROGRESS_STEPS.length - 1);
      setProgressIdx(idx);
    }, 3000);
  }

  function stopProgress() {
    if (progressTimer.current) {
      clearInterval(progressTimer.current);
      progressTimer.current = null;
    }
  }

  async function runEvaluation() {
    try {
      setError(null);
      setLoading(true);
      setRetryAttempt(0);
      startProgress();

      const result = await evaluateCase(caseText.trim(), {
        onRetry: (attempt) => setRetryAttempt(attempt),
      });

      setSession({
        caseText: caseText.trim(),
        evaluation: result,
        attestation: result.attestation || null,
      });
      router.push("/deliberation");
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
      stopProgress();
    }
  }

  const charCount = caseText.length;
  const overLimit = charCount > MAX_CHARS;
  const canSubmit = !loading && caseText.trim().length > 0 && !overLimit;

  return (
    <div className="card">
      <h2 id="submit-heading">2) Submit Case</h2>

      {!walletAddress && (
        <div className="error-alert" role="alert" style={{ marginBottom: 12 }}>
          <div className="error-alert-header">
            <span aria-hidden="true">👛</span>
            <strong>Wallet not connected — <a href="/connect">connect first</a>.</strong>
          </div>
        </div>
      )}

      <label htmlFor="case-input" className="sr-only">
        Describe your startup case
      </label>
      <textarea
        id="case-input"
        rows={7}
        style={{ width: "100%", marginBottom: 4 }}
        placeholder="Example: AI assistant for compliance checks in fintech onboarding..."
        value={caseText}
        onChange={(e) => setCaseText(e.target.value)}
        disabled={loading}
        aria-describedby="char-count"
        maxLength={MAX_CHARS + 100}
      />
      <p
        id="char-count"
        className={`char-count ${overLimit ? "char-count-over" : ""}`}
        aria-live="polite"
      >
        {charCount} / {MAX_CHARS}
      </p>

      <button
        className="button"
        disabled={!canSubmit}
        onClick={runEvaluation}
        aria-describedby="submit-heading"
      >
        {loading ? "Evaluating…" : "Evaluate with Agents"}
      </button>

      {loading && (
        <div className="progress-indicator" role="status" aria-live="polite">
          <div className="progress-bar">
            <div
              className="progress-bar-fill"
              style={{ width: `${((progressIdx + 1) / PROGRESS_STEPS.length) * 100}%` }}
            />
          </div>
          <p className="progress-text">{PROGRESS_STEPS[progressIdx]}</p>
          {retryAttempt > 0 && (
            <p className="progress-retry">Auto-retrying (attempt {retryAttempt + 1})…</p>
          )}
        </div>
      )}

      <ErrorAlert error={error} onRetry={runEvaluation} onDismiss={() => setError(null)} />
    </div>
  );
}

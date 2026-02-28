"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { evaluateCase } from "@/lib/api";
import { getSession, setSession } from "@/lib/storage";

const MAX_CASE_LENGTH = 4000;

export default function SubmitPage() {
  const router = useRouter();
  const [caseText, setCaseText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [walletAddress] = useState(() => getSession()?.walletAddress || "");

  const remaining = MAX_CASE_LENGTH - caseText.length;
  const overLimit = remaining < 0;

  async function runEvaluation() {
    try {
      setError("");
      setLoading(true);
      const result = await evaluateCase(caseText.trim());
      setSession({
        caseText: caseText.trim(),
        evaluation: result
      });
      router.push("/deliberation");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Evaluation failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card">
      <h2>2) Submit Case</h2>
      <p>Connected wallet: {walletAddress || "Not connected"}</p>
      <textarea
        rows={7}
        style={{ width: "100%", marginBottom: 4 }}
        placeholder="Example: AI assistant for compliance checks in fintech onboarding..."
        value={caseText}
        onChange={(e) => setCaseText(e.target.value)}
      />
      <p style={{ fontSize: 12, color: overLimit ? "crimson" : remaining < 200 ? "#b45309" : "#6b7280", marginBottom: 12 }}>
        {caseText.length} / {MAX_CASE_LENGTH} characters{overLimit ? " — too long!" : ""}
      </p>
      <button
        className="button"
        disabled={loading || !caseText.trim() || overLimit}
        onClick={runEvaluation}
      >
        {loading ? "Evaluating..." : "Evaluate with Agents"}
      </button>
      {error && <p style={{ color: "crimson" }}>{error}</p>}
    </div>
  );
}

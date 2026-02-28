"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { evaluateCase } from "@/lib/api";
import { getSession, setSession } from "@/lib/storage";

export default function SubmitPage() {
  const router = useRouter();
  const [caseText, setCaseText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const walletAddress = getSession()?.walletAddress;

  async function runEvaluation() {
    try {
      setError("");
      setLoading(true);
      const result = await evaluateCase(caseText.trim());
      setSession({
        caseText: caseText.trim(),
        evaluation: result,
        attestation: result.attestation || null
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
        style={{ width: "100%", marginBottom: 12 }}
        placeholder="Example: AI assistant for compliance checks in fintech onboarding..."
        value={caseText}
        onChange={(e) => setCaseText(e.target.value)}
      />
      <button
        className="button"
        disabled={loading || !caseText.trim()}
        onClick={runEvaluation}
      >
        {loading ? "Evaluating..." : "Evaluate with Agents"}
      </button>
      {error && <p style={{ color: "crimson" }}>{error}</p>}
    </div>
  );
}

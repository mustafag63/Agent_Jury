"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { keccak256, toUtf8Bytes } from "ethers";
import { getSession, setSession } from "@/lib/storage";
import { getWriteContract } from "@/lib/contract";

function decisionClass(decision) {
  if (decision === "SHIP") return "badge ship";
  if (decision === "ITERATE") return "badge iterate";
  return "badge reject";
}

export default function VerdictPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [txHash, setTxHash] = useState("");
  const [error, setError] = useState("");

  const [session] = useState(() => getSession());
  const caseText = session?.caseText || "";
  const evaluation = session?.evaluation || null;

  const { agent_results = [], final_verdict = null } = evaluation || {};
  const feasibility = agent_results.find((a) => a.role === "Feasibility Agent");
  const innovation = agent_results.find((a) => a.role === "Innovation Agent");
  const risk = agent_results.find((a) => a.role === "Risk & Ethics Agent");

  const shortVerdict = useMemo(() => {
    const text = final_verdict?.summary || final_verdict?.decision || "No summary";
    return text.slice(0, 140);
  }, [final_verdict]);

  async function saveOnChain() {
    try {
      setSaving(true);
      setError("");
      setTxHash("");

      const contract = await getWriteContract();
      const hash = keccak256(toUtf8Bytes(caseText));
      const tx = await contract.saveVerdict(
        hash,
        Number(feasibility?.score || 0),
        Number(innovation?.score || 0),
        Number(risk?.score || 0),
        Number(final_verdict?.final_score || 0),
        shortVerdict
      );
      await tx.wait();
      setTxHash(tx.hash);
      setSession({ lastTxHash: tx.hash });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save on-chain");
    } finally {
      setSaving(false);
    }
  }

  if (!final_verdict) {
    return (
      <div className="card">
        <p>No verdict found. Start from case submission.</p>
        <button className="button" onClick={() => router.push("/submit")}>
          Go to Submit
        </button>
      </div>
    );
  }

  return (
    <div className="card">
      <h2>4) Final Verdict</h2>
      <p>
        Final score: <strong>{final_verdict.final_score}</strong>
      </p>
      <p>
        Decision:{" "}
        <span className={decisionClass(final_verdict.decision)}>
          {final_verdict.decision}
        </span>
      </p>
      <p>{final_verdict.summary}</p>
      <p>
        <strong>Next steps</strong>
      </p>
      <ul>
        {(final_verdict.next_steps || []).map((step, i) => (
          <li key={`step-${i}`}>{step}</li>
        ))}
      </ul>

      <div className="row">
        <button className="button" disabled={saving} onClick={saveOnChain}>
          {saving ? "Waiting for MetaMask..." : "Save decision on-chain"}
        </button>
        <button className="button" onClick={() => router.push("/history")}>
          Go to History
        </button>
      </div>

      {txHash && <p>Saved. Tx hash: {txHash}</p>}
      {error && <p style={{ color: "crimson" }}>{error}</p>}
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { keccak256, toUtf8Bytes } from "ethers";
import { getSession, setSession } from "@/lib/storage";
import { ensureCorrectNetwork, getBrowserProvider, getWriteContract, MONAD_BLOCK_EXPLORER_URL } from "@/lib/contract";

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

  const session = getSession();
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

      const provider = await getBrowserProvider();
      await ensureCorrectNetwork(provider);
      const contract = await getWriteContract();
      await ensureCorrectNetwork(provider);
      const hash = keccak256(toUtf8Bytes(caseText));

      const attestation = session?.attestation;
      const attestationSig = attestation?.signature || "0x";

      const tx = await contract.saveVerdict(
        hash,
        Number(feasibility?.score || 0),
        Number(innovation?.score || 0),
        Number(risk?.score || 0),
        Number(final_verdict?.final_score || 0),
        shortVerdict,
        attestationSig
      );
      await tx.wait();
      setTxHash(tx.hash);
      setSession({ lastTxHash: tx.hash });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save on-chain";
      if (message.toLowerCase().includes("wrong network")) {
        setError("Please switch to Monad Testnet in MetaMask and try again.");
      } else {
        setError(message);
      }
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

      <div className="trust-info">
        <p>
          <strong>How verification works:</strong> AI agents evaluate your case
          off-chain (scores, reasoning). When you click &quot;Save on-chain&quot;, <em>you</em> sign
          the transaction with MetaMask. The verdict record (scores, summary, your
          address, timestamp) is written immutably to the smart contract. Anyone can
          independently verify it on the block explorer.
        </p>
        {session?.attestation?.signature && (
          <p className="attestation-info">
            Backend attestation included. The AI output was cryptographically signed
            by the backend before submission, binding scores to a verifiable signature.
          </p>
        )}
      </div>

      <div className="row">
        <button className="button" disabled={saving} onClick={saveOnChain}>
          {saving ? "Waiting for MetaMask..." : "Save decision on-chain"}
        </button>
        <button className="button" onClick={() => router.push("/history")}>
          Go to History
        </button>
      </div>

      {txHash && (
        <div className="tx-confirmation">
          <p>Saved on-chain successfully.</p>
          <p>
            Tx:{" "}
            <a
              href={`${MONAD_BLOCK_EXPLORER_URL}/tx/${txHash}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              {txHash.slice(0, 10)}...{txHash.slice(-8)}
            </a>
          </p>
          <p className="verify-hint">
            Verify this record on the block explorer. The data is immutable and
            publicly readable.
          </p>
        </div>
      )}
      {error && <p style={{ color: "crimson" }}>{error}</p>}
    </div>
  );
}

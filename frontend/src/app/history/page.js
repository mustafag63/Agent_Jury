"use client";

import { useEffect, useState } from "react";
import { getReadContract, MONAD_BLOCK_EXPLORER_URL, CONTRACT_ADDRESS } from "@/lib/contract";

function formatTime(ts) {
  const ms = Number(ts) * 1000;
  if (!ms) return "-";
  return new Date(ms).toLocaleString();
}

export default function HistoryPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      try {
        setError("");
        setLoading(true);
        const contract = await getReadContract();
        const count = Number(await contract.getVerdictCount());
        const rows = [];
        for (let i = count - 1; i >= 0; i -= 1) {
          const v = await contract.getVerdict(i);
          rows.push({
            index: i,
            finalScore: Number(v.finalScore),
            feasibilityScore: Number(v.feasibilityScore),
            innovationScore: Number(v.innovationScore),
            riskScore: Number(v.riskScore),
            shortVerdict: v.shortVerdict,
            submitter: v.submitter,
            timestamp: Number(v.timestamp)
          });
        }
        setItems(rows);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to read history";
        setError(`Failed to read history from RPC: ${message}`);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  return (
    <div className="card">
      <h2>5) On-chain History</h2>
      <p className="trust-info">
        These records are read directly from the smart contract via public RPC.
        Each verdict is immutable and independently verifiable.{" "}
        <a
          href={`${MONAD_BLOCK_EXPLORER_URL}/address/${CONTRACT_ADDRESS}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          View contract on explorer
        </a>
      </p>
      {loading && <p>Loading verdict history...</p>}
      {error && <p style={{ color: "crimson" }}>{error}</p>}
      {!loading && !items.length && <p>No verdicts saved yet.</p>}
      {items.map((item) => (
        <div key={item.index} className="card">
          <p>
            <strong>#{item.index}</strong> | Final {item.finalScore}
          </p>
          <p>
            Feasibility {item.feasibilityScore} | Innovation {item.innovationScore} |
            Risk {item.riskScore}
          </p>
          <p>{item.shortVerdict}</p>
          <p>
            Submitter:{" "}
            <a
              href={`${MONAD_BLOCK_EXPLORER_URL}/address/${item.submitter}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              {item.submitter.slice(0, 6)}...{item.submitter.slice(-4)}
            </a>
          </p>
          <p>Time: {formatTime(item.timestamp)}</p>
        </div>
      ))}
    </div>
  );
}

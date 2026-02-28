"use client";

import { useEffect, useState } from "react";
import { getReadContract } from "@/lib/contract";

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
        const indices = Array.from({ length: count }, (_, i) => count - 1 - i);
        const rows = await Promise.all(
          indices.map(async (i) => {
            const v = await contract.getVerdict(i);
            return {
              index: i,
              finalScore: Number(v.finalScore),
              feasibilityScore: Number(v.feasibilityScore),
              innovationScore: Number(v.innovationScore),
              riskScore: Number(v.riskScore),
              shortVerdict: v.shortVerdict,
              submitter: v.submitter,
              timestamp: Number(v.timestamp)
            };
          })
        );
        setItems(rows);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to read history");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  return (
    <div className="card">
      <h2>5) On-chain History</h2>
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
          <p>Submitter: {item.submitter}</p>
          <p>Time: {formatTime(item.timestamp)}</p>
        </div>
      ))}
    </div>
  );
}

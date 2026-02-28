"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import {
  getReadContract,
  MONAD_BLOCK_EXPLORER_URL,
  CONTRACT_ADDRESS,
} from "@/lib/contract";
import { SkeletonCard } from "@/components/LoadingSkeleton";
import ErrorAlert from "@/components/ErrorAlert";

const PAGE_SIZE = 10;

const DECISION_FROM_SCORE = (score) => {
  if (score >= 75) return "SHIP";
  if (score >= 45) return "ITERATE";
  return "REJECT";
};

function formatTime(ts) {
  const ms = Number(ts) * 1000;
  if (!ms) return "-";
  return new Date(ms).toLocaleString();
}

function decisionClass(decision) {
  if (decision === "SHIP") return "badge ship";
  if (decision === "ITERATE") return "badge iterate";
  return "badge reject";
}

export default function HistoryPage() {
  const [allItems, setAllItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [search, setSearch] = useState("");
  const [decisionFilter, setDecisionFilter] = useState("ALL");
  const [scoreMin, setScoreMin] = useState(0);
  const [scoreMax, setScoreMax] = useState(100);
  const [sortBy, setSortBy] = useState("newest");
  const [page, setPage] = useState(0);

  const load = useCallback(async () => {
    try {
      setError(null);
      setLoading(true);
      const contract = await getReadContract();
      const count = Number(await contract.getVerdictCount());
      const rows = [];
      for (let i = count - 1; i >= 0; i -= 1) {
        const v = await contract.getVerdict(i);
        const finalScore = Number(v.finalScore);
        rows.push({
          index: i,
          finalScore,
          feasibilityScore: Number(v.feasibilityScore),
          innovationScore: Number(v.innovationScore),
          riskScore: Number(v.riskScore),
          shortVerdict: v.shortVerdict,
          submitter: v.submitter,
          timestamp: Number(v.timestamp),
          decision: DECISION_FROM_SCORE(finalScore),
        });
      }
      setAllItems(rows);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to read history";
      setError({
        message: `Failed to read on-chain history: ${msg}`,
        category: "network",
        retryable: true,
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    let result = allItems;

    if (decisionFilter !== "ALL") {
      result = result.filter((item) => item.decision === decisionFilter);
    }

    result = result.filter(
      (item) => item.finalScore >= scoreMin && item.finalScore <= scoreMax,
    );

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(
        (item) =>
          item.shortVerdict.toLowerCase().includes(q) ||
          item.submitter.toLowerCase().includes(q),
      );
    }

    if (sortBy === "oldest") {
      result = [...result].sort((a, b) => a.timestamp - b.timestamp);
    } else if (sortBy === "score_high") {
      result = [...result].sort((a, b) => b.finalScore - a.finalScore);
    } else if (sortBy === "score_low") {
      result = [...result].sort((a, b) => a.finalScore - b.finalScore);
    }

    return result;
  }, [allItems, decisionFilter, scoreMin, scoreMax, search, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const pageItems = filtered.slice(
    safePage * PAGE_SIZE,
    (safePage + 1) * PAGE_SIZE,
  );

  useEffect(() => {
    setPage(0);
  }, [search, decisionFilter, scoreMin, scoreMax, sortBy]);

  return (
    <div className="card">
      <h2 id="history-heading">5) On-chain History</h2>
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

      {/* Filter Bar */}
      <div className="filter-bar" role="search" aria-label="Filter verdicts">
        <div className="filter-row">
          <label htmlFor="history-search" className="sr-only">
            Search verdicts
          </label>
          <input
            id="history-search"
            type="search"
            className="filter-input"
            placeholder="Search verdict text or address…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search verdict text or submitter address"
          />
        </div>

        <div className="filter-row">
          <label htmlFor="decision-filter">Decision:</label>
          <select
            id="decision-filter"
            className="filter-select"
            value={decisionFilter}
            onChange={(e) => setDecisionFilter(e.target.value)}
          >
            <option value="ALL">All</option>
            <option value="SHIP">SHIP</option>
            <option value="ITERATE">ITERATE</option>
            <option value="REJECT">REJECT</option>
          </select>

          <label htmlFor="sort-by">Sort:</label>
          <select
            id="sort-by"
            className="filter-select"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="score_high">Score (high → low)</option>
            <option value="score_low">Score (low → high)</option>
          </select>
        </div>

        <div className="filter-row">
          <label htmlFor="score-min">Score range:</label>
          <input
            id="score-min"
            type="number"
            className="filter-input-sm"
            min={0}
            max={100}
            value={scoreMin}
            onChange={(e) => setScoreMin(Number(e.target.value) || 0)}
            aria-label="Minimum score"
          />
          <span>–</span>
          <input
            id="score-max"
            type="number"
            className="filter-input-sm"
            min={0}
            max={100}
            value={scoreMax}
            onChange={(e) => setScoreMax(Number(e.target.value) || 100)}
            aria-label="Maximum score"
          />
        </div>
      </div>

      <ErrorAlert error={error} onRetry={load} />

      {loading && (
        <div role="status" aria-label="Loading verdicts">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      )}

      {!loading && !error && (
        <p className="result-count" aria-live="polite">
          {filtered.length} verdict{filtered.length !== 1 ? "s" : ""} found
          {allItems.length !== filtered.length &&
            ` (of ${allItems.length} total)`}
        </p>
      )}

      {!loading && !error && filtered.length === 0 && (
        <p>No verdicts match your filters.</p>
      )}

      {pageItems.map((item) => (
        <article key={item.index} className="card verdict-card" aria-label={`Verdict #${item.index}`}>
          <div className="verdict-card-header">
            <strong>#{item.index}</strong>
            <span className={decisionClass(item.decision)}>{item.decision}</span>
            <span>Final: {item.finalScore}</span>
          </div>
          <div className="verdict-card-scores">
            Feasibility {item.feasibilityScore} · Innovation{" "}
            {item.innovationScore} · Risk {item.riskScore}
          </div>
          <p className="verdict-card-text">{item.shortVerdict}</p>
          <div className="verdict-card-meta">
            <span>
              Submitter:{" "}
              <a
                href={`${MONAD_BLOCK_EXPLORER_URL}/address/${item.submitter}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                {item.submitter.slice(0, 6)}…{item.submitter.slice(-4)}
              </a>
            </span>
            <time dateTime={new Date(item.timestamp * 1000).toISOString()}>
              {formatTime(item.timestamp)}
            </time>
          </div>
        </article>
      ))}

      {/* Pagination */}
      {totalPages > 1 && (
        <nav className="pagination" aria-label="Verdict pages">
          <button
            className="button button-sm"
            disabled={safePage === 0}
            onClick={() => setPage(safePage - 1)}
            aria-label="Previous page"
          >
            ← Prev
          </button>
          <span className="pagination-info" aria-current="page">
            Page {safePage + 1} of {totalPages}
          </span>
          <button
            className="button button-sm"
            disabled={safePage >= totalPages - 1}
            onClick={() => setPage(safePage + 1)}
            aria-label="Next page"
          >
            Next →
          </button>
        </nav>
      )}
    </div>
  );
}

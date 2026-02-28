"use client";

import { AgentCardSkeleton } from "./LoadingSkeleton";

function ScoreBar({ value, label }) {
  const pct = Math.max(0, Math.min(100, value));
  const color = pct >= 70 ? "#22c55e" : pct >= 40 ? "#eab308" : "#ef4444";

  return (
    <div className="score-bar-container" role="meter" aria-label={label} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className="score-bar-track">
        <div className="score-bar-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="score-bar-value">{pct}</span>
    </div>
  );
}

export default function AgentCard({ agent, loading }) {
  if (loading) return <AgentCardSkeleton />;

  const biasFlags = agent.bias_flags || [];
  const uncertaintyFlags = agent.uncertainty_flags || [];

  return (
    <article
      className="card agent-card"
      style={{ flex: 1, minWidth: 240 }}
      aria-label={`${agent.role} evaluation`}
    >
      <h3>{agent.role}</h3>

      <ScoreBar value={agent.score} label={`${agent.role} score`} />

      {agent.confidence != null && (
        <p className="agent-confidence">
          Confidence: <strong>{agent.confidence}%</strong>
        </p>
      )}

      <details>
        <summary>
          <strong>Pros</strong> ({(agent.pros || []).length})
        </summary>
        <ul>
          {(agent.pros || []).map((item, i) => (
            <li key={`pro-${i}`}>{item}</li>
          ))}
        </ul>
      </details>

      <details>
        <summary>
          <strong>Cons</strong> ({(agent.cons || []).length})
        </summary>
        <ul>
          {(agent.cons || []).map((item, i) => (
            <li key={`con-${i}`}>{item}</li>
          ))}
        </ul>
      </details>

      {agent.rationale && (
        <details>
          <summary><strong>Rationale</strong></summary>
          <p>{agent.rationale}</p>
        </details>
      )}

      {(biasFlags.length > 0 || uncertaintyFlags.length > 0) && (
        <details>
          <summary><strong>Flags</strong> ({biasFlags.length + uncertaintyFlags.length})</summary>
          {biasFlags.length > 0 && (
            <ul className="flag-list bias">
              {biasFlags.map((f, i) => <li key={`b-${i}`}>{f}</li>)}
            </ul>
          )}
          {uncertaintyFlags.length > 0 && (
            <ul className="flag-list uncertainty">
              {uncertaintyFlags.map((f, i) => <li key={`u-${i}`}>{f}</li>)}
            </ul>
          )}
        </details>
      )}
    </article>
  );
}

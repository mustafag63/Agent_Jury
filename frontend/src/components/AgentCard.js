export default function AgentCard({ agent, loading }) {
  return (
    <div className={`card ${loading ? "thinking" : ""}`} style={{ flex: 1, minWidth: 240 }}>
      <h3>{agent.role}</h3>
      <p>
        Score: <strong>{loading ? "..." : agent.score}</strong>
      </p>
      <p>
        <strong>Pros</strong>
      </p>
      <ul>
        {(agent.pros || []).map((item, i) => (
          <li key={`${agent.role}-pro-${i}`}>{item}</li>
        ))}
      </ul>
      <p>
        <strong>Cons</strong>
      </p>
      <ul>
        {(agent.cons || []).map((item, i) => (
          <li key={`${agent.role}-con-${i}`}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

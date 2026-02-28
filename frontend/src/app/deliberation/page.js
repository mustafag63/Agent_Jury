"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AgentCard from "@/components/AgentCard";
import { getSession } from "@/lib/storage";

export default function DeliberationPage() {
  const router = useRouter();
  const [thinking, setThinking] = useState(true);
  const session = getSession();
  const agentResults = session?.evaluation?.agent_results || [];

  useEffect(() => {
    const timer = setTimeout(() => setThinking(false), 1800);
    return () => clearTimeout(timer);
  }, []);

  if (!agentResults.length) {
    return (
      <div className="card">
        <p>No evaluation found. Submit a case first.</p>
        <button className="button" onClick={() => router.push("/submit")}>
          Go to Submit
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="card">
        <h2>3) Agent Deliberation</h2>
        <p>{thinking ? "Agents are thinking..." : "Agent evaluations complete."}</p>
      </div>
      <div className="row">
        {agentResults.map((agent) => (
          <AgentCard key={agent.role} agent={agent} loading={thinking} />
        ))}
      </div>
      <button
        className="button"
        disabled={thinking}
        onClick={() => router.push("/verdict")}
      >
        View Final Verdict
      </button>
    </div>
  );
}

const JSON_SYSTEM_RULES = `
You are a strict JSON API.
Return ONLY valid JSON. No markdown, no backticks, no prose outside JSON.
`.trim();

function clampScore(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    // If model adds text around JSON, try to recover first object block.
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("Model response is not valid JSON");
    return JSON.parse(match[0]);
  }
}

function normalizeAgentResponse(parsed, role) {
  return {
    role,
    score: clampScore(parsed.score),
    pros: Array.isArray(parsed.pros) ? parsed.pros.slice(0, 5) : [],
    cons: Array.isArray(parsed.cons) ? parsed.cons.slice(0, 5) : [],
    rationale:
      typeof parsed.rationale === "string"
        ? parsed.rationale.slice(0, 600)
        : "No rationale provided."
  };
}

async function callOpenAIStyle({ apiKey, model, system, user }) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user }
      ]
    })
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`LLM call failed (${res.status}): ${detail}`);
  }

  const json = await res.json();
  const content = json?.choices?.[0]?.message?.content;
  if (!content || typeof content !== "string") {
    throw new Error("LLM response missing message content");
  }
  return content;
}

export async function runSingleAgent({
  apiKey,
  model,
  roleName,
  focusPrompt,
  caseText
}) {
  const system = `${JSON_SYSTEM_RULES}

You are the "${roleName}" in a startup hackathon jury.
Output schema:
{
  "score": number 0-100,
  "pros": ["string", "..."],
  "cons": ["string", "..."],
  "rationale": "short explanation"
}`;

  const user = `Evaluate this case:
"${caseText}"

Focus:
${focusPrompt}

Constraints:
- Keep pros/cons concise and practical.
- Score must be numeric 0-100.
- Return JSON only.`;

  const raw = await callOpenAIStyle({ apiKey, model, system, user });
  const parsed = safeJsonParse(raw);
  return normalizeAgentResponse(parsed, roleName);
}

export function buildFinalVerdict(agentResults) {
  const feasibility = agentResults.find((a) => a.role === "Feasibility Agent");
  const innovation = agentResults.find((a) => a.role === "Innovation Agent");
  const risk = agentResults.find((a) => a.role === "Risk & Ethics Agent");

  const f = clampScore(feasibility?.score ?? 0);
  const i = clampScore(innovation?.score ?? 0);
  const r = clampScore(risk?.score ?? 0);

  // Lower risk score should lower final score:
  // use (100 - risk) so low risk score reduces confidence.
  const weighted = f * 0.45 + i * 0.35 + (100 - r) * 0.2;
  const finalScore = clampScore(weighted);

  let decision = "REJECT";
  if (finalScore >= 75) decision = "SHIP";
  else if (finalScore >= 50) decision = "ITERATE";

  const summary = `Feasibility ${f}, Innovation ${i}, Risk ${r}. Weighted final score ${finalScore}, decision: ${decision}.`;

  const nextSteps = [
    decision === "SHIP"
      ? "Build a small production pilot and track usage."
      : "Run one focused iteration on the weakest dimension first.",
    f < 60 ? "Reduce implementation complexity and tighten scope." : "Keep technical scope disciplined.",
    i < 60 ? "Strengthen differentiation with a unique feature." : "Preserve the most differentiated element.",
    r > 60
      ? "Add explicit safeguards for abuse, privacy, and edge cases."
      : "Document responsible use and basic guardrails."
  ];

  return {
    final_score: finalScore,
    decision,
    summary,
    next_steps: nextSteps
  };
}

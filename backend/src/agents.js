import { z } from "zod";

const JSON_SYSTEM_RULES = `
You are a strict JSON API.
Return ONLY valid JSON. No markdown, no backticks, no prose outside JSON.
`.trim();

const FETCH_TIMEOUT_MS = 12_000;
const FETCH_MAX_RETRIES = 2;
const FETCH_BACKOFF_BASE_MS = 400;

const RETRYABLE_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);
const GEMINI_RESPONSE_SCHEMA = {
  type: "OBJECT",
  required: ["score", "pros", "cons", "rationale"],
  properties: {
    score: {
      type: "NUMBER",
      minimum: 0,
      maximum: 100
    },
    pros: {
      type: "ARRAY",
      maxItems: 5,
      items: {
        type: "STRING"
      }
    },
    cons: {
      type: "ARRAY",
      maxItems: 5,
      items: {
        type: "STRING"
      }
    },
    rationale: {
      type: "STRING"
    }
  }
};

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isRetryableError(error) {
  if (!(error instanceof Error)) return false;
  return error.name === "AbortError" || error.message.includes("fetch failed");
}

function clampScore(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

const AgentResponseSchema = z
  .object({
    score: z.number().min(0).max(100),
    pros: z.array(z.string().min(1).max(200)).max(5),
    cons: z.array(z.string().min(1).max(200)).max(5),
    rationale: z.string().min(1).max(600)
  })
  .strict();

function parseAndValidateAgentResponse(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Model response is not valid JSON");
  }

  const result = AgentResponseSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(`Model response failed schema validation: ${result.error.message}`);
  }

  return result.data;
}

function normalizeAgentResponse(validated, role) {
  return {
    role,
    score: clampScore(validated.score),
    pros: validated.pros,
    cons: validated.cons,
    rationale: validated.rationale
  };
}

async function callGemini({ apiKey, model, prompt }) {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  for (let attempt = 0; attempt <= FETCH_MAX_RETRIES; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          generationConfig: {
            temperature: 0.2,
            responseMimeType: "application/json",
            responseSchema: GEMINI_RESPONSE_SCHEMA
          },
          contents: [
            {
              role: "user",
              parts: [{ text: prompt }]
            }
          ]
        }),
        signal: controller.signal
      });

      if (!res.ok) {
        const detail = await res.text();
        if (attempt < FETCH_MAX_RETRIES && RETRYABLE_STATUS_CODES.has(res.status)) {
          const backoffMs = FETCH_BACKOFF_BASE_MS * 2 ** attempt;
          await sleep(backoffMs);
          continue;
        }
        throw new Error(`LLM call failed (${res.status}): ${detail}`);
      }

      const json = await res.json();
      const parts = json?.candidates?.[0]?.content?.parts;
      const content = Array.isArray(parts)
        ? parts
            .map((part) => (typeof part?.text === "string" ? part.text : ""))
            .join("")
            .trim()
        : "";
      if (!content || typeof content !== "string") {
        throw new Error("LLM response missing message content");
      }
      return content;
    } catch (error) {
      if (attempt < FETCH_MAX_RETRIES && isRetryableError(error)) {
        const backoffMs = FETCH_BACKOFF_BASE_MS * 2 ** attempt;
        await sleep(backoffMs);
        continue;
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error("LLM call failed after retries");
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

  const prompt = `${system}\n\n${user}`;
  const raw = await callGemini({ apiKey, model, prompt });
  const validated = parseAndValidateAgentResponse(raw);
  return normalizeAgentResponse(validated, roleName);
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

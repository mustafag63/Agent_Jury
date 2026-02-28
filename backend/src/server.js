import "dotenv/config";
import express from "express";
import cors from "cors";
import { buildFinalVerdict, runSingleAgent } from "./agents.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

const PORT = process.env.PORT || 4000;
const LLM_API_KEY = process.env.LLM_API_KEY || "";
const LLM_MODEL = process.env.LLM_MODEL || "gemini-2.5-flash";

function classifyEvaluationError(err) {
  const message = err instanceof Error ? err.message : "Unknown error";
  const normalized = message.toLowerCase();

  if (normalized.includes("model response is not valid json")) {
    return {
      status: 502,
      error: "Model response is not valid JSON",
      details:
        "Gemini output did not match strict JSON expectations. Retry the request and verify LLM_MODEL (recommended: gemini-2.5-flash)."
    };
  }

  if (normalized.includes("schema validation")) {
    return {
      status: 502,
      error: "Model response failed schema validation",
      details:
        "Gemini returned JSON but not in required schema. Retry request and keep prompt/model stable."
    };
  }

  if (normalized.includes("(401)") || normalized.includes("invalid api key")) {
    return {
      status: 401,
      error: "LLM call failed (401) / invalid API key",
      details:
        "Use a valid Gemini API key and make sure there are no extra spaces or wrong characters in LLM_API_KEY."
    };
  }

  if (normalized.includes("(429)") || normalized.includes("quota")) {
    return {
      status: 429,
      error: "LLM call failed (429) / quota-rate limit",
      details: "Check Gemini quota/billing, wait a bit, then retry."
    };
  }

  if (normalized.includes("fetch failed") || normalized.includes("aborterror")) {
    return {
      status: 504,
      error: "LLM provider timeout/network failure",
      details: "Temporary provider/network issue. Retry shortly."
    };
  }

  return {
    status: 500,
    error: "Evaluation failed",
    details: message
  };
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "agent-jury-backend" });
});

app.post("/evaluate", async (req, res) => {
  try {
    const caseText = String(req.body?.case_text || "").trim();
    if (!caseText) {
      return res.status(400).json({ error: "case_text is required" });
    }
    if (caseText.length > 4000) {
      return res.status(400).json({ error: "case_text is too long" });
    }
    if (!LLM_API_KEY) {
      return res.status(500).json({ error: "Missing LLM_API_KEY on backend" });
    }

    const [feasibility, innovation, risk] = await Promise.all([
      runSingleAgent({
        apiKey: LLM_API_KEY,
        model: LLM_MODEL,
        roleName: "Feasibility Agent",
        focusPrompt:
          "Assess implementation realism, scope for a small team, and delivery speed.",
        caseText
      }),
      runSingleAgent({
        apiKey: LLM_API_KEY,
        model: LLM_MODEL,
        roleName: "Innovation Agent",
        focusPrompt:
          "Assess novelty, market differentiation, and user value uniqueness.",
        caseText
      }),
      runSingleAgent({
        apiKey: LLM_API_KEY,
        model: LLM_MODEL,
        roleName: "Risk & Ethics Agent",
        focusPrompt:
          "Assess legal, misuse, safety, fairness, and ethical concerns. Higher score means higher risk.",
        caseText
      })
    ]);

    const agent_results = [feasibility, innovation, risk];
    const final_verdict = buildFinalVerdict(agent_results);

    return res.json({ agent_results, final_verdict });
  } catch (err) {
    const classified = classifyEvaluationError(err);
    return res.status(classified.status).json({
      error: classified.error,
      details: classified.details
    });
  }
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Agent Jury backend listening on http://localhost:${PORT}`);
});

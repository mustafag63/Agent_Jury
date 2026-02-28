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
    return res.status(500).json({
      error: "Evaluation failed",
      details: err instanceof Error ? err.message : "Unknown error"
    });
  }
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Agent Jury backend listening on http://localhost:${PORT}`);
});

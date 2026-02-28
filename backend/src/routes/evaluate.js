import { Router } from "express";
import config from "../config/index.js";
import { evaluateCase } from "../services/evaluation.js";
import { classifyEvaluationError } from "../errors/classifier.js";

const router = Router();

router.post("/evaluate", async (req, res) => {
  const log = req.log;
  try {
    const caseText = String(req.body?.case_text || "").trim();

    if (!caseText) {
      return res.status(400).json({ error: "case_text is required" });
    }
    if (caseText.length > 4000) {
      return res.status(400).json({ error: "case_text is too long" });
    }
    if (!config.llm.apiKey) {
      return res.status(500).json({ error: "Missing LLM_API_KEY on backend" });
    }

    const result = await evaluateCase(caseText, {
      requestIp: req.ip,
      requestId: req.requestId,
    });
    return res.json(result);
  } catch (err) {
    const classified = classifyEvaluationError(err);

    if (log) {
      log.error(
        {
          err,
          category: classified.category,
          statusCode: classified.status,
        },
        "evaluation request failed",
      );
    }

    return res.status(classified.status).json({
      error: classified.error,
      details: classified.details,
      request_id: req.requestId,
    });
  }
});

export default router;

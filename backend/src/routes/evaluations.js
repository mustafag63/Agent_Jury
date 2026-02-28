import { Router } from "express";
import {
  findEvaluationById,
  listEvaluations,
  countEvaluations,
} from "../data/evaluationRepo.js";
import { deleteEvaluation, redactCaseText } from "../data/privacy.js";
import { writeAuditEntry, ACTIONS } from "../data/audit.js";

const router = Router();

router.get("/evaluations", (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 100);
  const offset = Math.max(parseInt(req.query.offset) || 0, 0);
  const caseHash = req.query.case_hash || null;

  const items = listEvaluations({ limit, offset, caseHash });
  const total = countEvaluations(caseHash);

  return res.json({
    items,
    pagination: { limit, offset, total },
  });
});

router.get("/evaluations/:id", (req, res) => {
  const evaluation = findEvaluationById(req.params.id);
  if (!evaluation) {
    return res.status(404).json({ error: "Evaluation not found" });
  }

  writeAuditEntry({
    evalId: req.params.id,
    action: ACTIONS.EVALUATION_VIEWED,
    actor: req.ip,
  });

  return res.json(evaluation);
});

router.delete("/evaluations/:id", (req, res) => {
  const deleted = deleteEvaluation(req.params.id, req.ip);
  if (!deleted) {
    return res.status(404).json({ error: "Evaluation not found or already deleted" });
  }

  return res.json({
    ok: true,
    message: "Evaluation data erased (GDPR/KVKK right to erasure).",
    eval_id: req.params.id,
  });
});

router.post("/evaluations/:id/redact", (req, res) => {
  const redacted = redactCaseText(req.params.id, req.ip);
  if (!redacted) {
    return res
      .status(404)
      .json({ error: "Evaluation not found or case_text already empty" });
  }

  return res.json({
    ok: true,
    message: "PII redacted from stored case_text.",
    eval_id: req.params.id,
  });
});

router.post("/evaluations/:id/export", (req, res) => {
  const evaluation = findEvaluationById(req.params.id);
  if (!evaluation) {
    return res.status(404).json({ error: "Evaluation not found" });
  }

  writeAuditEntry({
    evalId: req.params.id,
    action: ACTIONS.EXPORT_REQUESTED,
    actor: req.ip,
    detail: "GDPR/KVKK data portability export",
  });

  res.setHeader("Content-Type", "application/json");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="evaluation-${req.params.id}.json"`,
  );
  return res.json({
    export_date: new Date().toISOString(),
    data_subject_notice:
      "This export contains all data associated with this evaluation, " +
      "provided under GDPR Article 20 / KVKK data portability rights.",
    evaluation,
  });
});

export default router;

import { getDb } from "./store.js";
import { writeAuditEntry, ACTIONS, getAuditTrail } from "./audit.js";

export function insertEvaluation({
  id,
  caseHash,
  caseText,
  storeCaseText,
  decision,
  finalScore,
  resultJson,
  promptVersion,
  modelUsed,
  providerUsed,
  temperature,
  seed,
  dualPass,
  requestIp,
  expiresAt,
}) {
  const db = getDb();

  db.prepare(
    `INSERT INTO evaluations
       (id, case_hash, case_text_stored, case_text, decision, final_score,
        result_json, prompt_version, model_used, provider_used,
        temperature, seed, dual_pass, request_ip, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    caseHash,
    storeCaseText ? 1 : 0,
    storeCaseText ? caseText : null,
    decision,
    finalScore,
    resultJson,
    promptVersion ?? null,
    modelUsed ?? null,
    providerUsed ?? null,
    temperature ?? null,
    seed ?? null,
    dualPass ? 1 : 0,
    requestIp ?? null,
    expiresAt ?? null,
  );

  writeAuditEntry({
    evalId: id,
    action: ACTIONS.EVALUATION_CREATED,
    actor: requestIp ?? "system",
    detail: `decision=${decision} score=${finalScore} model=${modelUsed}`,
  });
}

export function findEvaluationById(id) {
  const db = getDb();
  const row = db
    .prepare(`SELECT * FROM evaluations WHERE id = ? AND deleted_at IS NULL`)
    .get(id);
  if (!row) return null;

  return {
    ...row,
    result_json: safeParseJson(row.result_json),
    audit_trail: getAuditTrail(id),
  };
}

export function listEvaluations({ limit = 20, offset = 0, caseHash = null }) {
  const db = getDb();

  if (caseHash) {
    return db
      .prepare(
        `SELECT id, case_hash, decision, final_score, prompt_version,
                model_used, provider_used, created_at, deleted_at
         FROM evaluations
         WHERE case_hash = ? AND deleted_at IS NULL
         ORDER BY created_at DESC
         LIMIT ? OFFSET ?`,
      )
      .all(caseHash, limit, offset);
  }

  return db
    .prepare(
      `SELECT id, case_hash, decision, final_score, prompt_version,
              model_used, provider_used, created_at, deleted_at
       FROM evaluations
       WHERE deleted_at IS NULL
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
    )
    .all(limit, offset);
}

export function countEvaluations(caseHash = null) {
  const db = getDb();
  if (caseHash) {
    return db
      .prepare(
        "SELECT COUNT(*) as count FROM evaluations WHERE case_hash = ? AND deleted_at IS NULL",
      )
      .get(caseHash).count;
  }
  return db
    .prepare("SELECT COUNT(*) as count FROM evaluations WHERE deleted_at IS NULL")
    .get().count;
}

function safeParseJson(str) {
  try {
    return JSON.parse(str);
  } catch {
    return {};
  }
}

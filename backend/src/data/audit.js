import { getDb } from "./store.js";

const ACTIONS = Object.freeze({
  EVALUATION_CREATED: "evaluation_created",
  EVALUATION_VIEWED: "evaluation_viewed",
  EVALUATION_DELETED: "evaluation_deleted",
  CASE_TEXT_REDACTED: "case_text_redacted",
  DATA_RETENTION_PURGE: "data_retention_purge",
  EXPORT_REQUESTED: "export_requested",
});

export { ACTIONS };

export function writeAuditEntry({ evalId, action, actor, detail }) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO audit_log (eval_id, action, actor, detail)
    VALUES (?, ?, ?, ?)
  `);
  stmt.run(evalId ?? null, action, actor ?? "system", detail ?? null);
}

export function getAuditTrail(evalId) {
  const db = getDb();
  return db
    .prepare(
      `SELECT id, eval_id, action, actor, detail, created_at
       FROM audit_log
       WHERE eval_id = ?
       ORDER BY created_at ASC`,
    )
    .all(evalId);
}

export function getRecentAuditEntries(limit = 50) {
  const db = getDb();
  return db
    .prepare(
      `SELECT id, eval_id, action, actor, detail, created_at
       FROM audit_log
       ORDER BY created_at DESC
       LIMIT ?`,
    )
    .all(limit);
}

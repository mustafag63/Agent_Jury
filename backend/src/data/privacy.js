import { getDb } from "./store.js";
import { writeAuditEntry, ACTIONS } from "./audit.js";
import config from "../config/index.js";

const PII_PATTERNS = [
  { name: "email", pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g },
  {
    name: "phone",
    pattern: /(\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}/g,
  },
  { name: "ssn", pattern: /\b\d{3}-\d{2}-\d{4}\b/g },
  { name: "credit_card", pattern: /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g },
  { name: "ip_address", pattern: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g },
  { name: "tc_kimlik", pattern: /\b\d{11}\b/g },
];

export function detectPII(text) {
  const detections = [];
  for (const { name, pattern } of PII_PATTERNS) {
    const cloned = new RegExp(pattern.source, pattern.flags);
    const matches = text.match(cloned);
    if (matches) {
      detections.push({ type: name, count: matches.length });
    }
  }
  return detections;
}

export function redactPII(text) {
  let redacted = text;
  for (const { name, pattern } of PII_PATTERNS) {
    const cloned = new RegExp(pattern.source, pattern.flags);
    redacted = redacted.replace(cloned, `[REDACTED_${name.toUpperCase()}]`);
  }
  return redacted;
}

export function deleteEvaluation(evalId, actor) {
  const db = getDb();

  const row = db
    .prepare("SELECT id FROM evaluations WHERE id = ? AND deleted_at IS NULL")
    .get(evalId);
  if (!row) return false;

  db.prepare(
    `UPDATE evaluations
     SET case_text = NULL, result_json = '{}', deleted_at = datetime('now')
     WHERE id = ?`,
  ).run(evalId);

  writeAuditEntry({
    evalId,
    action: ACTIONS.EVALUATION_DELETED,
    actor,
    detail: "GDPR/KVKK erasure: case_text nullified, result_json cleared",
  });

  return true;
}

export function redactCaseText(evalId, actor) {
  const db = getDb();

  const row = db
    .prepare("SELECT case_text FROM evaluations WHERE id = ? AND deleted_at IS NULL")
    .get(evalId);
  if (!row || !row.case_text) return false;

  const redacted = redactPII(row.case_text);
  db.prepare("UPDATE evaluations SET case_text = ? WHERE id = ?").run(redacted, evalId);

  writeAuditEntry({
    evalId,
    action: ACTIONS.CASE_TEXT_REDACTED,
    actor,
    detail: "PII patterns redacted from stored case_text",
  });

  return true;
}

export function purgeExpired() {
  const db = getDb();

  const expired = db
    .prepare(
      `SELECT id FROM evaluations
       WHERE expires_at IS NOT NULL
         AND expires_at <= datetime('now')
         AND deleted_at IS NULL`,
    )
    .all();

  if (expired.length === 0) return 0;

  const ids = expired.map((r) => r.id);

  const update = db.prepare(
    `UPDATE evaluations
     SET case_text = NULL, result_json = '{}', deleted_at = datetime('now')
     WHERE id = ?`,
  );

  const auditInsert = db.prepare(
    `INSERT INTO audit_log (eval_id, action, actor, detail)
     VALUES (?, ?, 'system', 'Data retention: auto-purged after expiry')`,
  );

  const purge = db.transaction(() => {
    for (const id of ids) {
      update.run(id);
      auditInsert.run(id, ACTIONS.DATA_RETENTION_PURGE);
    }
  });

  purge();
  return ids.length;
}

export function computeExpiresAt() {
  const days = config.data.retentionDays;
  if (!days || days <= 0) return null;
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().replace("T", " ").slice(0, 19);
}

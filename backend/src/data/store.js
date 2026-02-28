import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";
import config from "../config/index.js";

let db = null;

export function getDb() {
  if (db) return db;

  const dbPath = config.data.dbPath || path.join(process.cwd(), "data", "agent_jury.db");

  mkdirSync(path.dirname(dbPath), { recursive: true });

  db = new Database(dbPath, { fileMustExist: false });
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  migrate(db);
  return db;
}

function migrate(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS evaluations (
      id                TEXT PRIMARY KEY,
      case_hash         TEXT NOT NULL,
      case_text_stored  INTEGER NOT NULL DEFAULT 0,
      case_text         TEXT,
      decision          TEXT NOT NULL,
      final_score       INTEGER NOT NULL,
      result_json       TEXT NOT NULL,
      prompt_version    TEXT,
      model_used        TEXT,
      provider_used     TEXT,
      temperature       REAL,
      seed              INTEGER,
      dual_pass         INTEGER NOT NULL DEFAULT 0,
      request_ip        TEXT,
      created_at        TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at        TEXT,
      deleted_at        TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_evaluations_case_hash
      ON evaluations(case_hash);
    CREATE INDEX IF NOT EXISTS idx_evaluations_created_at
      ON evaluations(created_at);
    CREATE INDEX IF NOT EXISTS idx_evaluations_deleted_at
      ON evaluations(deleted_at);
    CREATE INDEX IF NOT EXISTS idx_evaluations_expires_at
      ON evaluations(expires_at);

    CREATE TABLE IF NOT EXISTS audit_log (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      eval_id     TEXT,
      action      TEXT NOT NULL,
      actor       TEXT,
      detail      TEXT,
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (eval_id) REFERENCES evaluations(id)
    );

    CREATE INDEX IF NOT EXISTS idx_audit_eval_id
      ON audit_log(eval_id);
    CREATE INDEX IF NOT EXISTS idx_audit_action
      ON audit_log(action);
    CREATE INDEX IF NOT EXISTS idx_audit_created_at
      ON audit_log(created_at);
  `);
}

export function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}

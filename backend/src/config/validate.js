import config from "./index.js";
import logger from "../observability/logger.js";

export function validateConfigOnStartup() {
  const warnings = [];
  const errors = [];

  // ── LLM ──────────────────────────────────────────
  if (!config.llm.apiKey) {
    errors.push("LLM_API_KEY is not set — /evaluate will return 500.");
  }
  if (config.llm.providerChain.length < 2) {
    warnings.push(
      "Only one LLM provider configured — set LLM_MODEL_FALLBACK or LLM_FALLBACK_PROVIDER for resilience.",
    );
  }

  // ── AI ───────────────────────────────────────────
  const { ai } = config;
  if (ai.temperature < 0 || ai.temperature > 1) {
    warnings.push(
      `AI_TEMPERATURE=${ai.temperature} is outside recommended range [0, 1].`,
    );
  }
  if (ai.dualPass) {
    warnings.push(
      "AI_DUAL_PASS=true — each agent will run twice for consistency checking (doubles LLM cost).",
    );
  }

  // ── Scoring ──────────────────────────────────────
  const { weights, thresholds, consensus } = config.scoring;
  const weightSum = weights.feasibility + weights.innovation + weights.risk;
  const WEIGHT_EPSILON = 0.001;

  if (Math.abs(weightSum - 1.0) > WEIGHT_EPSILON) {
    errors.push(
      `Scoring weights must sum to 1.0 (got ${weightSum.toFixed(4)}). ` +
        `Current: feasibility=${weights.feasibility}, innovation=${weights.innovation}, risk=${weights.risk}.`,
    );
  }

  for (const [name, val] of Object.entries(weights)) {
    if (val < 0 || val > 1) {
      errors.push(
        `SCORE_WEIGHT_${name.toUpperCase()}=${val} is outside valid range [0, 1].`,
      );
    }
  }

  if (thresholds.ship <= thresholds.iterate) {
    errors.push(
      `SCORE_THRESHOLD_SHIP (${thresholds.ship}) must be greater than SCORE_THRESHOLD_ITERATE (${thresholds.iterate}).`,
    );
  }
  if (thresholds.iterate <= 0 || thresholds.ship > 100) {
    errors.push(
      `Thresholds out of range: iterate=${thresholds.iterate}, ship=${thresholds.ship}. Must be within (0, 100].`,
    );
  }

  if (consensus.weakSpread <= consensus.moderateSpread) {
    warnings.push(
      `SCORE_WEAK_SPREAD (${consensus.weakSpread}) should be > SCORE_MODERATE_SPREAD (${consensus.moderateSpread}).`,
    );
  }
  if (consensus.weakStdDev <= consensus.moderateStdDev) {
    warnings.push(
      `SCORE_WEAK_STDDEV (${consensus.weakStdDev}) should be > SCORE_MODERATE_STDDEV (${consensus.moderateStdDev}).`,
    );
  }

  // ── Data Management ─────────────────────────────
  const { data } = config;
  if (data.storeCaseText && config.nodeEnv === "production" && !data.retentionDays) {
    warnings.push(
      "DATA_STORE_CASE_TEXT=true in production but DATA_RETENTION_DAYS is not set — " +
        "case text will be stored indefinitely. Set a retention period for GDPR/KVKK compliance.",
    );
  }
  if (data.retentionDays < 0) {
    warnings.push(
      `DATA_RETENTION_DAYS=${data.retentionDays} is negative — no auto-purge will occur.`,
    );
  }

  // ── Security ─────────────────────────────────────
  if (config.security.authEnabled && config.security.apiKeys.length === 0) {
    warnings.push(
      "AUTH_ENABLED is true but API_KEYS is empty — authentication is effectively disabled. " +
        "Set API_KEYS or AUTH_ENABLED=false.",
    );
  }
  if (config.nodeEnv === "production" && config.security.cors.origins.length === 0) {
    warnings.push(
      "CORS_ORIGINS is empty in production — all cross-origin requests will be blocked.",
    );
  }
  if (config.nodeEnv === "production" && !config.security.authEnabled) {
    warnings.push(
      "AUTH_ENABLED=false in production — API is publicly accessible without authentication.",
    );
  }

  const pk = config.attestation.privateKey;
  if (pk && !/^0x[0-9a-fA-F]{64}$/.test(pk)) {
    warnings.push(
      "ATTESTATION_PRIVATE_KEY has invalid hex format — attestation signing will be disabled.",
    );
  }

  if (config.security.apiKeys.some((k) => k.length < 32)) {
    warnings.push(
      "One or more API_KEYS are shorter than 32 characters — use longer keys for production.",
    );
  }

  const log = logger.child({ module: "config" });
  for (const w of warnings) log.warn(w);
  for (const e of errors) log.error(e);

  return { warnings, errors };
}

import "dotenv/config";

const parseList = (raw) => {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
};

function parseProviderChain(env) {
  const primary = {
    provider: env.LLM_PROVIDER || "openrouter",
    apiKey: env.LLM_API_KEY || "",
    model: env.LLM_MODEL || "google/gemini-2.0-flash-001",
  };

  const chain = [primary];

  if (env.LLM_MODEL_FALLBACK && env.LLM_MODEL_FALLBACK !== primary.model) {
    chain.push({
      provider: primary.provider,
      apiKey: primary.apiKey,
      model: env.LLM_MODEL_FALLBACK,
    });
  }

  if (env.LLM_FALLBACK_PROVIDER && env.LLM_FALLBACK_API_KEY) {
    chain.push({
      provider: env.LLM_FALLBACK_PROVIDER,
      apiKey: env.LLM_FALLBACK_API_KEY,
      model: env.LLM_FALLBACK_MODEL || primary.model,
    });
  }

  return chain;
}

function num(envVal, fallback) {
  if (envVal === undefined || envVal === "") return fallback;
  const n = Number(envVal);
  return Number.isFinite(n) ? n : fallback;
}

const config = Object.freeze({
  port: Number(process.env.PORT) || 4000,
  nodeEnv: process.env.NODE_ENV || "development",

  llm: Object.freeze({
    apiKey: process.env.LLM_API_KEY || "",
    provider: process.env.LLM_PROVIDER || "openrouter",
    model: process.env.LLM_MODEL || "google/gemini-2.0-flash-001",
    modelFallback: process.env.LLM_MODEL_FALLBACK || "google/gemini-2.0-flash-lite-001",
    providerChain: Object.freeze(parseProviderChain(process.env)),
  }),

  ai: Object.freeze({
    temperature: num(process.env.AI_TEMPERATURE, 0.2),
    seed: process.env.AI_SEED ? Number(process.env.AI_SEED) : null,
    dualPass: process.env.AI_DUAL_PASS === "true",
  }),

  scoring: Object.freeze({
    weights: Object.freeze({
      feasibility: num(process.env.SCORE_WEIGHT_FEASIBILITY, 0.45),
      innovation: num(process.env.SCORE_WEIGHT_INNOVATION, 0.35),
      risk: num(process.env.SCORE_WEIGHT_RISK, 0.2),
    }),

    thresholds: Object.freeze({
      ship: num(process.env.SCORE_THRESHOLD_SHIP, 75),
      iterate: num(process.env.SCORE_THRESHOLD_ITERATE, 50),
    }),

    riskInversion: process.env.SCORE_RISK_INVERSION !== "false",

    consensus: Object.freeze({
      disagreementDelta: num(process.env.SCORE_DISAGREEMENT_DELTA, 30),
      weakSpread: num(process.env.SCORE_WEAK_SPREAD, 40),
      weakStdDev: num(process.env.SCORE_WEAK_STDDEV, 25),
      moderateSpread: num(process.env.SCORE_MODERATE_SPREAD, 25),
      moderateStdDev: num(process.env.SCORE_MODERATE_STDDEV, 15),
    }),

    lowConfidenceThreshold: num(process.env.SCORE_LOW_CONFIDENCE_THRESHOLD, 30),
  }),

  data: Object.freeze({
    dbPath: process.env.DATA_DB_PATH || "",
    storeCaseText: process.env.DATA_STORE_CASE_TEXT !== "false",
    retentionDays: num(process.env.DATA_RETENTION_DAYS, 0),
    autoRedactPII: process.env.DATA_AUTO_REDACT_PII === "true",
    purgeIntervalMs: num(process.env.DATA_PURGE_INTERVAL_MS, 3_600_000),
  }),

  attestation: Object.freeze({
    privateKey: process.env.ATTESTATION_PRIVATE_KEY || "",
  }),

  security: Object.freeze({
    apiKeys: parseList(process.env.API_KEYS),
    authEnabled: process.env.AUTH_ENABLED !== "false",

    rateLimit: Object.freeze({
      windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 60_000,
      maxGlobal: Number(process.env.RATE_LIMIT_MAX_GLOBAL) || 100,
      maxEvaluate: Number(process.env.RATE_LIMIT_MAX_EVALUATE) || 5,
    }),

    cors: Object.freeze({
      origins: parseList(process.env.CORS_ORIGINS),
    }),
  }),
});

export default config;

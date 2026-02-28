import express from "express";
import config from "./config/index.js";
import logger from "./observability/logger.js";
import { validateConfigOnStartup } from "./config/validate.js";
import { requestId } from "./middleware/requestId.js";
import { requestLogger } from "./middleware/requestLogger.js";
import { createHelmet, createCors } from "./middleware/secureHeaders.js";
import { globalLimiter, evaluateLimiter } from "./middleware/rateLimiter.js";
import { apiKeyAuth } from "./middleware/auth.js";
import { inputSanitization } from "./middleware/sanitizer.js";
import healthRouter from "./routes/health.js";
import metricsRouter from "./routes/metrics.js";
import evaluateRouter from "./routes/evaluate.js";
import evaluationsRouter from "./routes/evaluations.js";
import { getDb, closeDb } from "./data/store.js";
import { purgeExpired } from "./data/privacy.js";

validateConfigOnStartup();

getDb();

const app = express();

app.disable("x-powered-by");
app.set("trust proxy", 1);

app.use(requestId);
app.use(requestLogger);
app.use(createHelmet());
app.use(createCors());
app.use(globalLimiter);
app.use(express.json({ limit: "1mb" }));

app.use(healthRouter);
app.use(metricsRouter);
app.use(apiKeyAuth);
app.use(inputSanitization);
app.use("/evaluate", evaluateLimiter);
app.use(evaluateRouter);
app.use(evaluationsRouter);

let purgeTimer = null;
if (config.data.retentionDays > 0 && config.data.purgeIntervalMs > 0) {
  purgeTimer = setInterval(() => {
    try {
      const count = purgeExpired();
      if (count > 0) {
        logger.info({ purgedCount: count }, "expired evaluations purged");
      }
    } catch (err) {
      logger.error({ err }, "retention purge failed");
    }
  }, config.data.purgeIntervalMs);
}

const server = app.listen(config.port, () => {
  logger.info(
    { port: config.port, env: config.nodeEnv, pid: process.pid },
    "Agent Jury backend started",
  );
});

function gracefulShutdown(signal) {
  logger.info({ signal }, "shutdown signal received, draining connections…");

  if (purgeTimer) clearInterval(purgeTimer);

  server.close(() => {
    logger.info("HTTP server closed");
    closeDb();
    logger.info("database connection closed");
    process.exit(0);
  });

  setTimeout(() => {
    logger.error("forced shutdown after timeout");
    process.exit(1);
  }, 10_000);
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

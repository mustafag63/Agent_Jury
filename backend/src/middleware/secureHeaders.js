import helmet from "helmet";
import cors from "cors";
import config from "../config/index.js";
import logger from "../observability/logger.js";

export function createHelmet() {
  return helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        objectSrc: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
    hsts: config.nodeEnv === "production",
  });
}

export function createCors() {
  const origins = config.security.cors.origins;

  if (origins.length === 0) {
    if (config.nodeEnv === "production") {
      logger.warn(
        "CORS_ORIGINS is empty in production — all cross-origin requests will be blocked",
      );
    }
    return cors(config.nodeEnv === "production" ? { origin: false } : { origin: true });
  }

  return cors({
    origin(origin, cb) {
      if (!origin || origins.includes(origin)) {
        cb(null, true);
      } else {
        cb(new Error(`Origin ${origin} not allowed by CORS`));
      }
    },
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-API-Key", "X-Request-Id"],
    maxAge: 86_400,
  });
}

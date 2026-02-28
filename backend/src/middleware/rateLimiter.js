import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import config from "../config/index.js";

const { rateLimit: rl } = config.security;

export const globalLimiter = rateLimit({
  windowMs: rl.windowMs,
  max: rl.maxGlobal,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Too many requests",
    details: `Rate limit exceeded. Try again in ${Math.ceil(rl.windowMs / 1000)}s.`,
  },
});

export const evaluateLimiter = rateLimit({
  windowMs: rl.windowMs,
  max: rl.maxEvaluate,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.headers["x-api-key"] || ipKeyGenerator(req.ip),
  message: {
    error: "Evaluation rate limit exceeded",
    details: `Max ${rl.maxEvaluate} evaluations per ${Math.ceil(rl.windowMs / 1000)}s. Wait before retrying.`,
  },
});

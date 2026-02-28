import pino from "pino";
import config from "../config/index.js";

const isDev = config.nodeEnv !== "production";

const logger = pino({
  level: process.env.LOG_LEVEL || (isDev ? "debug" : "info"),
  ...(isDev ? { transport: { target: "pino-pretty", options: { colorize: true } } } : {}),
  base: { service: "agent-jury-backend", env: config.nodeEnv },
  timestamp: pino.stdTimeFunctions.isoTime,
  serializers: {
    err: pino.stdSerializers.err,
    req: (req) => ({
      method: req.method,
      url: req.url,
      requestId: req.requestId,
      ip: req.ip,
    }),
    res: (res) => ({
      statusCode: res.statusCode,
    }),
  },
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers['x-api-key']",
      "*.apiKey",
      "*.privateKey",
    ],
    censor: "[REDACTED]",
  },
});

export default logger;

import crypto from "node:crypto";
import config from "../config/index.js";

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export function apiKeyAuth(req, res, next) {
  const { security } = config;

  if (!security.authEnabled || security.apiKeys.length === 0) {
    return next();
  }

  const header = req.headers["x-api-key"] || "";
  const bearer = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const token = header || bearer;

  if (!token) {
    return res.status(401).json({
      error: "Authentication required",
      details:
        "Provide a valid API key via X-API-Key header or Authorization: Bearer <key>.",
    });
  }

  const valid = security.apiKeys.some((key) => timingSafeEqual(token, key));

  if (!valid) {
    return res.status(403).json({
      error: "Invalid API key",
      details: "The provided API key is not recognized.",
    });
  }

  return next();
}

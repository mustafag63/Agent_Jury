import logger from "../observability/logger.js";

// eslint-disable-next-line no-control-regex
const CONTROL_CHAR_RE = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;

const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?(previous|prior|above)\s+(instructions?|prompts?|rules?)/i,
  /disregard\s+(all\s+)?(previous|prior|above)\s+(instructions?|prompts?|rules?)/i,
  /forget\s+(all\s+)?(previous|prior|above)\s+(instructions?|prompts?|rules?)/i,
  /you\s+are\s+now\s+(?:a|an|the)\b/i,
  /\bsystem\s*:\s*/i,
  /\bassistant\s*:\s*/i,
  /\b(ADMIN|ROOT|SUDO)\s+(MODE|ACCESS|OVERRIDE)\b/i,
  /act\s+as\s+(if\s+)?you\s+(are|were)\b/i,
  /pretend\s+(you\s+are|to\s+be)\b/i,
  /new\s+instructions?\s*:/i,
  /override\s+(previous|system)\s*/i,
  /\[\s*SYSTEM\s*\]/i,
  /<\s*\/?system\s*>/i,
  /do\s+not\s+follow\s+(the\s+)?(previous|above|original)/i,
  /reveal\s+(your|the)\s+(system\s+)?(prompt|instructions?|rules?)/i,
  /what\s+(is|are)\s+your\s+(system\s+)?(prompt|instructions?|rules?)/i,
  /repeat\s+(your|the)\s+(system\s+)?(prompt|instructions?|rules?)/i,
  /output\s+(your|the)\s+(system\s+)?(prompt|instructions?)/i,
];

export function stripControlChars(text) {
  return text.replace(CONTROL_CHAR_RE, "");
}

export function detectInjection(text) {
  const matches = [];
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(text)) {
      matches.push(pattern.source);
    }
  }
  return matches;
}

export function sanitizeCaseText(text) {
  let clean = stripControlChars(text);
  clean = clean.replace(/\n{3,}/g, "\n\n");
  clean = clean.trim();
  return clean;
}

export function inputSanitization(req, res, next) {
  if (req.method !== "POST" || !req.body?.case_text) {
    return next();
  }

  const raw = String(req.body.case_text);
  const clean = sanitizeCaseText(raw);
  const injections = detectInjection(clean);

  if (injections.length > 0) {
    const log = req.log || logger;
    log.warn(
      { ip: req.ip, injectionCount: injections.length },
      "prompt injection attempt detected",
    );
    return res.status(400).json({
      error: "Input rejected",
      details:
        "The submitted text contains patterns that are not allowed. Please rephrase your case description.",
    });
  }

  req.body.case_text = clean;
  return next();
}

import { callLLMWithProviderFallback } from "../llm/client.js";
import { parseAndValidate, clampScore } from "../validation/schema.js";
import { buildSystemPrompt, buildUserPrompt, getPromptVersion } from "./prompts.js";
import logger from "../observability/logger.js";
import metrics from "../observability/metrics.js";

const CONSISTENCY_SCORE_TOLERANCE = 15;

function normalizeResponse(validated, role) {
  return {
    role,
    score: clampScore(validated.score),
    confidence: clampScore(validated.confidence ?? 50),
    score_breakdown: validated.score_breakdown ?? {
      primary: validated.score,
      secondary: validated.score,
      tertiary: validated.score,
    },
    pros: validated.pros,
    cons: validated.cons,
    evidence: validated.evidence ?? [],
    rationale: validated.rationale,
    uncertainty_flags: validated.uncertainty_flags ?? [],
  };
}

function detectBias(result) {
  const flags = [];

  if (result.score === 50) {
    flags.push("fence_sitting: score is exactly 50 (possible non-committal)");
  }

  if (result.score >= 95 && result.cons.length === 0) {
    flags.push("uncritical_positive: very high score with no cons listed");
  }
  if (result.score <= 5 && result.pros.length === 0) {
    flags.push("uncritical_negative: very low score with no pros listed");
  }

  if (result.evidence.length === 0 && result.confidence > 70) {
    flags.push("ungrounded_confidence: high confidence but no evidence cited");
  }

  const { primary, secondary, tertiary } = result.score_breakdown;
  if (primary === secondary && secondary === tertiary && primary === result.score) {
    flags.push("uniform_breakdown: all sub-scores identical (possible lazy evaluation)");
  }

  const subAvg = (primary + secondary + tertiary) / 3;
  if (Math.abs(subAvg - result.score) > 20) {
    flags.push(
      `breakdown_mismatch: sub-score avg ${Math.round(subAvg)} vs overall ${result.score}`,
    );
  }

  return flags;
}

async function singlePass({
  providers,
  systemPrompt,
  userPrompt,
  role,
  seed,
  temperature,
}) {
  const raw = await callLLMWithProviderFallback({
    providers,
    systemPrompt,
    userPrompt,
    seed,
    temperature,
  });
  const validated = parseAndValidate(raw);
  return normalizeResponse(validated, role);
}

export async function runSingleAgent({
  providers,
  roleName,
  focusPrompt,
  caseText,
  seed = null,
  temperature = 0.2,
  dualPass = false,
}) {
  const log = logger.child({ agent: roleName });
  const elapsed = metrics.agentRunStart();

  try {
    const systemPrompt = buildSystemPrompt(roleName);
    const userPrompt = buildUserPrompt(caseText, focusPrompt);

    const primary = await singlePass({
      providers,
      systemPrompt,
      userPrompt,
      role: roleName,
      seed,
      temperature,
    });

    const biasFlags = detectBias(primary);
    primary.bias_flags = biasFlags;
    primary.prompt_version = getPromptVersion();

    if (biasFlags.length > 0) {
      log.warn({ biasFlags }, "bias detected in agent response");
    }

    if (!dualPass) {
      primary.consistency = null;
      metrics.agentRunEnd(elapsed, { role: roleName, success: true });
      log.info(
        { score: primary.score, confidence: primary.confidence },
        "agent completed",
      );
      return primary;
    }

    const verifySeed = seed !== null ? seed + 1 : null;
    let verification;
    try {
      verification = await singlePass({
        providers,
        systemPrompt,
        userPrompt,
        role: roleName,
        seed: verifySeed,
        temperature,
      });
    } catch (err) {
      log.warn({ err: { message: err.message } }, "dual-pass verification failed");
      primary.consistency = {
        ran: true,
        passed: false,
        error: "verification_pass_failed",
        delta: null,
      };
      metrics.agentRunEnd(elapsed, { role: roleName, success: true });
      return primary;
    }

    const delta = Math.abs(primary.score - verification.score);
    const passed = delta <= CONSISTENCY_SCORE_TOLERANCE;

    if (!passed) {
      const avgScore = clampScore((primary.score + verification.score) / 2);
      const avgConfidence = clampScore(
        Math.min(primary.confidence, verification.confidence) * 0.8,
      );

      log.warn(
        { delta, primaryScore: primary.score, verifyScore: verification.score },
        "consistency check failed, averaging scores",
      );

      primary.score = avgScore;
      primary.confidence = avgConfidence;
      primary.uncertainty_flags = [
        ...primary.uncertainty_flags,
        `consistency_delta_${delta}: scores diverged across two runs (${primary.score} vs ${verification.score})`,
      ];
    }

    primary.consistency = {
      ran: true,
      passed,
      delta,
      verification_score: verification.score,
    };

    metrics.agentRunEnd(elapsed, { role: roleName, success: true });
    log.info(
      {
        score: primary.score,
        confidence: primary.confidence,
        consistencyPassed: passed,
      },
      "agent completed (dual-pass)",
    );
    return primary;
  } catch (err) {
    metrics.agentRunEnd(elapsed, { role: roleName, success: false });
    log.error({ err }, "agent failed");
    throw err;
  }
}

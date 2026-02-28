import config from "../config/index.js";
import { clampScore } from "../validation/schema.js";

// ── Helpers ────────────────────────────────────────

function stdDev(values) {
  if (values.length === 0) return 0;
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  const sqDiffs = values.map((v) => (v - avg) ** 2);
  return Math.sqrt(sqDiffs.reduce((a, b) => a + b, 0) / values.length);
}

function findAgent(results, role) {
  return results.find((a) => a.role === role) ?? null;
}

// ── 1. Normalize & extract ─────────────────────────

function normalizeAgentScores(agentResults) {
  const f = findAgent(agentResults, "Feasibility Agent");
  const i = findAgent(agentResults, "Innovation Agent");
  const r = findAgent(agentResults, "Risk & Ethics Agent");

  return {
    feasibility: {
      raw: f?.score ?? null,
      normalized: clampScore(f?.score ?? 0),
      confidence: clampScore(f?.confidence ?? 0),
      present: f !== null,
    },
    innovation: {
      raw: i?.score ?? null,
      normalized: clampScore(i?.score ?? 0),
      confidence: clampScore(i?.confidence ?? 0),
      present: i !== null,
    },
    risk: {
      raw: r?.score ?? null,
      normalized: clampScore(r?.score ?? 0),
      confidence: clampScore(r?.confidence ?? 0),
      present: r !== null,
    },
  };
}

// ── 2. Consensus analysis ──────────────────────────

function analyzeConsensus(agentResults) {
  const { consensus: cfg } = config.scoring;

  const scores = agentResults.filter((a) => a !== null).map((a) => a.score);
  const confidences = agentResults
    .filter((a) => a !== null)
    .map((a) => a.confidence ?? 0);

  if (scores.length === 0) {
    return {
      level: "none",
      score_std_dev: 0,
      score_spread: 0,
      avg_confidence: 0,
      disagreements: [],
    };
  }

  const scoreStdDev = stdDev(scores);
  const avgConfidence = confidences.reduce((a, b) => a + b, 0) / confidences.length;
  const spread = Math.max(...scores) - Math.min(...scores);

  const disagreements = [];
  for (let x = 0; x < agentResults.length; x++) {
    for (let y = x + 1; y < agentResults.length; y++) {
      if (!agentResults[x] || !agentResults[y]) continue;
      const delta = Math.abs(agentResults[x].score - agentResults[y].score);
      if (delta >= cfg.disagreementDelta) {
        disagreements.push({
          agents: [agentResults[x].role, agentResults[y].role],
          delta,
          scores: [agentResults[x].score, agentResults[y].score],
        });
      }
    }
  }

  let level = "strong";
  if (spread > cfg.weakSpread || scoreStdDev > cfg.weakStdDev) {
    level = "weak";
  } else if (spread > cfg.moderateSpread || scoreStdDev > cfg.moderateStdDev) {
    level = "moderate";
  }

  return {
    level,
    score_std_dev: Math.round(scoreStdDev * 10) / 10,
    score_spread: spread,
    avg_confidence: Math.round(avgConfidence),
    disagreements,
  };
}

// ── 3. Edge-case detector ──────────────────────────

function detectEdgeCases(scores) {
  const flags = [];
  const { lowConfidenceThreshold } = config.scoring;

  const presentAgents = [scores.feasibility, scores.innovation, scores.risk].filter(
    (s) => s.present,
  );

  if (presentAgents.length === 0) {
    flags.push("no_agent_data: none of the 3 agents returned a result");
    return { flags, severity: "critical" };
  }

  if (presentAgents.length < 3) {
    const missing = [
      !scores.feasibility.present && "Feasibility",
      !scores.innovation.present && "Innovation",
      !scores.risk.present && "Risk",
    ].filter(Boolean);
    flags.push(`missing_agents: ${missing.join(", ")}`);
  }

  const allLowConf = presentAgents.every((a) => a.confidence < lowConfidenceThreshold);
  if (allLowConf) {
    flags.push(`all_low_confidence: every agent confidence < ${lowConfidenceThreshold}`);
  }

  const allZeroScore = presentAgents.every((a) => a.normalized === 0);
  if (allZeroScore) {
    flags.push("all_zero_scores: every present agent scored 0");
  }

  const allMaxScore = presentAgents.every((a) => a.normalized === 100);
  if (allMaxScore) {
    flags.push("all_max_scores: every present agent scored 100");
  }

  let severity = "none";
  if (flags.length > 0) severity = "warning";
  if (allLowConf || presentAgents.length === 0) severity = "critical";

  return { flags, severity };
}

// ── 4. Raw weighted score ──────────────────────────

function computeRawScore(scores, weights, riskInversion) {
  const fEff = scores.feasibility.normalized;
  const iEff = scores.innovation.normalized;
  const rRaw = scores.risk.normalized;
  const rEff = riskInversion ? 100 - rRaw : rRaw;

  const raw =
    fEff * weights.feasibility + iEff * weights.innovation + rEff * weights.risk;

  return {
    value: clampScore(raw),
    components: {
      feasibility: {
        score: fEff,
        weight: weights.feasibility,
        contribution: Math.round(fEff * weights.feasibility * 10) / 10,
      },
      innovation: {
        score: iEff,
        weight: weights.innovation,
        contribution: Math.round(iEff * weights.innovation * 10) / 10,
      },
      risk: {
        raw_score: rRaw,
        inverted: riskInversion,
        effective_score: rEff,
        weight: weights.risk,
        contribution: Math.round(rEff * weights.risk * 10) / 10,
        explanation: riskInversion
          ? `Risk raw=${rRaw} inverted to ${rEff} (lower risk → higher contribution)`
          : `Risk raw=${rRaw} used directly (higher risk → higher contribution)`,
      },
    },
  };
}

// ── 5. Confidence-weighted score ───────────────────

function computeConfidenceWeightedScore(scores, weights, riskInversion) {
  const entries = [
    {
      s: scores.feasibility,
      w: weights.feasibility,
      key: "feasibility",
      invert: false,
    },
    {
      s: scores.innovation,
      w: weights.innovation,
      key: "innovation",
      invert: false,
    },
    {
      s: scores.risk,
      w: weights.risk,
      key: "risk",
      invert: riskInversion,
    },
  ];

  let totalWeight = 0;
  let weighted = 0;

  for (const { s, w, invert } of entries) {
    if (!s.present) continue;
    const confFactor = s.confidence / 100;
    const adjustedWeight = w * (0.5 + 0.5 * confFactor);
    const effective = invert ? 100 - s.normalized : s.normalized;

    weighted += effective * adjustedWeight;
    totalWeight += adjustedWeight;
  }

  return totalWeight > 0 ? clampScore(weighted / totalWeight) : 0;
}

// ── 6. Decision logic ──────────────────────────────

function decideOutcome(finalScore, consensus, edgeCases) {
  const { thresholds } = config.scoring;

  if (edgeCases.severity === "critical") {
    return {
      decision: "ABSTAIN",
      reason: "Critical edge case detected — insufficient data for a reliable decision.",
    };
  }

  let decision = "REJECT";
  let reason = `Final score ${finalScore} < iterate threshold ${thresholds.iterate}`;

  if (finalScore >= thresholds.ship) {
    decision = "SHIP";
    reason = `Final score ${finalScore} >= ship threshold ${thresholds.ship}`;
  } else if (finalScore >= thresholds.iterate) {
    decision = "ITERATE";
    reason = `Final score ${finalScore} >= iterate threshold ${thresholds.iterate}`;
  }

  if (consensus.level === "weak" && decision === "SHIP") {
    decision = "ITERATE";
    reason += " [downgraded from SHIP: weak consensus]";
  }

  if (edgeCases.severity === "warning" && decision === "SHIP") {
    reason += " [caution: edge case warnings present]";
  }

  return { decision, reason };
}

// ── 7. Next steps ──────────────────────────────────

function generateNextSteps(decision, scores, consensus) {
  const steps = [];

  if (decision === "ABSTAIN") {
    steps.push("Provide more detailed case information and re-evaluate.");
    return steps;
  }

  steps.push(
    decision === "SHIP"
      ? "Build a small production pilot and track usage."
      : "Run one focused iteration on the weakest dimension first.",
  );

  const f = scores.feasibility.normalized;
  const i = scores.innovation.normalized;
  const r = scores.risk.normalized;

  steps.push(
    f < 60
      ? `Feasibility is low (${f}) — reduce implementation complexity and tighten scope.`
      : `Feasibility is solid (${f}) — keep technical scope disciplined.`,
  );
  steps.push(
    i < 60
      ? `Innovation is low (${i}) — strengthen differentiation with a unique feature.`
      : `Innovation is solid (${i}) — preserve the most differentiated element.`,
  );
  steps.push(
    r > 60
      ? `Risk is elevated (${r}) — add explicit safeguards for abuse, privacy, and edge cases.`
      : `Risk is manageable (${r}) — document responsible use and basic guardrails.`,
  );

  if (consensus.disagreements.length > 0) {
    const pairs = consensus.disagreements
      .map((d) => `${d.agents[0]} vs ${d.agents[1]} (Δ${d.delta})`)
      .join("; ");
    steps.push(`Resolve agent disagreements: ${pairs}.`);
  }

  return steps;
}

// ── Public API ─────────────────────────────────────

export function buildFinalVerdict(agentResults) {
  const { weights, riskInversion } = config.scoring;

  const scores = normalizeAgentScores(agentResults);
  const edgeCases = detectEdgeCases(scores);
  const consensus = analyzeConsensus(agentResults);

  const rawCalc = computeRawScore(scores, weights, riskInversion);
  const confidenceWeightedScore = computeConfidenceWeightedScore(
    scores,
    weights,
    riskInversion,
  );

  const finalScore =
    consensus.level === "strong" ? rawCalc.value : confidenceWeightedScore;

  const { decision, reason } = decideOutcome(finalScore, consensus, edgeCases);

  const f = scores.feasibility;
  const i = scores.innovation;
  const r = scores.risk;

  const summary =
    `Feasibility ${f.normalized} (conf ${f.confidence}), ` +
    `Innovation ${i.normalized} (conf ${i.confidence}), ` +
    `Risk ${r.normalized} (conf ${r.confidence}). ` +
    `Consensus: ${consensus.level}. ` +
    `Final score ${finalScore}, decision: ${decision}.`;

  const nextSteps = generateNextSteps(decision, scores, consensus);

  return {
    final_score: finalScore,
    decision,
    decision_reason: reason,

    scoring_math: {
      raw_score: rawCalc.value,
      confidence_weighted_score: confidenceWeightedScore,
      score_used: consensus.level === "strong" ? "raw" : "confidence_weighted",
      components: rawCalc.components,
      weights_applied: { ...weights },
      thresholds_applied: { ...config.scoring.thresholds },
      risk_inversion_enabled: riskInversion,
    },

    normalization: {
      feasibility: { raw: f.raw, normalized: f.normalized },
      innovation: { raw: i.raw, normalized: i.normalized },
      risk: { raw: r.raw, normalized: r.normalized },
      method: "clamp(round(value), 0, 100)",
      guarantee: "All scores are integers in [0, 100] after normalization.",
    },

    consensus,
    edge_cases: edgeCases,
    summary,
    next_steps: nextSteps,
  };
}

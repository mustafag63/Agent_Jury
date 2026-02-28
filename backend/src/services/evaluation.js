import { keccak256, toUtf8Bytes } from "ethers";
import { v4 as uuidv4 } from "uuid";
import config from "../config/index.js";
import { runSingleAgent } from "../agents/runner.js";
import { getRoleCriteria, getPromptVersion } from "../agents/prompts.js";
import { buildFinalVerdict } from "./scoring.js";
import { signAttestation } from "./attestation.js";
import { insertEvaluation } from "../data/evaluationRepo.js";
import { detectPII, redactPII, computeExpiresAt } from "../data/privacy.js";
import logger from "../observability/logger.js";
import metrics from "../observability/metrics.js";

const INTER_CALL_DELAY_MS = 1_500;

const AGENT_ROLES = ["Feasibility Agent", "Innovation Agent", "Risk & Ethics Agent"];

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function evaluateCase(caseText, { requestIp, requestId } = {}) {
  const evalId = uuidv4();
  const elapsed = metrics.evaluationStart();
  const { llm, ai, data } = config;

  const log = logger.child({ evalId, requestId });
  log.info({ caseTextLength: caseText.length, requestIp }, "evaluation started");

  const piiDetections = detectPII(caseText);
  if (piiDetections.length > 0) {
    log.warn({ piiDetections }, "PII detected in case text");
  }

  const caseTextForLLM =
    piiDetections.length > 0 && data.autoRedactPII ? redactPII(caseText) : caseText;

  const agentResults = [];
  const agentTimings = {};
  let modelActuallyUsed = llm.providerChain[0]?.model ?? "unknown";
  let providerActuallyUsed = llm.providerChain[0]?.provider ?? "unknown";

  for (let idx = 0; idx < AGENT_ROLES.length; idx++) {
    if (idx > 0) await delay(INTER_CALL_DELAY_MS);

    const roleName = AGENT_ROLES[idx];
    const criteria = getRoleCriteria(roleName);
    const agentStart = Date.now();

    const result = await runSingleAgent({
      providers: llm.providerChain,
      roleName,
      focusPrompt: criteria.focus,
      caseText: caseTextForLLM,
      seed: ai.seed,
      temperature: ai.temperature,
      dualPass: ai.dualPass,
    });

    agentTimings[roleName] = Date.now() - agentStart;
    agentResults.push(result);
  }

  const finalVerdict = buildFinalVerdict(agentResults);

  const caseHash = keccak256(toUtf8Bytes(caseText));
  const fScore = agentResults.find((a) => a.role === "Feasibility Agent")?.score ?? 0;
  const iScore = agentResults.find((a) => a.role === "Innovation Agent")?.score ?? 0;
  const rScore = agentResults.find((a) => a.role === "Risk & Ethics Agent")?.score ?? 0;

  const attestation = await signAttestation(
    caseHash,
    fScore,
    iScore,
    rScore,
    finalVerdict.final_score,
    finalVerdict.summary.slice(0, 140),
  );

  const promptVersion = getPromptVersion();
  const totalMs = elapsed();

  metrics.evaluationEnd(() => totalMs, {
    decision: finalVerdict.decision,
    success: true,
  });

  const meta = {
    eval_id: evalId,
    request_id: requestId || null,
    prompt_version: promptVersion,
    dual_pass: ai.dualPass,
    seed: ai.seed,
    temperature: ai.temperature,
    model_used: modelActuallyUsed,
    provider_used: providerActuallyUsed,
    provider_chain: llm.providerChain.map((p) => `${p.provider}/${p.model}`),
    elapsed_ms: Math.round(totalMs),
    agent_timings_ms: agentTimings,
    pii_detected: piiDetections,
    case_text_redacted: piiDetections.length > 0 && data.autoRedactPII,
  };

  const fullResult = {
    agent_results: agentResults,
    final_verdict: finalVerdict,
    attestation,
    meta,
  };

  const dataPrivacy = {
    case_text_stored: data.storeCaseText,
    retention_days: data.retentionDays || null,
    erasure_available: true,
    erasure_endpoint: `DELETE /evaluations/${evalId}`,
  };

  try {
    insertEvaluation({
      id: evalId,
      caseHash,
      caseText,
      storeCaseText: data.storeCaseText,
      decision: finalVerdict.decision,
      finalScore: finalVerdict.final_score,
      resultJson: JSON.stringify(fullResult),
      promptVersion,
      modelUsed: modelActuallyUsed,
      providerUsed: providerActuallyUsed,
      temperature: ai.temperature,
      seed: ai.seed,
      dualPass: ai.dualPass,
      requestIp,
      expiresAt: computeExpiresAt(),
    });
  } catch (err) {
    log.error({ err }, "failed to persist evaluation");
  }

  log.info(
    {
      decision: finalVerdict.decision,
      finalScore: finalVerdict.final_score,
      durationMs: Math.round(totalMs),
      agentTimings,
    },
    "evaluation completed",
  );

  return { ...fullResult, data_privacy: dataPrivacy };
}

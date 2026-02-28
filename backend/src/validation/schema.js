import { z } from "zod";

export const AgentResponseSchema = z
  .object({
    score: z.number().min(0).max(100),
    confidence: z.number().min(0).max(100),
    score_breakdown: z.object({
      primary: z.number().min(0).max(100),
      secondary: z.number().min(0).max(100),
      tertiary: z.number().min(0).max(100),
    }),
    pros: z.array(z.string().min(1).max(200)).min(1).max(5),
    cons: z.array(z.string().min(1).max(200)).min(1).max(5),
    evidence: z.array(z.string().min(1).max(300)).min(1).max(3),
    rationale: z.string().min(1).max(600),
    uncertainty_flags: z.array(z.string().max(150)).max(3),
  })
  .strict();

export const AgentResponseSchemaLegacy = z
  .object({
    score: z.number().min(0).max(100),
    pros: z.array(z.string().min(1).max(200)).max(5),
    cons: z.array(z.string().min(1).max(200)).max(5),
    rationale: z.string().min(1).max(600),
  })
  .strict();

export function parseAndValidate(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Model response is not valid JSON");
  }

  const full = AgentResponseSchema.safeParse(parsed);
  if (full.success) return full.data;

  const legacy = AgentResponseSchemaLegacy.safeParse(parsed);
  if (legacy.success) {
    return {
      ...legacy.data,
      confidence: 50,
      score_breakdown: {
        primary: legacy.data.score,
        secondary: legacy.data.score,
        tertiary: legacy.data.score,
      },
      evidence: [],
      uncertainty_flags: ["legacy_response_format"],
    };
  }

  throw new Error(`Model response failed schema validation: ${full.error.message}`);
}

export function clampScore(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

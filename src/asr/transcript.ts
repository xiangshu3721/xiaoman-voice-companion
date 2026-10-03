export type TranscriptCorrectionType = "HOMOPHONE" | "NEAR_HOMOPHONE" | "TYPO" | "ASR_FRAGMENT" | "PUNCTUATION" | "DOMAIN_TERM" | "UNCERTAIN";
export type SemanticRisk = "LOW" | "MEDIUM" | "HIGH";

export type TranscriptCorrection = {
  original: string;
  corrected: string;
  type: TranscriptCorrectionType;
  confidence: number;
  semanticRisk: SemanticRisk;
};

export type UncertainSpan = {
  text: string;
  reason: "LOW_CONFIDENCE" | "ALTERNATIVE_DISAGREEMENT" | "SEMANTIC_CRITICAL" | "POSSIBLE_DROPOUT";
  confidence?: number;
};

export type UserTranscript = {
  rawAsrText: string;
  correctedText: string;
  finalUserText: string;
  corrections: TranscriptCorrection[];
  confidence?: number;
  uncertainSpans?: UncertainSpan[];
  alternatives?: string[];
  speechDurationMs?: number;
  asrSessionCount?: number;
};

export type ASRQuality = {
  score: number;
  level: "HIGH" | "MEDIUM" | "LOW";
  fragmentation: number;
  confidence: number | "UNKNOWN";
  alternativeDisagreement: boolean;
  sessionCount: number;
  unresolvedSpans: number;
  semanticCriticalAmbiguity: boolean;
  possibleDropout: boolean;
  issues: string[];
};

const CRITICAL_TOKENS = /不|没|没有|别|不是|不要|从来没有|对不起|抱歉|我错了|怪我|我认错|原谅|分手|离婚|爱|不爱|恨|答应|保证|愿意|不愿意|可以|不可以|想|不想|死|自杀|伤害/;

function criticalSignature(text: string) {
  return [...text.matchAll(/不|没|没有|别|不是|不要|从来没有|对不起|抱歉|我错了|怪我|我认错|原谅|分手|离婚|爱|不爱|恨|答应|保证|愿意|不愿意|可以|不可以|想|不想|死|自杀|伤害/g)]
    .map((match) => match[0])
    .join("|");
}

const SAFE_CORRECTIONS: Array<{ pattern: RegExp; corrected: string; type: TranscriptCorrectionType; confidence: number }> = [
  { pattern: /吵价/g, corrected: "吵架", type: "HOMOPHONE", confidence: 0.98 },
  { pattern: /冷栈/g, corrected: "冷战", type: "HOMOPHONE", confidence: 0.96 },
  { pattern: /回消?息/g, corrected: "回消息", type: "DOMAIN_TERM", confidence: 0.94 },
  { pattern: /不想理里/g, corrected: "不想理你", type: "ASR_FRAGMENT", confidence: 0.94 },
];

function normalize(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export function conservativelyCorrectTranscript(input: { rawAsrText: string; confidence?: number; alternatives?: string[]; speechDurationMs?: number; asrSessionCount?: number }): UserTranscript {
  const rawAsrText = normalize(input.rawAsrText);
  let correctedText = rawAsrText;
  const corrections: TranscriptCorrection[] = [];
  const uncertainSpans: UncertainSpan[] = [];
  for (const candidate of SAFE_CORRECTIONS) {
    candidate.pattern.lastIndex = 0;
    if (!candidate.pattern.test(correctedText)) continue;
    candidate.pattern.lastIndex = 0;
    const original = correctedText.match(candidate.pattern)?.[0] || "";
    if (!original) continue;
    correctedText = correctedText.replace(candidate.pattern, candidate.corrected);
    corrections.push({ original, corrected: candidate.corrected, type: candidate.type, confidence: candidate.confidence, semanticRisk: "LOW" });
  }
  const alternatives = (input.alternatives || []).filter((item) => item && item !== rawAsrText).slice(0, 3);
  const rawCriticalSignature = criticalSignature(rawAsrText);
  const alternativeDisagreement = alternatives.some((item) => criticalSignature(item) !== rawCriticalSignature);
  if (typeof input.confidence !== "number") {
    if (alternativeDisagreement) uncertainSpans.push({ text: rawAsrText, reason: "ALTERNATIVE_DISAGREEMENT" });
  } else if (input.confidence < 0.85) {
    uncertainSpans.push({ text: rawAsrText, reason: "LOW_CONFIDENCE", confidence: input.confidence });
  }
  if (CRITICAL_TOKENS.test(rawAsrText) && (alternativeDisagreement || uncertainSpans.length > 0)) uncertainSpans.push({ text: rawAsrText, reason: "SEMANTIC_CRITICAL", confidence: input.confidence });
  const possibleDropout = Boolean(input.speechDurationMs && input.speechDurationMs > 8000 && correctedText.replace(/[^\u4e00-\u9fa5A-Za-z0-9]/g, "").length <= 2);
  if (possibleDropout) uncertainSpans.push({ text: correctedText, reason: "POSSIBLE_DROPOUT" });
  return { rawAsrText, correctedText, finalUserText: correctedText, corrections, confidence: input.confidence, uncertainSpans, alternatives, speechDurationMs: input.speechDurationMs, asrSessionCount: input.asrSessionCount };
}

export function assessASRQuality(transcript: UserTranscript): ASRQuality {
  const issues: string[] = [];
  const fragmentation = transcript.asrSessionCount && transcript.asrSessionCount > 1 ? Math.min(1, (transcript.asrSessionCount - 1) / 4) : 0;
  const confidence = typeof transcript.confidence === "number" ? transcript.confidence : "UNKNOWN" as const;
  const alternativeDisagreement = transcript.uncertainSpans?.some((span) => span.reason === "ALTERNATIVE_DISAGREEMENT") || false;
  const possibleDropout = transcript.uncertainSpans?.some((span) => span.reason === "POSSIBLE_DROPOUT") || false;
  const semanticCriticalAmbiguity = transcript.uncertainSpans?.some((span) => span.reason === "SEMANTIC_CRITICAL") || false;
  if (possibleDropout) { issues.push("POSSIBLE_ASR_DROPOUT"); }
  if (alternativeDisagreement) issues.push("SEMANTIC_AMBIGUITY");
  if (semanticCriticalAmbiguity) issues.push("SEMANTIC_CRITICAL_UNCERTAIN");
  const unresolvedSpans = transcript.uncertainSpans?.length || 0;
  const score = Math.max(0, Math.min(1, (typeof confidence === "number" ? confidence : 0.72) - fragmentation * 0.1 - unresolvedSpans * 0.08 - (possibleDropout ? 0.35 : 0)));
  return { score, level: score < 0.5 ? "LOW" : score < 0.78 ? "MEDIUM" : "HIGH", fragmentation, confidence, alternativeDisagreement, sessionCount: transcript.asrSessionCount || 1, unresolvedSpans, semanticCriticalAmbiguity, possibleDropout, issues };
}

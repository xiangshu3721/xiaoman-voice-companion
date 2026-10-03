import type { UserSemanticAnalysis } from "./user-semantic-analyzer";

export type ApologyEvidenceType = "EXPLICIT" | "PERFUNCTORY" | "SARCASTIC" | "NONE";
export type ApologyEvidence = { detected: boolean; type: ApologyEvidenceType; evidenceText?: string; source: "FINAL_USER_TEXT" | "NONE"; confidence: number };
export type UserSemanticLedger = {
  rawText: string;
  correctedText: string;
  finalText: string;
  explicitIntents: string[];
  inferredIntents: string[];
  negatedIntents: string[];
  ambiguousIntents: string[];
  unsupportedIntents: string[];
  notExpressed: string[];
  evidence: UserSemanticAnalysis["evidence"];
  confidence: number | "UNKNOWN";
  apologyEvidence: ApologyEvidence;
  ownershipEvidence: boolean;
};

const apologyPhrase = /对不起|抱歉|sorry|不好意思|我错了|是我不对|这次怪我|我跟你道歉|刚才是我不好|刚才我说重了|我不该这么说你/i;
const negatedApology = /我没有说对不起|我没说对不起|我才不跟你道歉|我才不道歉|凭什么(?:我要|让我|我得)?(?:说)?对不起|对不起个屁|我不是来道歉的|对不起什么|我又没错|没什么好道歉/;
const perfunctoryApology = /(?:对不起|抱歉).*(?:行了吧|行了没|满意了|好了吧)|(?:行行行|好好好).*(?:对不起|错了)|都是我的错.*满意了/;

export function apologyEvidenceForText(text: string): ApologyEvidence {
  const evidenceText = text.match(apologyPhrase)?.[0];
  if (!evidenceText || negatedApology.test(text)) return { detected: false, type: negatedApology.test(text) ? "SARCASTIC" : "NONE", evidenceText, source: evidenceText ? "FINAL_USER_TEXT" : "NONE", confidence: evidenceText ? 0.98 : 1 };
  if (perfunctoryApology.test(text)) return { detected: true, type: "PERFUNCTORY", evidenceText, source: "FINAL_USER_TEXT", confidence: 0.78 };
  return { detected: true, type: "EXPLICIT", evidenceText, source: "FINAL_USER_TEXT", confidence: 0.98 };
}

export function createUserSemanticLedger(input: { rawText: string; correctedText: string; finalText: string; analysis: UserSemanticAnalysis; confidence?: number; notExpressed?: string[] }): UserSemanticLedger {
  const apologyEvidence = apologyEvidenceForText(input.finalText);
  const explicitIntents = input.analysis.explicitIntents.filter((intent) => intent !== "APOLOGY" || apologyEvidence.detected);
  const negatedIntents = [...new Set([...input.analysis.negatedIntents, ...(apologyEvidence.type === "SARCASTIC" ? ["APOLOGY"] : [])])];
  return { rawText: input.rawText, correctedText: input.correctedText, finalText: input.finalText, explicitIntents, inferredIntents: input.analysis.inferredIntents, negatedIntents, ambiguousIntents: input.analysis.ambiguousIntents, unsupportedIntents: [], notExpressed: input.notExpressed || ["APOLOGY", "OWNERSHIP", "PROMISE", "AGREEMENT"].filter((intent) => !explicitIntents.includes(intent)), evidence: input.analysis.evidence, confidence: typeof input.confidence === "number" ? input.confidence : "UNKNOWN", apologyEvidence, ownershipEvidence: explicitIntents.includes("OWNERSHIP") };
}

export function criticalSemanticGuard(ledger: UserSemanticLedger) {
  const issues: string[] = [];
  if (ledger.apologyEvidence.type === "SARCASTIC") issues.push("NEGATED_OR_SARCASTIC_APOLOGY");
  if (ledger.apologyEvidence.type === "PERFUNCTORY") issues.push("PERFUNCTORY_APOLOGY");
  if (ledger.negatedIntents.includes("APOLOGY") && ledger.apologyEvidence.detected) issues.push("NEGATION_INTEGRITY");
  return { valid: issues.length === 0, issues, criticalAmbiguity: ledger.notExpressed.includes("APOLOGY") && ledger.confidence === "UNKNOWN" && ledger.apologyEvidence.type === "NONE" };
}

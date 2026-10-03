import type { UserSemanticLedger } from "./semantic-grounding";

export type ResponseClaim = "USER_SAID_APOLOGY" | "USER_ACCEPTED_OWNERSHIP" | "USER_MADE_PROMISE" | "USER_AGREED" | "USER_SAID_AFFECTION" | "USER_SAID_BREAKUP";

const claimPatterns: Array<{ claim: ResponseClaim; pattern: RegExp }> = [
  { claim: "USER_SAID_APOLOGY", pattern: /(?:你(?:刚才|都|已经)?(?:说了句|说过|说了一句|说了|说)?(?:对不起|抱歉)|你(?:都)?道歉了|既然你(?:都)?道歉了|你已经认错了|你都认错了|你说一句对不起)/ },
  { claim: "USER_ACCEPTED_OWNERSHIP", pattern: /你(?:都)?(?:承认|知道)自己错了/ },
  { claim: "USER_MADE_PROMISE", pattern: /你(?:不是|明明)?(?:答应|保证|承诺)过/ },
  { claim: "USER_AGREED", pattern: /你(?:不是|明明)?同意过|我们不是说好了/ },
  { claim: "USER_SAID_AFFECTION", pattern: /你说过你爱我|你说你在乎我/ },
  { claim: "USER_SAID_BREAKUP", pattern: /你说要分手|你说过不爱我/ },
];

export function extractResponseClaims(reply: string) {
  return claimPatterns.filter((item) => item.pattern.test(reply)).map((item) => item.claim);
}

export function validateCurrentTurnClaims(reply: string, ledger: UserSemanticLedger) {
  const claims = extractResponseClaims(reply);
  const issues: string[] = [];
  for (const claim of claims) {
    if (claim === "USER_SAID_APOLOGY" && !ledger.apologyEvidence.detected) issues.push("UNSUPPORTED_USER_SAID_APOLOGY");
    if (claim === "USER_SAID_APOLOGY" && ledger.apologyEvidence.type === "SARCASTIC") issues.push("SARCASM_PRESENTED_AS_APOLOGY");
    if (claim === "USER_ACCEPTED_OWNERSHIP" && !ledger.ownershipEvidence) issues.push("UNSUPPORTED_USER_OWNERSHIP");
    if (claim === "USER_MADE_PROMISE" && !ledger.explicitIntents.includes("REPAIR_ATTEMPT")) issues.push("UNSUPPORTED_USER_PROMISE");
    if (claim === "USER_AGREED" && !ledger.explicitIntents.includes("AGREEMENT")) issues.push("UNSUPPORTED_USER_AGREEMENT");
    if (claim === "USER_SAID_AFFECTION" && !ledger.explicitIntents.includes("AFFECTION")) issues.push("UNSUPPORTED_USER_AFFECTION");
    if (claim === "USER_SAID_BREAKUP" && !ledger.explicitIntents.includes("RELATIONSHIP_THREAT")) issues.push("UNSUPPORTED_USER_BREAKUP");
  }
  return { valid: issues.length === 0, claims, issues };
}

export type SemanticEvidence = {
  claim: string;
  source: "current_user_turn";
  matchedText: string;
  polarity: "positive" | "negated";
};

export type UserSemanticAnalysis = {
  explicitIntents: string[];
  inferredIntents: string[];
  negatedIntents: string[];
  ambiguousIntents: string[];
  evidence: SemanticEvidence[];
};

const apology = /对不起|抱歉|不好意思|sorry|我错了|是我不好|是我不对|我跟你道歉|这次怪我|我不该那么说|刚才是我不好|刚才我说重了/;
const apologyNegation = /我才不(?:跟你)?道歉|我(?:没|没有)说对不起|凭什么(?:我要|让我|我得)?(?:说)?对不起|对不起个屁|我不是来道歉的|对不起什么|我又没错|没什么好道歉/;

export function analyzeUserSemantic(text: string): UserSemanticAnalysis {
  const value = text.trim();
  const evidence: SemanticEvidence[] = [];
  const explicitIntents: string[] = [];
  const inferredIntents: string[] = [];
  const negatedIntents: string[] = [];
  const ambiguousIntents: string[] = [];
  const add = (list: string[], intent: string) => { if (!list.includes(intent)) list.push(intent); };

  if (apology.test(value)) {
    const negated = apologyNegation.test(value);
    add(negated ? negatedIntents : explicitIntents, "APOLOGY");
    evidence.push({ claim: "APOLOGY", source: "current_user_turn", matchedText: value.match(apology)?.[0] || value, polarity: negated ? "negated" : "positive" });
  }
  if (/(我错了|是我不好|是我不对|这次怪我|我不该那么说|(?:刚才我|我刚才)说重了|说话太冲|确实.*(?:我|怪我)|我承认)/.test(value) && !apologyNegation.test(value)) {
    add(explicitIntents, "OWNERSHIP");
    evidence.push({ claim: "OWNERSHIP", source: "current_user_turn", matchedText: value, polarity: "positive" });
  }
  if (/(别生气|别吵|不吵了|好了好了|我们别吵了|不想再吵|和好吧)/.test(value)) add(explicitIntents, "PEACE_OFFERING");
  if (/(我爱你|我在乎你|还是爱你的)/.test(value)) add(explicitIntents, "AFFECTION");
  if (/(原谅我吧|这次原谅|给我一次机会)/.test(value)) add(explicitIntents, "FORGIVENESS_REQUEST");
  if (/(我会改|以后不会|下次我先|我保证|我来解决)/.test(value)) add(explicitIntents, "REPAIR_ATTEMPT");
  if (/(其实|我只是|我有点|我害怕|我不知道)/.test(value)) add(inferredIntents, "VULNERABILITY");
  if (/(怎么回事|为什么|到底|你能不能|然后呢)/.test(value)) add(inferredIntents, "QUESTION");
  if (apology.test(value) && !apologyNegation.test(value) && !/(但是|可是|行了吧|满意了)/.test(value)) add(inferredIntents, "GENUINE_APOLOGY");
  if (apology.test(value) && !apologyNegation.test(value) && /(但是|可是|行了吧|满意了|行行行)/.test(value)) add(ambiguousIntents, "APOLOGY");

  return { explicitIntents, inferredIntents, negatedIntents, ambiguousIntents, evidence };
}

export function hasPositiveApology(text: string) {
  const analysis = analyzeUserSemantic(text);
  return analysis.explicitIntents.includes("APOLOGY") && !analysis.negatedIntents.includes("APOLOGY");
}

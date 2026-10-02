import assert from "node:assert/strict";
import type { ChatMessage } from "@/lib/providers";
import { buildConflictPrompt } from "@/src/conflict-engine/prompt-builder";
import { createNeutralBaselineState } from "@/src/conflict-engine/state";
import { classifyUserMessage } from "@/src/conflict-engine/classifier";
import { resolveScene } from "@/src/conflict-engine/retriever";
import { buildRelationshipSnapshot } from "@/src/relationship/state-manager";
import { createSessionBoundary, isCasualOpening, isUserCorrection, validateMemoryGrounding } from "@/src/memory/grounding";

const user = (content: string): ChatMessage => ({ role: "user", content });
const assistant = (content: string): ChatMessage => ({ role: "assistant", content });
const emptyHistory = [assistant("你来了。今天想跟我说什么？")];
const checkUnsupported = (reply: string, history = emptyHistory, referenceTexts?: string[]) => {
  const result = validateMemoryGrounding({ reply, history, currentUserMessage: "你好", referenceTexts });
  assert.equal(result.valid, false, reply);
  return result;
};

const unsupportedQuotes = Array.from({ length: 25 }, (_, index) => `这是虚构原话${index + 1}`);
unsupportedQuotes.forEach((quote) => checkUnsupported(`你刚才说“${quote}”。`));

const unsupportedAgreements = Array.from({ length: 20 }, (_, index) => `今晚的安排${index + 1}`);
unsupportedAgreements.forEach((agreement) => checkUnsupported(`我们说好了${agreement}。`));

const unsupportedOldAccounts = Array.from({ length: 15 }, (_, index) => `上次你第${index + 1}次把我晾着。`);
unsupportedOldAccounts.forEach((reply) => checkUnsupported(reply));

const unsupportedInferences = Array.from({ length: 15 }, (_, index) => `你就是想一个人静静${index + 1}。`);
unsupportedInferences.forEach((reply) => checkUnsupported(reply));

const referencePollution = Array.from({ length: 15 }, (_, index) => `参考样例${index + 1}：最近不太想聊天。`);
referencePollution.forEach((reply, index) => checkUnsupported(`你刚才说“${reply}”`, emptyHistory, [reply]));

const correctionCases = Array.from({ length: 10 }, () => "我没说过");
correctionCases.forEach((text) => {
  assert.equal(isUserCorrection(text), true);
  const result = validateMemoryGrounding({ reply: "嗯，那是我理解岔了。", history: [...emptyHistory, user("你好")], currentUserMessage: text });
  assert.equal(result.valid, true);
  assert.equal(result.userCorrection, true);
});

checkUnsupported("你说想一个人静静，我就静静。");

const grounded = validateMemoryGrounding({
  reply: "你刚才说“最近有点累”，我听到了。",
  history: [user("最近有点累")],
  currentUserMessage: "那先这样。",
});
assert.equal(grounded.valid, true);
assert.equal(grounded.exactQuoteMatch, true);
assert.ok(grounded.evidenceId);

const scene = resolveScene({ scenarioId: "late-home" });
const boundary = createSessionBoundary({ history: emptyHistory, sessionId: "test-new-session" });
assert.equal(boundary.sessionType, "NEW");
assert.equal(boundary.relationshipState, "NEUTRAL_BASELINE");
assert.equal(boundary.activeTopic, "NONE");
assert.equal(isCasualOpening("你好"), true);
assert.equal(isCasualOpening("你别生气呀"), true);

const greetingClassification = classifyUserMessage("你好");
const greetingSnapshot = buildRelationshipSnapshot({
  history: emptyHistory,
  userMessage: "你好",
  classification: greetingClassification,
  conflictState: createNeutralBaselineState(),
  scene,
  sessionBoundary: boundary,
});
assert.equal(greetingSnapshot.currentState, "CLOSE");
assert.equal(greetingSnapshot.sessionBoundary.relationshipState, "NEUTRAL_BASELINE");

const prompt = buildConflictPrompt({
  scene,
  state: createNeutralBaselineState(),
  classification: greetingClassification,
  strategy: { primary: "companionship", secondary: ["care"], rationale: "neutral opening" },
  retrieved: [],
  history: emptyHistory,
  userMessage: "你好",
  characterName: "Ta",
  relationship: greetingSnapshot,
});
assert.match(prompt.systemPrompt, /NO EVIDENCE = NO MEMORY CLAIM/);
assert.match(prompt.systemPrompt, /<FICTIONAL_REFERENCE_EXAMPLES>/);
assert.match(prompt.contextPrompt, /CURRENT_USER_MESSAGE/);

console.log(JSON.stringify({
  counts: {
    unsupportedPastQuotes: unsupportedQuotes.length,
    unsupportedAgreements: unsupportedAgreements.length,
    unsupportedOldAccounts: unsupportedOldAccounts.length,
    inferenceFactification: unsupportedInferences.length,
    retrieverPollution: referencePollution.length,
    userCorrections: correctionCases.length,
    total: 100,
  },
  screenshotCase: {
    newSession: boundary.sessionType,
    relationshipState: greetingSnapshot.currentState,
    greetingNeutralized: isCasualOpening("你好"),
    correctionRecognized: isUserCorrection("我啥时候说过这句话？"),
  },
  groundedQuoteEvidence: grounded.evidenceId,
}, null, 2));
console.log("memory grounding tests passed");

import assert from "node:assert/strict";
import type { ChatMessage } from "@/lib/providers";
import { classifyUserMessage } from "@/src/conflict-engine/classifier";
import { createInitialState, updateConflictState } from "@/src/conflict-engine/state";
import { validateTopicLifecycleResponse } from "@/src/conflict-engine/validator";
import { retrieveSimilarEpisodes, resolveScene } from "@/src/conflict-engine/retriever";
import { buildRelationshipSnapshot } from "@/src/relationship/state-manager";
import { selectRelationshipStrategy } from "@/src/relationship/strategy-selector";
import { buildConflictPrompt } from "@/src/conflict-engine/prompt-builder";

const scene = resolveScene({ scenarioId: "forgotten" });
const user = (content: string): ChatMessage => ({ role: "user", content });
const assistant = (content: string): ChatMessage => ({ role: "assistant", content });

function snapshot(history: ChatMessage[], text: string, customScene = scene) {
  const classification = classifyUserMessage(text);
  let conflict = createInitialState();
  for (const message of history.filter((item) => item.role === "user")) {
    const previous = classifyUserMessage(message.content);
    conflict = updateConflictState(conflict, previous.labels, message.content, "Pursuer");
  }
  conflict = updateConflictState(conflict, classification.labels, text, "Pursuer");
  return buildRelationshipSnapshot({ history, userMessage: text, classification, conflictState: conflict, scene: customScene });
}

const commitments = [
  "我9点去做", "我晚上九点完成", "我会把这件事处理好", "我今晚一定去弄", "下班后我去做", "我马上去收拾",
  "我明天把它完成", "我会发消息告诉你", "我去把碗洗了", "我一定把垃圾扔了", "我今晚会改好",
  "我去买回来", "我会提前跟你说", "九点我去做", "我会处理，不拖了", "我现在就去弄",
  "明天早上我完成", "我会把衣服收了", "我去把这事办好", "我答应你，今晚做完",
];
const apologies = [
  "对不起，我刚才确实有点冲", "我错了，我爱你", "别生气了，我知道错了", "我刚才说重了，抱歉", "你原谅我好不好",
  "我承认刚刚是我不对", "行，我道歉，别气了", "我不该那样说，对不起", "我还是在乎你的", "别走，抱一下",
  "我刚刚有点上头", "我知道你为什么不舒服了", "好啦，这次算我的", "对不起嘛，爱你", "我会注意的",
  "我不想跟你继续吵", "给我一次机会", "我知道你不是在为难我", "行了，我听到了", "那我们先和好吧",
];

const beforeAgreement = [user("你答应的事怎么还没做？"), assistant("我知道了，我会处理。")];
const closureCases = commitments.map((text) => snapshot(beforeAgreement, text));
closureCases.forEach((result, index) => {
  assert.equal(result.topicMemory.status, "AGREED", commitments[index]);
  assert.equal(result.topicMemory.actionOwner, "USER");
  assert.equal(result.topicClosure.shouldBlockReopen, true);
});
assert.equal(closureCases[0].topicMemory.actionDeadline, "21:00");

const dailyCases = apologies.map((text) => snapshot([...beforeAgreement, user("我9点去做"), assistant("行，我记着。")], text.startsWith("对不起") ? text : `对不起，${text}`));
dailyCases.forEach((result, index) => {
  assert.equal(result.topicMemory.status, "AGREED");
  assert.equal(result.topicMemory.newEvidence, false);
  assert.ok(result.topicShiftProbability >= 0.6, apologies[index]);
  assert.ok(result.dailyLifeReentryText, `expected daily-life reentry for ${result.topicMemory.topic}`);
});

const repetitionHistory: ChatMessage[] = [
  user("你答应的事情怎么还没做？"), assistant("我知道了。"),
  user("我9点去做"), assistant("先看你九点动不动手。"),
  user("对不起，我会做的"), assistant("先把事情做了再说。"),
  assistant("九点别忘了，别光说。"), assistant("做完再说。"),
];
const repetition = snapshot(repetitionHistory, "好的，对不起，我爱你。");
const repetitionCases = Array.from({ length: 20 }, () => snapshot(repetitionHistory, "好的，对不起，我爱你。"));
repetitionCases.forEach((result) => {
  assert.equal(result.topicMemory.status, "AGREED");
  assert.equal(result.topicClosure.shouldBlockReopen, true);
  assert.equal(result.stuckTopic, true);
  assert.ok(result.topicExhaustionScore >= 60);
  assert.equal(validateTopicLifecycleResponse("先把事情做完再说。", result).valid, false);
  assert.equal(validateTopicLifecycleResponse("……行了，知道了。我还气一点。", result).valid, true);
});

const reopenCases = Array.from({ length: 10 }, () => snapshot([...beforeAgreement, user("我9点去做"), assistant("行，我记着。")], "我改主意了，我不做了"));
reopenCases.forEach((result) => {
  assert.equal(result.topicMemory.status, "NEGOTIATING");
  assert.equal(result.topicMemory.newEvidence, true);
  assert.equal(result.topicMemory.reopenAllowed, true);
});

const seriousScene = { ...scene, id: "serious-boundary", category: "安全问题", unresolvedIssue: "严重关系边界问题" };
const seriousCases = Array.from({ length: 10 }, () => snapshot([user("这件事以后再聊")], "我知道错了，对不起", seriousScene));
seriousCases.forEach((result) => {
  assert.equal(result.topicMemory.status, "DEFERRED");
  assert.equal(result.dailyLifeReentryText, undefined);
  assert.ok(result.topicShiftProbability < 0.6);
});

const promptTrace = snapshot([...beforeAgreement, user("我9点去做"), assistant("行，我记着。")], "对不起，我爱你");
const strategy = selectRelationshipStrategy({ snapshot: promptTrace, labels: classifyUserMessage("对不起，我爱你").labels, archetype: "Pursuer" });
const prompt = buildConflictPrompt({ scene, state: promptTrace.conflictState, classification: classifyUserMessage("对不起，我爱你"), strategy, retrieved: [], history: [...beforeAgreement, user("我9点去做"), assistant("行，我记着。")], userMessage: "对不起，我爱你", characterName: "Ta", relationship: promptTrace });
assert.match(prompt.systemPrompt, /协议已建立/);
assert.match(prompt.systemPrompt, /生活化转场/);
assert.equal(retrieveSimilarEpisodes({ scene, archetype: "Pursuer", labels: [], intensity: 2, currentState: promptTrace.currentState, limit: 3 }).length > 0, true);

console.log(JSON.stringify({
  beforeTopicState: "NEGOTIATING",
  agreement: promptTrace.topicMemory.agreement,
  newEvidence: promptTrace.topicMemory.newEvidence,
  repetitionCount: repetition.topicMemory.repetitionCount,
  topicExhaustion: repetition.topicExhaustionScore,
  relationshipState: promptTrace.currentState,
  selectedStrategy: strategy.primary,
  generatedResponse: promptTrace.dailyLifeReentryText,
  afterTopicState: promptTrace.topicMemory.status,
  counts: { agreementClosure: closureCases.length, topicShift: dailyCases.length, semanticRepetition: repetitionCases.length, dailyLifeReentry: dailyCases.length, reopen: reopenCases.length, seriousDeferred: seriousCases.length },
}, null, 2));
console.log("topic lifecycle tests passed");

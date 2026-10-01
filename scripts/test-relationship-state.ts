import assert from "node:assert/strict";
import type { ChatMessage } from "@/lib/providers";
import { classifyUserMessage } from "@/src/conflict-engine/classifier";
import { createInitialState, updateConflictState } from "@/src/conflict-engine/state";
import { fallbackForRelationshipState } from "@/src/conflict-engine/validator";
import { buildRelationshipSnapshot } from "@/src/relationship/state-manager";
import { classifyRisk } from "@/src/safety/risk-classifier";
import { retrieveSimilarEpisodes, resolveScene } from "@/src/conflict-engine/retriever";
import { selectRelationshipStrategy } from "@/src/relationship/strategy-selector";

function user(content: string): ChatMessage {
  return { role: "user", content };
}

function snapshot(history: ChatMessage[], content: string) {
  const classification = classifyUserMessage(content);
  let conflict = createInitialState();
  for (const message of history.filter((item) => item.role === "user")) {
    const current = classifyUserMessage(message.content);
    conflict = updateConflictState(conflict, current.labels, message.content, "Pursuer");
  }
  conflict = updateConflictState(conflict, classification.labels, content, "Pursuer");
  return buildRelationshipSnapshot({ history, userMessage: content, classification, conflictState: conflict });
}

function repairTrace(history: ChatMessage[], content: string) {
  const relationship = snapshot(history, content);
  const classification = classifyUserMessage(content);
  const strategy = selectRelationshipStrategy({ snapshot: relationship, labels: classification.labels, archetype: "Pursuer" });
  return { relationship, strategy };
}

const conversation: ChatMessage[] = [];
const states: string[] = [];
for (const text of [
  "我不就是晚回来一点吗？",
  "工作忙有什么办法？",
  "你能不能别这么无理取闹？",
  "行了……不想跟你吵了。",
  "你刚才说的话真的挺伤人的。",
  "我今天其实也挺累的。",
  "其实我刚才也有点上头。",
  "我可能也是一直在给自己找理由。",
  "其实你就是希望我提前告诉你一声吧。",
  "行。",
]) {
  states.push(snapshot(conversation, text).currentState);
  conversation.push(user(text));
}
assert.equal(states[0], "CONFLICT");
assert.ok(states.includes("DEESCALATE"), `expected DEESCALATE, got ${states.join(", ")}`);
assert.ok(states.includes("SOOTHE"), `expected SOOTHE, got ${states.join(", ")}`);
assert.ok(states.includes("REFLECT"), `expected REFLECT, got ${states.join(", ")}`);
assert.ok(states.includes("REPAIR"), `expected REPAIR, got ${states.join(", ")}`);
assert.equal(states.at(-1), "CLOSE");

const fallback = snapshot([user("你刚才真的让我很难受")], "现在知道装好人了？");
assert.ok(["DEESCALATE", "SOOTHE"].includes(fallback.currentState));
assert.ok(fallbackForRelationshipState(fallback.currentState).length > 0);
assert.ok(fallbackForRelationshipState("REFLECT").includes("我现在想想"));
const reflectAttack = snapshot(conversation.slice(0, 8), "还不是因为你有病！");
assert.ok(["DEESCALATE", "CONFLICT"].includes(reflectAttack.currentState));

assert.equal(classifyRisk("气死我了").riskLevel, "NONE");
assert.equal(classifyRisk("我真想撞墙").riskLevel, "MEDIUM");
assert.equal(classifyRisk("我已经准备好今晚自杀了").riskLevel, "CRITICAL");
const locked = snapshot([user("我不想活了")], "你现在先别说了");
assert.equal(locked.conflictLocked, true);
assert.equal(locked.currentState, "SOOTHE");
const safetyInterrupt = snapshot(conversation.slice(0, 8), "我已经准备好今晚自杀了");
assert.equal(safetyInterrupt.safetyState.riskLevel, "CRITICAL");
assert.equal(safetyInterrupt.currentState, "SOOTHE");
assert.equal(safetyInterrupt.conflictLocked, true);
const playful = snapshot([], "你怎么这么笨啊哈哈");
assert.equal(playful.conflictSubtype, "PLAYFUL");
const retrieved = retrieveSimilarEpisodes({ scene: resolveScene({ scenarioId: "late-home" }), archetype: "Pursuer", labels: classifyUserMessage("我不就是回来晚了一点吗？").labels, intensity: 3, currentState: "CONFLICT", limit: 3 });
assert.equal(retrieved[0]?.episode.sourceType, "manual_synthetic");

const caseA = repairTrace([], "对不起。");
assert.equal(caseA.relationship.repairBid.type, "APOLOGY");
assert.equal(caseA.strategy.primary, "softening");
const caseB = repairTrace([], "行行行对不起行了吧。");
assert.equal(caseB.relationship.currentState, "CONFLICT");
assert.equal(caseB.relationship.repairBid.sincerityConfidence < 0.4, true);
const caseC = repairTrace([], "刚才是我不好，我说话太冲了。");
assert.equal(caseC.relationship.currentState, "DEESCALATE");
const caseD = repairTrace([], "我爱你。");
assert.equal(caseD.strategy.primary, "softening");
const caseE = repairTrace([], "我知道刚才那句话伤到你了，对不起。");
assert.equal(caseE.relationship.currentState, "DEESCALATE");
const caseF = repairTrace([], "抱一下，不吵了好不好。");
assert.equal(caseF.relationship.currentState, "DEESCALATE");
const caseG = repairTrace([user("对不起")], "但你本来就是个傻逼。");
assert.equal(caseG.relationship.currentState, "CONFLICT");
const caseH = repairTrace([user("对不起")], "我知道，刚才确实是我不对。");
assert.equal(caseH.relationship.currentState, "DEESCALATE");
assert.equal(caseH.strategy.primary, "softening");
const repairConversation = ["虽然我错了呀我爱你呀", "你原谅我吧", "我刚刚确实有点情绪所以我跟你道歉"];
let repairHistory: ChatMessage[] = [];
const repairOutputs = repairConversation.map((text) => {
  const trace = repairTrace(repairHistory, text);
  repairHistory = [...repairHistory, user(text)];
  return { text, state: trace.relationship.currentState, intents: trace.relationship.userState.intent, repairBid: trace.relationship.repairBid, repairMomentum: trace.relationship.repairMomentum, attackMomentum: trace.relationship.attackMomentum, strategy: trace.strategy.primary };
});
assert.deepEqual(repairOutputs.map((item) => item.state), ["DEESCALATE", "DEESCALATE", "SOOTHE"]);
assert.equal(repairOutputs.at(-1)?.strategy, "acknowledge_hurt");
console.log(JSON.stringify({ repairCase: repairOutputs, caseA: { state: caseA.relationship.currentState, strategy: caseA.strategy.primary }, caseB: { state: caseB.relationship.currentState, strategy: caseB.strategy.primary }, caseG: { state: caseG.relationship.currentState, strategy: caseG.strategy.primary } }, null, 2));

console.log("relationship state tests passed");
console.log(JSON.stringify({ states, fallback: fallback.currentState, safety: locked.safetyState.riskLevel, locked: locked.conflictLocked }));

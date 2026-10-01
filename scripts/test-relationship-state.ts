import assert from "node:assert/strict";
import type { ChatMessage } from "@/lib/providers";
import { classifyUserMessage } from "@/src/conflict-engine/classifier";
import { createInitialState, updateConflictState } from "@/src/conflict-engine/state";
import { fallbackForRelationshipState } from "@/src/conflict-engine/validator";
import { buildRelationshipSnapshot } from "@/src/relationship/state-manager";
import { classifyRisk } from "@/src/safety/risk-classifier";

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

const conversation: ChatMessage[] = [];
const states: string[] = [];
for (const text of [
  "我不就是晚回来一点吗？",
  "工作忙有什么办法？",
  "你能不能别这么无理取闹？",
  "行了……不想跟你吵了。",
  "你刚才说的话真的挺伤人的。",
  "我今天其实也挺累的。",
  "我也有问题，我应该提前告诉你的。",
  "知道了，下次我提前说。",
]) {
  states.push(snapshot(conversation, text).currentState);
  conversation.push(user(text));
}
assert.equal(states[0], "CONFLICT");
assert.ok(states.includes("DEESCALATE"), `expected DEESCALATE, got ${states.join(", ")}`);
assert.ok(states.includes("SOOTHE"), `expected SOOTHE, got ${states.join(", ")}`);
assert.ok(states.includes("REPAIR"), `expected REPAIR, got ${states.join(", ")}`);
assert.equal(states.at(-1), "CLOSE");

const fallback = snapshot([user("你刚才真的让我很难受")], "现在知道装好人了？");
assert.ok(["DEESCALATE", "SOOTHE"].includes(fallback.currentState));
assert.ok(fallbackForRelationshipState(fallback.currentState).length > 0);

assert.equal(classifyRisk("气死我了").riskLevel, "NONE");
assert.equal(classifyRisk("我已经准备好今晚自杀了").riskLevel, "CRITICAL");
const locked = snapshot([user("我不想活了")], "你现在先别说了");
assert.equal(locked.conflictLocked, true);
assert.equal(locked.currentState, "SOOTHE");

console.log("relationship state tests passed");
console.log(JSON.stringify({ states, fallback: fallback.currentState, safety: locked.safetyState.riskLevel, locked: locked.conflictLocked }));

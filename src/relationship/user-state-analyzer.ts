import type { ChatMessage } from "@/lib/providers";
import type { BehaviorLabel, ConflictState, Classification } from "@/src/conflict-engine/types";
import type { RelationshipState, UserIntent, UserStateAnalysis } from "./types";

const clamp = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

const intentMap: Partial<Record<BehaviorLabel, UserIntent>> = {
  character_attack: "ATTACK",
  counterattack: "COUNTERATTACK",
  defense: "DEFEND",
  explanation: "EXPLAIN",
  responsibility_shift: "BLAME",
  dismissal: "DISMISS",
  sarcasm: "MOCK",
  relationship_threat: "RELATIONSHIP_THREAT",
  withdrawal: "WITHDRAW",
  silence: "SILENCE",
  showing_vulnerability: "VULNERABILITY",
  genuine_apology: "GENUINE_APOLOGY",
  perfunctory_apology: "PERFUNCTORY_APOLOGY",
  acknowledgement: "ACKNOWLEDGEMENT",
  validation: "VALIDATION",
  problem_solving: "REPAIR_ATTEMPT",
  joking: "HUMOR",
};

function textIntent(text: string): UserIntent[] {
  const intents: UserIntent[] = [];
  if (/(哭|哭了|想哭|眼泪|崩溃)/.test(text)) intents.push("CRYING");
  if (/(我也有问题|我应该|我承认|确实是我|我会改|以后提前|下次.*提前)/.test(text)) intents.push("REPAIR_ATTEMPT");
  if (/(谢谢你|抱歉|对不起|原谅我|我知道了)/.test(text)) intents.push("FORGIVENESS");
  if (/(好了|没事了|睡觉吧|吃饭吧|行了|明天再说|拜拜|晚安|^行[。！!]*$)/.test(text)) intents.push("GOODBYE");
  if (/(不想跟你吵|不想再说|不想继续|不想聊了)/.test(text)) intents.push("SHUTDOWN");
  if (/(算了|随便|不说了|没意思|我累了)/.test(text)) intents.push("WITHDRAW");
  if (/(我很难受|我好委屈|我真的受伤|你这样让我|我只是想被|我其实很怕)/.test(text)) intents.push("HURT_DISCLOSURE");
  if (/(难过|伤心|失望|心里很累)/.test(text)) intents.push("SADNESS_DISCLOSURE");
  if (/(是不是我|我是不是|我刚才也|我也有点|我也有问题|我可能也是|我自己也|我应该也)/.test(text)) {
    intents.push("SELF_REFLECTION", "OWNERSHIP");
  }
  if (/(我们怎么每次|每次都这样|越说越|绕进去|到底怎么了|刚才发生了什么|为什么会这样)/.test(text)) {
    intents.push("RELATIONSHIP_REFLECTION", "PATTERN_RECOGNITION");
  }
  if (/(你刚才为什么|我想知道|我想弄明白|怎么回事|什么意思|为什么那么生气)/.test(text)) {
    intents.push("CURIOSITY", "ROOT_CAUSE_EXPLORATION");
  }
  if (/(其实我就是|真正介意|说到底|我在意的是|我只是想要)/.test(text)) intents.push("ROOT_CAUSE_EXPLORATION");
  if (/(你就是希望|你想要|其实你.*想|希望我)/.test(text)) intents.push("PERSPECTIVE_TAKING", "ROOT_CAUSE_EXPLORATION");
  if (/(可能你.*(难受|委屈|等|在意)|换成你|站在你角度|我能理解你)/.test(text)) intents.push("PERSPECTIVE_TAKING", "VALIDATION");
  return intents;
}

function unique<T>(values: T[]) { return values.filter((value, index) => values.indexOf(value) === index); }

export function analyzeUserState(input: { text: string; classification: Classification; emotion: ConflictState; history: ChatMessage[]; currentRelationshipState: RelationshipState }): UserStateAnalysis {
  const { text, classification, emotion } = input;
  const intents = unique([...classification.labels.map((label) => intentMap[label]).filter(Boolean) as UserIntent[], ...textIntent(text)]);
  const reflectionOpen = intents.some((intent) => ["SELF_REFLECTION", "RELATIONSHIP_REFLECTION", "CURIOSITY", "OWNERSHIP", "PATTERN_RECOGNITION", "ROOT_CAUSE_EXPLORATION", "PERSPECTIVE_TAKING"].includes(intent));
  const rawAggression = (classification.labels.some((label) => ["character_attack", "relationship_threat", "responsibility_shift", "dismissal"].includes(label)) ? 62 : 18) + (/(你闭嘴|滚|废物|没用|有病|神经)/.test(text) ? 25 : 0);
  const aggression = clamp(reflectionOpen && !/(滚|废物|有病|神经)/.test(text) ? Math.min(rawAggression, 22) : rawAggression);
  const currentAnger = clamp(reflectionOpen && aggression < 40 ? Math.min(emotion.anger, 34) : emotion.anger);
  const hurt = clamp(emotion.hurt + (/(难受|委屈|受伤|在意|失望|心寒)/.test(text) ? 15 : 0));
  const sadness = clamp((/(难过|伤心|哭|失望|累|心寒)/.test(text) ? 68 : 28) + (intents.includes("HURT_DISCLOSURE") ? 15 : 0));
  const anxiety = clamp(emotion.anxiety + (/(害怕|担心|不安|怎么办|撑不住)/.test(text) ? 18 : 0));
  const withdrawal = clamp((intents.some((intent) => ["WITHDRAW", "SHUTDOWN", "SILENCE", "GOODBYE"].includes(intent)) ? 72 : 18) + (/(算了|随便|不说了|没意思|我累了|不想跟你吵|不想继续)/.test(text) ? 18 : 0));
  const openness = clamp((intents.some((intent) => ["VULNERABILITY", "HURT_DISCLOSURE", "SADNESS_DISCLOSURE", "GENUINE_APOLOGY", "REPAIR_ATTEMPT"].includes(intent)) ? 66 : reflectionOpen ? 64 : 24) + (/(其实|我想说|我承认|我应该|我现在想想)/.test(text) ? 12 : 0));
  const distress = clamp(Math.max(sadness, anxiety, withdrawal) * 0.72 + (/(崩溃|受不了了|撑不住|喘不过气)/.test(text) ? 24 : 0));
  const arousal = clamp((currentAnger + aggression + anxiety) / 3);
  const recentUsers = input.history.filter((message) => message.role === "user").slice(-3).map((message) => message.content).join(" ");
  const recentAggression = /(无理取闹|有病|滚|你怎么|都怪你|你闭嘴)/.test(recentUsers);
  const recentRepair = /(对不起|我错了|我应该|我会改|我知道了)/.test(recentUsers);
  const trend = recentAggression && aggression >= 50 ? "rising" : recentRepair && aggression < 40 ? "falling" : "stable";
  const recommendedState: RelationshipState = distress >= 72 || withdrawal >= 68 || hurt >= 68
    ? "DEESCALATE"
    : reflectionOpen && aggression < 40
      ? "REFLECT"
    : openness >= 62 && aggression < 35
      ? "REPAIR"
      : aggression >= 50 && emotion.conflictIntensity >= 3
        ? "CONFLICT"
        : input.currentRelationshipState;
  return {
    anger: currentAnger, hurt, sadness, anxiety, aggression, arousal, withdrawal, openness, distress,
    intent: intents.length ? intents : ["EXPLAIN"], trend, recommendedState,
    confidence: intents.length > 1 ? 0.84 : 0.66,
    // 当前版本没有真实语音情绪识别或摄像头表情识别，必须保持 undefined。
    multimodal: { textSignals: { content: text }, voiceSignals: undefined, visualSignals: undefined },
  };
}

import type { ChatMessage } from "@/lib/providers";
import type { UserStateAnalysis, ReflectionState } from "./types";

const clamp = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

function latestText(history: ChatMessage[], current: string) {
  return [...history.slice(-12).map((message) => message.content), current].join(" ");
}

export function analyzeReflection(input: { history: ChatMessage[]; currentText: string; userState: UserStateAnalysis }): ReflectionState {
  const text = latestText(input.history, input.currentText);
  const intents = input.userState.intent;
  const hasReflectionSignal = intents.some((intent) => [
    "SELF_REFLECTION", "RELATIONSHIP_REFLECTION", "CURIOSITY", "OWNERSHIP",
    "PATTERN_RECOGNITION", "ROOT_CAUSE_EXPLORATION", "PERSPECTIVE_TAKING",
  ].includes(intent));
  const triggerIdentified = /无理取闹|有病|别解释|你怎么又|没提前说|没回消息|冷处理|敷衍/.test(text)
    ? `“${text.match(/无理取闹|有病|别解释|你怎么又|没提前说|没回消息|冷处理|敷衍/)?.[0]}”这句把情绪推高了`
    : undefined;
  const surfaceConflict = /晚回|回来晚|晚一点|迟到/.test(text)
    ? "晚回家和没有提前说明"
    : /没回|不回复|已读/.test(text)
      ? "长时间没有回复消息"
      : /忘了|没做到|没提起/.test(text)
        ? "答应的事情没有做到"
        : hasReflectionSignal ? "刚才这场争执" : undefined;
  const underlyingNeed = /提前告诉|报备|消息|不知道|等着|放心上|在乎|重视/.test(text)
    ? "被重视、被告知，不要一个人等着猜"
    : /陪伴|回应|听我说|把话说完/.test(text)
      ? "被听见和认真回应"
      : /其实我就是|真正介意|说到底|我只是想要/.test(text)
        ? "被理解，而不是只争输赢"
        : undefined;
  const userContribution = /给自己找理由|找理由|工作忙有什么办法|你能不能/.test(text)
    ? "防御、解释，后来也把话说重了"
    : /对不起|抱歉|道歉|行吧|随便/.test(text)
      ? "防御或敷衍地结束话题"
      : /我也有问题|我应该|我可能也是|我刚才也/.test(text)
        ? "开始承认自己也在防御或上头"
        : hasReflectionSignal ? "我也没有及时把自己的需要说清楚" : undefined;
  const characterContribution = /追着|越追|逼你|翻旧账|讽刺/.test(text)
    ? "追问、讽刺，越说越想让对方立刻认错"
    : hasReflectionSignal ? "追问、说重话，也没有让你把话说完" : undefined;
  const interactionPattern = /每次|越说越|绕进去|越追|越解释/.test(text)
    ? "追问 → 防御 → 更强追问 → 敷衍 → 爆发"
    : hasReflectionSignal && input.history.some((message) => message.role === "assistant")
      ? "表达不安 → 防御解释 → 继续追问 → 两个人都上头"
      : undefined;
  const insightDepth: ReflectionState["insightDepth"] = underlyingNeed && (input.userState.intent.includes("ROOT_CAUSE_EXPLORATION") || input.userState.intent.includes("PERSPECTIVE_TAKING"))
    ? 3
    : interactionPattern || input.userState.intent.includes("RELATIONSHIP_REFLECTION") || input.userState.intent.includes("PATTERN_RECOGNITION")
      ? 2
      : hasReflectionSignal ? 1 : 0;
  const mutualUnderstanding = clamp(
    18
    + (triggerIdentified ? 14 : 0)
    + (interactionPattern ? 18 : 0)
    + (underlyingNeed ? 22 : 0)
    + (input.userState.intent.includes("OWNERSHIP") ? 12 : 0)
    + (input.userState.intent.includes("PERSPECTIVE_TAKING") ? 12 : 0),
  );
  return {
    triggerIdentified,
    surfaceConflict,
    underlyingNeed,
    userContribution,
    characterContribution,
    interactionPattern,
    insightDepth,
    mutualUnderstanding,
  };
}

import type { ConflictStrategy, ConflictTurn } from "./types";
import type { RelationshipState } from "@/src/relationship/types";

const forbidden = ["我理解你的感受", "我们应该进行有效沟通", "作为AI", "建议你", "心理学", "冲突等级", "我的情绪是"];

export function validateResponse(reply: string, history: { role: string; content: string }[], strategy: ConflictStrategy): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  const clean = reply.trim();
  if (!clean) issues.push("empty");
  if (clean.length > 100) issues.push("too_long");
  if (forbidden.some((item) => clean.includes(item))) issues.push("assistant_language");
  if (history.some((message) => message.role === "assistant" && message.content.trim() === clean)) issues.push("duplicate");
  if (/```|\[.*?策略|当前状态|置信度/.test(clean)) issues.push("metadata_leak");
  if (strategy === "softening" && /(滚|神经|有病|分手)/.test(clean)) issues.push("strategy_mismatch");
  return { valid: issues.length === 0, issues };
}

export function validateReflectionResponse(reply: string): { valid: boolean; issues: string[] } {
  const clean = reply.trim();
  const issues: string[] = [];
  if (!/(我|我们|刚才|其实|好像|想想|可能)/.test(clean)) issues.push("reflection_missing_self_view");
  if (/^你.*(就|还|到底|怎么|是不是)|你一句.*就|你有病|你无理取闹|换你.*什么滋味/.test(clean)) issues.push("reflection_turns_into_attack");
  if (/根据|依恋理论|核心创伤|防御机制|从心理学角度|典型的追逃/.test(clean)) issues.push("reflection_psychology_language");
  return { valid: issues.length === 0, issues };
}

export function validateRepairResponse(reply: string): { valid: boolean; issues: string[] } {
  const clean = reply.trim();
  const issues: string[] = [];
  if (!/(你.*(以后|下次|提前|发一句|说一声)|以后你|下次你)/.test(clean)) issues.push("repair_missing_partner_action");
  if (!/(我(?:也|会|尽量|以后|下次)|我.*(不再|不一上来|别再|少用|先把|尽量不))/.test(clean)) issues.push("repair_missing_character_action");
  if (/现在才明白|现在才问到|你至于|你怎么|你早说/.test(clean)) issues.push("repair_turns_into_blame");
  return { valid: issues.length === 0, issues };
}

export function fallbackForStrategy(strategy: ConflictStrategy) {
  const replies: Partial<Record<ConflictStrategy, string>> = {
    challenge: "你先别急着解释。你到底有没有发现，这件事真的让我很难受？",
    sarcasm: "对，你都有理由。你最忙，最有道理，行了吧？",
    validation: "你早一点把话说明白，我也不至于一个人猜到现在。",
    softening: "我听见了……但你别以为你说一句对不起，这件事就能当没发生。",
    repair_attempt: "那你准备怎么做？别只说一句会改，我要看你真的做什么。",
    counterattack: "你现在还要把问题推回我身上，是吧？每次都这样。",
    withdrawal: "算了……我现在真的不想再说了，再说下去也只会变成我在求你。",
    relationship_threat: "你要是真觉得这段关系无所谓，那就别只在吵架时拿它出来说。",
  };
  return replies[strategy] || replies.challenge!;
}

export function fallbackForRelationshipState(state: RelationshipState) {
  const replies: Record<RelationshipState, string> = {
    CONFLICT: "你先别急着解释。你到底有没有发现，这件事真的让我很难受？",
    DEESCALATE: "……行，我不跟你继续吵了。刚才我确实有点上头。",
    SOOTHE: "嗯，这句是我说重了。生气归生气，我不该这样伤你。",
    REFLECT: "我现在想想……好像我们争的根本不只是晚回来，而是我一直没让你把话说完。",
    REPAIR: "我在意的不是这一件事本身，是你没有提前告诉我。下次你发一句就行，我也尽量不一上来就讽刺你。",
    CLOSE: "行了，先不说这个了。饿不饿？",
  };
  return replies[state];
}

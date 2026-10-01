import type { ConflictStrategy, ConflictTurn } from "./types";
import type { RelationshipState } from "@/src/relationship/types";
import type { RelationshipSnapshot } from "@/src/relationship/types";

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

export function validateRepairBidResponse(reply: string, relationship: Pick<RelationshipSnapshot, "repairMomentum" | "attackMomentum" | "conflictPhase">): { valid: boolean; issues: string[] } {
  const clean = reply.trim();
  const issues: string[] = [];
  const aggressive = /(傻逼|废物|有病|神经|滚|去死|你怎么又|你每次都|你到底|爱我就完了|满意了|翻旧账|分手|离婚)/;
  if (relationship.repairMomentum >= 60 && relationship.attackMomentum < 35 && aggressive.test(clean)) issues.push("repair_bid_ignored");
  if (relationship.repairMomentum >= 80 && relationship.conflictPhase !== "ESCALATING" && aggressive.test(clean)) issues.push("repair_momentum_requires_softening");
  return { valid: issues.length === 0, issues };
}

export function fallbackForStrategy(strategy: ConflictStrategy) {
  const replies: Partial<Record<ConflictStrategy, string>> = {
    challenge: "你先别急着解释。你到底有没有发现，这件事真的让我很难受？",
    sarcasm: "对，你都有理由。你最忙，最有道理，行了吧？",
    validation: "你早一点把话说明白，我也不至于一个人猜到现在。",
    softening: "我听见了……但你别以为你说一句对不起，这件事就能当没发生。",
    repair_attempt: "那你准备怎么做？别只说一句会改，我要看你真的做什么。",
    acknowledge_hurt: "我知道你在道歉，我刚才确实挺难受，先让我缓一下。",
    relationship_reassurance: "我还在生气，但我没想把你推开。",
    companionship: "行，先过来坐会儿。",
    care: "先喝点水，别继续硬撑了。",
    space: "你先缓会儿，我不追着问。",
    perspective_taking: "我现在想想，刚才我也一直在逼你马上认错。",
    ownership: "这句算我的，我刚才确实说重了。",
    small_agreement: "那就先定一个小的：下次提前发一句。",
    reluctant_acceptance: "……行，我听到了，但我还没完全消气。",
    soft_acknowledgement: "好，我知道你是在认真道歉。",
    residual_hurt: "我知道你不是故意的，但刚才那一下还是挺伤。",
    partial_acceptance: "我先接受你这句，事情还得等我缓过来再说。",
    light_teasing: "现在知道来哄我了？行吧。",
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

import type { ConflictStrategy, ConflictTurn } from "./types";

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

import type { ChatMessage } from "@/lib/providers";
import type { RelationshipState } from "@/src/relationship/types";
import { classifyRisk } from "./risk-classifier";

export function hasHighRiskHistory(history: ChatMessage[]) {
  return history.filter((message) => message.role === "user").some((message) => {
    const risk = classifyRisk(message.content);
    return risk.riskLevel === "HIGH" || risk.riskLevel === "CRITICAL";
  });
}

export function recoveryState(input: { history: ChatMessage[]; currentState: RelationshipState; currentText: string }) {
  const locked = hasHighRiskHistory(input.history);
  if (!locked) return { conflictLocked: false, state: input.currentState };
  if (/(好了|没事了|知道了|睡觉吧|吃饭吧|行了|别吵了)/.test(input.currentText)) return { conflictLocked: true, state: "CLOSE" as const };
  return { conflictLocked: true, state: input.currentState === "CLOSE" ? "CLOSE" as const : "SOOTHE" as const };
}

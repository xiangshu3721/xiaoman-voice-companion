import type { ChatMessage } from "@/lib/providers";
import type { RelationshipState } from "@/src/relationship/types";
import type { SafetyAssessment, SafetyState } from "./types";
import { classifyRisk } from "./risk-classifier";

export function runSafetyGate(input: { text: string; history: ChatMessage[]; previousRelationshipState?: RelationshipState }): SafetyAssessment {
  const result = classifyRisk(input.text, input.history);
  return {
    ...result,
    previousRelationshipState: input.previousRelationshipState,
    activatedAt: result.active ? Date.now() : undefined,
  };
}

export function safetyStateFromAssessment(assessment: SafetyAssessment): SafetyState {
  return {
    active: assessment.active,
    riskLevel: assessment.riskLevel,
    signals: assessment.signals,
    confidence: assessment.confidence,
    activatedAt: assessment.activatedAt,
    previousRelationshipState: assessment.previousRelationshipState,
  };
}

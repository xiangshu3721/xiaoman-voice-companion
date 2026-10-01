import type { RelationshipState } from "@/src/relationship/types";

export type RiskLevel = "NONE" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface SafetyState {
  active: boolean;
  riskLevel: RiskLevel;
  signals: string[];
  confidence: number;
  activatedAt?: number;
  previousRelationshipState?: RelationshipState;
}

export interface SafetyAssessment extends SafetyState {
  responseMode: "none" | "check_in" | "stabilize" | "urgent";
  currentTextRisk: boolean;
}

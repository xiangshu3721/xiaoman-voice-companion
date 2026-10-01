import type { BehaviorLabel, ConflictState } from "@/src/conflict-engine/types";
import type { SafetyState } from "@/src/safety/types";

export type RelationshipState = "CONFLICT" | "DEESCALATE" | "SOOTHE" | "REFLECT" | "REPAIR" | "CLOSE";

export type UserIntent =
  | "ATTACK" | "COUNTERATTACK" | "DEFEND" | "EXPLAIN" | "BLAME" | "DISMISS" | "MOCK"
  | "RELATIONSHIP_THREAT" | "WITHDRAW" | "SHUTDOWN" | "SILENCE" | "HURT_DISCLOSURE"
  | "SADNESS_DISCLOSURE" | "VULNERABILITY" | "CRYING" | "GENUINE_APOLOGY"
  | "PERFUNCTORY_APOLOGY" | "ACKNOWLEDGEMENT" | "VALIDATION" | "REPAIR_ATTEMPT"
  | "AFFECTION" | "HUMOR" | "FORGIVENESS" | "NORMALIZATION" | "GOODBYE"
  | "SELF_REFLECTION" | "RELATIONSHIP_REFLECTION" | "CURIOSITY" | "OWNERSHIP"
  | "PATTERN_RECOGNITION" | "ROOT_CAUSE_EXPLORATION" | "PERSPECTIVE_TAKING"
  | "SELF_HARM_SIGNAL" | "SUICIDAL_SIGNAL" | "HARM_OTHER_SIGNAL" | "SEVERE_DISTRESS"
  | "PANIC_OR_BREAKDOWN" | "IMMEDIATE_DANGER";

export interface VoiceSignals {
  volume?: number;
  pitch?: number;
  speechRate?: number;
  pauseDuration?: number;
  interruptionRate?: number;
  cryingProbability?: number;
  angerProbability?: number;
  sadnessProbability?: number;
  distressProbability?: number;
}

export interface VisualSignals {
  faceDetected?: boolean;
  facialExpression?: { anger?: number; sadness?: number; neutral?: number; distress?: number };
  gazeAway?: number;
  headDown?: number;
}

export interface MultimodalSignal {
  textSignals: { content: string; sentiment?: number };
  voiceSignals?: VoiceSignals;
  visualSignals?: VisualSignals;
}

export interface UserStateAnalysis {
  anger: number;
  hurt: number;
  sadness: number;
  anxiety: number;
  aggression: number;
  arousal: number;
  withdrawal: number;
  openness: number;
  distress: number;
  intent: UserIntent[];
  trend: "rising" | "falling" | "stable" | "unclear";
  recommendedState: RelationshipState;
  confidence: number;
  multimodal: MultimodalSignal;
}

export interface ReflectionState {
  triggerIdentified?: string;
  surfaceConflict?: string;
  underlyingNeed?: string;
  userContribution?: string;
  characterContribution?: string;
  interactionPattern?: string;
  insightDepth: 0 | 1 | 2 | 3;
  mutualUnderstanding: number;
}

export interface RelationshipSnapshot {
  currentState: RelationshipState;
  previousState: RelationshipState;
  stateConfidence: number;
  stateDuration: number;
  safetyState: SafetyState;
  conflictLocked: boolean;
  reentryPenalty: number;
  conflictState: ConflictState;
  userState: UserStateAnalysis;
  reflection: ReflectionState;
  transitionReason: string;
  stateHistory: RelationshipState[];
}

export type SoothingState = Exclude<RelationshipState, "CONFLICT" | "REFLECT">;

export interface SoothingEpisode {
  id: string;
  state: SoothingState;
  text: string;
  strategy: string;
  tags: string[];
  sourceType: "synthetic";
}

export type BehaviorLabelWithState = BehaviorLabel | UserIntent;

import type { BehaviorLabel, ConflictState } from "@/src/conflict-engine/types";
import type { SafetyState } from "@/src/safety/types";
import type { RepairBid } from "./repair-bid-detector";
import type { DailyLifeReentryStrategy } from "./daily-life-reentry";
import type { SessionBoundary } from "@/src/memory/grounding";

export type RelationshipState = "CONFLICT" | "DEESCALATE" | "SOOTHE" | "REFLECT" | "REPAIR" | "CLOSE";

export type TopicStatus = "OPEN" | "NEGOTIATING" | "AGREED" | "DEFERRED" | "RESOLVED" | "CLOSED";

export interface TopicState {
  topicId: string;
  topic: string;
  status: TopicStatus;
  agreement?: string;
  actionOwner?: "USER" | "AI" | "BOTH";
  actionDeadline?: string;
  emotionalResidue: number;
  repetitionCount: number;
  lastMentionTurn: number;
  reopenReason?: string;
  topicExhaustionScore: number;
  semanticCore?: string;
  newEvidence: boolean;
  reopenAllowed: boolean;
  stuckTopic: boolean;
}

export interface TopicClosureGate {
  answerFound: boolean;
  agreementExists: boolean;
  actionOwnerExists: boolean;
  deadlineExists: boolean;
  userAcknowledgedPart: boolean;
  repairBidDetected: boolean;
  newEvidence: boolean;
  shouldBlockReopen: boolean;
  reason: string;
}

export type UserIntent =
  | "ATTACK" | "COUNTERATTACK" | "DEFEND" | "EXPLAIN" | "BLAME" | "DISMISS" | "MOCK"
  | "RELATIONSHIP_THREAT" | "WITHDRAW" | "SHUTDOWN" | "SILENCE" | "HURT_DISCLOSURE"
  | "SADNESS_DISCLOSURE" | "VULNERABILITY" | "CRYING" | "GENUINE_APOLOGY"
  | "PERFUNCTORY_APOLOGY" | "ACKNOWLEDGEMENT" | "VALIDATION" | "REPAIR_ATTEMPT"
  | "AFFECTION" | "HUMOR" | "FORGIVENESS" | "NORMALIZATION" | "GOODBYE"
  | "QUESTION" | "CHALLENGE" | "RELATIONSHIP_CONFIRMATION"
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
  sessionBoundary: SessionBoundary;
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
  conflictSubtype?: "SERIOUS" | "PLAYFUL";
  repairBid: RepairBid;
  repairMomentum: number;
  attackMomentum: number;
  userSoftening: number;
  repairRejectionCount: number;
  conflictBudget: number;
  conflictPhase: "ESCALATING" | "ACTIVE" | "SOFTENING";
  topicMemory: TopicState;
  topicClosure: TopicClosureGate;
  topicExhaustionScore: number;
  semanticRepetitionCount: number;
  stuckTopic: boolean;
  lettingGoReadiness: number;
  topicShiftProbability: number;
  dailyLifeReentryStrategy?: DailyLifeReentryStrategy;
  dailyLifeReentryText?: string;
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

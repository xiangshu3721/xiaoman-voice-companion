import type { EmotionPerformancePlan } from "@/src/emotion-performance/types";

export type SourceType = "human" | "public" | "synthetic" | "synthetic_seed" | "manual_synthetic" | "human_verified" | "expert";

export type RelationshipType = "dating" | "cohabiting" | "married";

export type ArchetypeId =
  | "Pursuer"
  | "Critic"
  | "Defender"
  | "Withdrawer"
  | "Rationalizer"
  | "Pleaser"
  | "PassiveAggressive"
  | "Explosive"
  | "Sensitive"
  | "ControlSensitive"
  | "GrievanceHolder"
  | "Reflective";

export type ConflictStrategy =
  | "sarcasm"
  | "mockery"
  | "blame"
  | "challenge"
  | "interrogation"
  | "generalization"
  | "magnification"
  | "mind_reading"
  | "labeling"
  | "belittling"
  | "character_attack"
  | "comparison"
  | "historical_grievance"
  | "responsibility_shift"
  | "victimization"
  | "defense"
  | "counterattack"
  | "dismissal"
  | "perfunctory_response"
  | "perfunctory_apology"
  | "relationship_threat"
  | "withdrawal"
  | "silent_treatment"
  | "topic_shift"
  | "stonewalling"
  | "repair_attempt"
  | "softening"
  | "validation"
  | "genuine_apology"
  | "humor_release"
  | "acknowledge_hurt"
  | "own_harm"
  | "relationship_reassurance"
  | "companionship"
  | "care"
  | "space"
  | "perspective_taking"
  | "ownership"
  | "small_agreement"
  | "reluctant_acceptance"
  | "soft_acknowledgement"
  | "residual_hurt"
  | "partial_acceptance"
  | "light_teasing";

export type BehaviorLabel = ConflictStrategy | "explanation" | "denial" | "acknowledgement" | "responsibility_acceptance" | "showing_vulnerability" | "pleasing" | "joking" | "problem_solving" | "silence";

export type EmotionState = {
  anger: number;
  hurt: number;
  disappointment: number;
  anxiety: number;
  contempt: number;
  trust: number;
  resentment: number;
  connection: number;
};

export type ConflictState = EmotionState & {
  conflictIntensity: 1 | 2 | 3 | 4 | 5;
  turnCount: number;
  trajectory: number[];
};

export type CharacterProfile = {
  gender: "female" | "male" | "other";
  ageRange?: string;
  primaryArchetype: ArchetypeId;
  secondaryArchetype?: ArchetypeId;
};

export type ConflictTurn = {
  speaker: "A" | "B";
  text: string;
  strategies: ConflictStrategy[];
  intensity: 1 | 2 | 3 | 4 | 5;
  emotion?: Partial<EmotionState>;
  target?: string;
  triggerFromPreviousTurn?: string;
  effect: "escalate" | "maintain" | "deescalate" | "rupture" | "repair";
};

export type ConflictScene = {
  id: string;
  baseScenarioId?: "late-home" | "no-reply" | "forgotten" | "free";
  category: string;
  title: string;
  trigger: string;
  background: string;
  unresolvedIssue: string;
  keywords: string[];
};

export type ConflictEpisode = {
  id: string;
  sourceType: SourceType;
  sourceReference: string;
  consentStatus: "synthetic_only" | "training_allowed" | "pending_review";
  copyrightStatus: "original_synthetic" | "licensed" | "pending_review";
  privacyStatus: "no_personal_data" | "anonymized" | "pending_review";
  qualityScore: number;
  quality: {
    naturalness: number;
    contextConsistency: number;
    strategyConsistency: number;
    emotionalContinuity: number;
    chineseColloquialism: number;
    nonRepetitiveness: number;
  };
  relationship: { type: RelationshipType; years?: number; hasChildren?: boolean };
  scene: { category: string; trigger: string; background?: string; unresolvedIssue?: string; sceneId: string };
  personA: CharacterProfile;
  personB: CharacterProfile;
  turns: ConflictTurn[];
  trajectory: number[];
  turningPoints?: { turnIndex: number; description: string }[];
  ending: "resolved" | "temporary_repair" | "withdrawal" | "cold_war" | "escalated" | "unfinished";
  latentConflict?: string;
  needsHumanReview?: boolean;
  relationshipBackground?: string;
  personAArchetype?: string;
  personBArchetype?: string;
  currentState?: "CONFLICT" | "DEESCALATE" | "SOOTHE" | "REFLECT" | "REPAIR" | "CLOSE";
  previousState?: "CONFLICT" | "DEESCALATE" | "SOOTHE" | "REFLECT" | "REPAIR" | "CLOSE";
  userIntent?: string[];
  aiStrategy?: string;
  emotionBefore?: Partial<EmotionState>;
  emotionAfter?: Partial<EmotionState>;
  stateTransition?: string;
  transitionReason?: string;
  surfaceConflict?: string;
  underlyingNeed?: string;
  interactionPattern?: string;
};

export type Classification = {
  labels: BehaviorLabel[];
  primary: BehaviorLabel;
  confidence: number;
};

export type StrategySelection = {
  primary: ConflictStrategy;
  secondary: ConflictStrategy[];
  rationale: string;
};

export type RetrievedEpisode = {
  episode: ConflictEpisode;
  score: number;
};

export type DebugTrace = {
  userStrategy: BehaviorLabel[];
  confidence: number;
  emotion: ConflictState;
  selectedStrategy: StrategySelection;
  retrievedEpisodeIds: string[];
  validator: { valid: boolean; issues: string[] };
  emotionPerformance?: EmotionPerformancePlan;
  memory?: {
    sessionId: string;
    sessionType: string;
    continuePreviousScene: boolean;
    activeTopic: string;
    memoryClaimDetected: boolean;
    claim: string;
    evidenceId?: string;
    evidenceSource?: string;
    evidenceConfidence: number;
    exactQuoteMatch: boolean;
    inferenceUsed: boolean;
    userCorrection: boolean;
    referenceDataUsedAsFact: false;
    issues: string[];
  };
  relationship?: {
    currentState: string;
    previousState: string;
    stateConfidence: number;
    stateDuration: number;
    conflictLocked: boolean;
    transitionReason: string;
  };
  reflection?: {
    insightDepth: 0 | 1 | 2 | 3;
    mutualUnderstanding: number;
    surfaceConflict?: string;
    triggerIdentified?: string;
    underlyingNeed?: string;
    userContribution?: string;
    characterContribution?: string;
    interactionPattern?: string;
  };
  safety?: { active: boolean; riskLevel: string; signals: string[]; confidence: number };
  repair?: {
    detected: boolean;
    type: string;
    strength: number;
    sincerity: number;
    momentum: number;
    attackMomentum: number;
    userSoftening: number;
    rejectionCount: number;
    conflictBudget: number;
    conflictPhase: string;
  };
  topic?: {
    topic: string;
    status: string;
    agreement?: string;
    actionOwner?: string;
    actionDeadline?: string;
    newEvidence: boolean;
    repetitionCount: number;
    topicExhaustionScore: number;
    stuckTopic: boolean;
    reopenAllowed: boolean;
    lettingGoReadiness: number;
    topicShiftProbability: number;
    dailyLifeReentryStrategy?: string;
    reason: string;
  };
  userState?: {
    anger: number;
    hurt: number;
    sadness: number;
    anxiety: number;
    aggression: number;
    withdrawal: number;
    openness: number;
    distress: number;
    intent: string[];
    trend: string;
    voiceSignals: "UNAVAILABLE";
    visualSignals: "UNAVAILABLE";
  };
};

export type SourceType = "human" | "public" | "synthetic" | "expert";

export type RelationshipType = "dating" | "cohabiting" | "married";

export type ArchetypeId =
  | "Pursuer"
  | "Critic"
  | "Defender"
  | "Withdrawer"
  | "Rationalizer"
  | "Pleaser"
  | "PassiveAggressive"
  | "Explosive";

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
  | "humor_release";

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
  relationship?: {
    currentState: string;
    previousState: string;
    stateConfidence: number;
    stateDuration: number;
    conflictLocked: boolean;
    transitionReason: string;
  };
  safety?: { active: boolean; riskLevel: string; signals: string[]; confidence: number };
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

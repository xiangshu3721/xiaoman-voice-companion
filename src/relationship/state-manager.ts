import type { ChatMessage } from "@/lib/providers";
import { classifyUserMessage } from "@/src/conflict-engine/classifier";
import { createInitialState, createNeutralBaselineState, updateConflictState } from "@/src/conflict-engine/state";
import type { Classification, ConflictScene, ConflictState } from "@/src/conflict-engine/types";
import { runSafetyGate, safetyStateFromAssessment } from "@/src/safety/safety-gate";
import { hasHighRiskHistory, recoveryState } from "@/src/safety/recovery-gate";
import type { RelationshipSnapshot, RelationshipState } from "./types";
import { analyzeReflection } from "./reflection-analyzer";
import { analyzeUserState } from "./user-state-analyzer";
import { detectRepairBid, isGenuineRepairBid, type RepairBid } from "./repair-bid-detector";
import { buildTopicLifecycle } from "./topic-lifecycle";
import { createSessionBoundary, isCasualOpening, type SessionBoundary } from "@/src/memory/grounding";

type RelationshipDynamics = {
  repairMomentum: number;
  attackMomentum: number;
  userSoftening: number;
  repairRejectionCount: number;
  conflictBudget: number;
  conflictPhase: "ESCALATING" | "ACTIVE" | "SOFTENING";
};

const clamp = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

function evolveDynamics(previous: RelationshipDynamics, bid: RepairBid, user: ReturnType<typeof analyzeUserState>, classification: Classification): RelationshipDynamics {
  const attack = classification.labels.some((label) => ["character_attack", "counterattack", "relationship_threat", "responsibility_shift", "dismissal", "sarcasm"].includes(label));
  const repairDrop = bid.types.reduce((sum, type) => sum + ({ APOLOGY: 25, OWNERSHIP: 30, AFFECTION: 15, FORGIVENESS_REQUEST: 15, PEACE_OFFERING: 20, VULNERABILITY: 20, RELATIONSHIP_CONFIRMATION: 15, REASSURANCE: 20, COMPROMISE: 20, PHYSICAL_AFFECTION: 20, HUMOR: 8 }[type] || 0), 0);
  const attackMomentum = clamp(previous.attackMomentum + (attack ? 20 : 0) - repairDrop - (bid.types.length >= 2 ? 15 : 0));
  const explicitReversal = bid.explicitInsult;
  const repairMomentum = clamp((explicitReversal ? Math.max(0, previous.repairMomentum - 35) : previous.repairMomentum - (bid.detected ? 10 : 10) + bid.points));
  const budgetCost = attack ? 15 : 0;
  const repairCost = bid.types.some((type) => ["APOLOGY", "OWNERSHIP", "VULNERABILITY"].includes(type)) ? 30 : bid.detected ? 20 : 0;
  const conflictBudget = clamp(previous.conflictBudget - budgetCost - repairCost - (user.withdrawal >= 68 ? 30 : 0));
  const userSoftening = clamp(Math.max(0, repairMomentum) + (bid.types.includes("AFFECTION") ? 10 : 0) + (user.aggression < 35 ? 10 : 0));
  const conflictPhase = repairMomentum >= 35 || attackMomentum < 45 ? "SOFTENING" : attackMomentum >= 65 ? "ESCALATING" : "ACTIVE";
  return { ...previous, repairMomentum, attackMomentum, userSoftening, conflictBudget, conflictPhase };
}

function strongDeescalate(user: ReturnType<typeof analyzeUserState>) {
  return user.intent.some((intent) => ["CRYING", "HURT_DISCLOSURE", "SADNESS_DISCLOSURE", "VULNERABILITY", "WITHDRAW", "SHUTDOWN", "SILENCE", "GOODBYE"].includes(intent)) || user.distress >= 75;
}

function strongRepair(user: ReturnType<typeof analyzeUserState>) {
  return user.intent.some((intent) => ["GENUINE_APOLOGY", "REPAIR_ATTEMPT", "ACKNOWLEDGEMENT"].includes(intent));
}

function hasReflectionSignal(user: ReturnType<typeof analyzeUserState>, reflection: ReturnType<typeof analyzeReflection>) {
  return reflection.insightDepth > 0 || user.intent.some((intent) => [
    "SELF_REFLECTION", "RELATIONSHIP_REFLECTION", "CURIOSITY", "OWNERSHIP",
    "PATTERN_RECOGNITION", "ROOT_CAUSE_EXPLORATION", "PERSPECTIVE_TAKING",
  ].includes(intent));
}

function canEnterReflection(user: ReturnType<typeof analyzeUserState>, reflection: ReturnType<typeof analyzeReflection>) {
  const explicit = hasReflectionSignal(user, reflection);
  const emotionalRoom = user.anger < 40 && user.aggression < 25 && user.arousal < 45 && user.distress < 50 && user.openness > 50;
  return explicit && (emotionalRoom || (user.anger < 55 && user.aggression < 40 && user.distress < 65));
}

function stateFromNeutralBaseline(user: ReturnType<typeof analyzeUserState>, classification: Classification, text: string): RelationshipState {
  if (strongDeescalate(user)) return "DEESCALATE";
  if (isCasualOpening(text)) return "CLOSE";
  if (classification.labels.includes("perfunctory_apology")) return "CONFLICT";
  if (classification.labels.some((label) => ["genuine_apology", "responsibility_acceptance", "acknowledgement"].includes(label))) return "DEESCALATE";
  if (/(?:我不好|说话太冲|刚才有点上头|伤到你|这句算我的|爱你|抱一下|别生气|不吵了)/.test(text)) return "DEESCALATE";
  if (classification.labels.some((label) => ["character_attack", "relationship_threat", "dismissal", "challenge", "interrogation", "counterattack", "sarcasm", "defense"].includes(label))) return "CONFLICT";
  return "CONFLICT";
}

function transition(input: { previous: RelationshipState; user: ReturnType<typeof analyzeUserState>; reflection: ReturnType<typeof analyzeReflection>; duration: number; locked: boolean; repairBid: RepairBid; dynamics: RelationshipDynamics }) {
  const { previous, user, reflection, locked, repairBid, dynamics } = input;
  if (locked) return user.intent.includes("GOODBYE") ? "CLOSE" as const : "SOOTHE" as const;
  if (previous === "CONFLICT") {
    const directRepair = repairBid.types.includes("APOLOGY") && repairBid.types.includes("OWNERSHIP");
    const repeatedRepair = repairBid.repeatedCount >= 2;
    if (!repairBid.explicitInsult && (repairBid.strength >= 0.6 || directRepair || repeatedRepair || dynamics.repairMomentum >= 60 || dynamics.repairRejectionCount >= 2 || dynamics.conflictBudget <= 20)) return "DEESCALATE";
    if (strongDeescalate(user) || (user.hurt > 65 && user.withdrawal > 55)) return "DEESCALATE";
    return "CONFLICT";
  }
  if (previous === "DEESCALATE") {
    if (repairBid.types.includes("FORGIVENESS_REQUEST") && !isGenuineRepairBid(repairBid)) return "DEESCALATE";
    if (strongRepair(user) || isGenuineRepairBid(repairBid) || (user.hurt > 45 && user.aggression < 35)) return "SOOTHE";
    if (user.aggression >= 58 && user.intent.some((intent) => ["ATTACK", "COUNTERATTACK", "DISMISS", "MOCK"].includes(intent))) return "CONFLICT";
    return "DEESCALATE";
  }
  if (previous === "SOOTHE") {
    if (user.aggression >= 58 && user.intent.some((intent) => ["ATTACK", "DISMISS", "MOCK"].includes(intent))) return "DEESCALATE";
    if (repairBid.detected && (isGenuineRepairBid(repairBid) || dynamics.repairMomentum >= 60)) return "SOOTHE";
    if (canEnterReflection(user, reflection)) return "REFLECT";
    return "SOOTHE";
  }
  if (previous === "REFLECT") {
    if (user.aggression >= 70 && user.arousal >= 65) return "CONFLICT";
    if (user.aggression >= 58 && user.intent.some((intent) => ["ATTACK", "DISMISS", "MOCK"].includes(intent))) return "DEESCALATE";
    if (user.intent.includes("GOODBYE") && reflection.insightDepth < 2) return "CLOSE";
    if (user.hurt >= 68 && !hasReflectionSignal(user, reflection)) return "SOOTHE";
    const hasInsight = reflection.insightDepth >= 1 && Boolean(reflection.triggerIdentified || reflection.underlyingNeed || reflection.interactionPattern);
    const readyForRepair = hasInsight && user.anger < 35 && user.aggression < 20 && user.openness > 60 && reflection.mutualUnderstanding > 50;
    if (readyForRepair) return "REPAIR";
    return "REFLECT";
  }
  if (previous === "REPAIR") {
    if (user.intent.includes("GOODBYE") || (user.anger < 30 && user.aggression < 20 && user.openness > 55) || (user.intent.includes("REPAIR_ATTEMPT") && user.openness >= 50 && user.aggression < 40)) return "CLOSE";
    if (user.aggression >= 58) return "DEESCALATE";
    return "REPAIR";
  }
  if (user.aggression >= 58) return "DEESCALATE";
  return "CLOSE";
}

function replayState(history: ChatMessage[]) {
  let state: RelationshipState = "CLOSE";
  let duration = 0;
  let penalty = 0;
  let conflictState = createInitialState();
  const historyStates: RelationshipState[] = [];
  let locked = false;
  let metrics: RelationshipDynamics = { repairMomentum: 0, attackMomentum: 0, userSoftening: 0, repairRejectionCount: 0, conflictBudget: 100, conflictPhase: "ACTIVE" };
  for (const message of history.filter((item) => item.role === "user")) {
    const priorHistory = history.slice(0, history.indexOf(message));
    const classification = classifyUserMessage(message.content);
    const safety = runSafetyGate({ text: message.content, history: priorHistory, previousRelationshipState: state });
    if (safety.active && (safety.riskLevel === "HIGH" || safety.riskLevel === "CRITICAL")) locked = true;
    const nextConflict = updateConflictState(conflictState, classification.labels, message.content, "Pursuer");
    const user = analyzeUserState({ text: message.content, classification, emotion: nextConflict, history: priorHistory, currentRelationshipState: state });
    const reflection = analyzeReflection({ history: priorHistory, currentText: message.content, userState: user });
    const repairBid = detectRepairBid({ text: message.content, history: priorHistory });
    const dynamics = evolveDynamics(metrics, repairBid, user, classification);
    const transitionDynamics: RelationshipDynamics = { ...dynamics, repairRejectionCount: repairBid.detected && state === "CONFLICT" ? metrics.repairRejectionCount + 1 : 0 };
    const next: RelationshipState = duration === 0 && state === "CLOSE"
      ? stateFromNeutralBaseline(user, classification, message.content)
      : transition({ previous: state, user, reflection, duration, locked, repairBid, dynamics: transitionDynamics });
    if (next === "CONFLICT" && state !== "CONFLICT") penalty = Math.min(2, penalty + 1);
    duration = next === state ? duration + 1 : 1;
    state = next;
    conflictState = nextConflict;
    metrics = { ...transitionDynamics, repairRejectionCount: repairBid.detected && next === "CONFLICT" ? metrics.repairRejectionCount + 1 : 0 };
    historyStates.push(state);
  }
  return { state, duration, penalty, conflictState, historyStates, locked, metrics };
}

export function buildRelationshipSnapshot(input: { history: ChatMessage[]; userMessage: string; classification: Classification; conflictState: ConflictState; scene?: ConflictScene; sessionBoundary?: SessionBoundary }): RelationshipSnapshot {
  const replay = replayState(input.history);
  const sessionBoundary = input.sessionBoundary || createSessionBoundary({ history: input.history });
  const safetyAssessment = runSafetyGate({ text: input.userMessage, history: input.history, previousRelationshipState: replay.state });
  const safetyState = safetyStateFromAssessment(safetyAssessment);
  const locked = replay.locked || hasHighRiskHistory(input.history);
  const userState = analyzeUserState({ text: input.userMessage, classification: input.classification, emotion: input.conflictState, history: input.history, currentRelationshipState: replay.state });
  const reflection = analyzeReflection({ history: input.history, currentText: input.userMessage, userState });
  const recovered = recoveryState({ history: input.history, currentState: replay.state, currentText: input.userMessage });
  const safetyOverride = safetyAssessment.riskLevel === "HIGH" || safetyAssessment.riskLevel === "CRITICAL";
  const conflictLocked = recovered.conflictLocked || safetyOverride;
  const repairBid = detectRepairBid({ text: input.userMessage, history: input.history });
  const dynamics = evolveDynamics(replay.metrics, repairBid, userState, input.classification);
  const transitionDynamics = { ...dynamics, repairRejectionCount: repairBid.detected && replay.state === "CONFLICT" ? replay.metrics.repairRejectionCount + 1 : 0 };
  const nextState = safetyOverride
    ? "SOOTHE"
    : sessionBoundary.relationshipState === "NEUTRAL_BASELINE" && !sessionBoundary.continuePreviousScene
      ? stateFromNeutralBaseline(userState, input.classification, input.userMessage)
      : transition({ previous: replay.state, user: userState, reflection, duration: replay.duration, locked: conflictLocked, repairBid, dynamics: transitionDynamics });
  const finalDynamics: RelationshipDynamics = {
    ...transitionDynamics,
    repairRejectionCount: repairBid.detected && nextState === "CONFLICT" ? replay.metrics.repairRejectionCount + 1 : 0,
  };
  const previousState = replay.state;
  const stateDuration = nextState === previousState ? replay.duration + 1 : 1;
  const penalty = nextState === "CONFLICT" && previousState !== "CONFLICT" ? Math.min(2, replay.penalty + 1) : replay.penalty;
  const scene = input.scene || {
    id: "general-topic",
    category: "general",
    title: "当前这件事",
    trigger: "当前对话中的议题",
    background: "",
    unresolvedIssue: "当前这件事",
    keywords: [],
  } satisfies ConflictScene;
  const topicLifecycle = buildTopicLifecycle({ history: input.history, userMessage: input.userMessage, scene, relationshipState: nextState, userState, classification: input.classification, repairBid, repairMomentum: finalDynamics.repairMomentum, attackMomentum: finalDynamics.attackMomentum, userSoftening: finalDynamics.userSoftening });
  return {
    sessionBoundary,
    currentState: nextState,
    previousState,
    stateConfidence: safetyAssessment.active ? safetyAssessment.confidence : userState.confidence,
    stateDuration,
    safetyState: { ...safetyState, conflictLocked, previousRelationshipState: previousState },
    conflictLocked,
    reentryPenalty: penalty,
    conflictState: input.conflictState,
    userState,
    reflection,
    transitionReason: safetyOverride ? "Safety Override activated" : `${previousState} -> ${nextState} based on text/context signals`,
    stateHistory: [...replay.historyStates, nextState],
    conflictSubtype: (previousState === "CONFLICT" || (sessionBoundary.relationshipState === "NEUTRAL_BASELINE" && nextState === "CONFLICT")) && input.classification.labels.includes("joking") && userState.hurt < 60 && userState.withdrawal < 35 && userState.distress < 35 ? "PLAYFUL" : "SERIOUS",
    repairBid,
    ...finalDynamics,
    ...topicLifecycle,
  };
}

import type { ChatMessage } from "@/lib/providers";
import { classifyUserMessage } from "@/src/conflict-engine/classifier";
import { createInitialState, replayUserHistory, updateConflictState } from "@/src/conflict-engine/state";
import type { Classification, ConflictState } from "@/src/conflict-engine/types";
import { runSafetyGate, safetyStateFromAssessment } from "@/src/safety/safety-gate";
import { hasHighRiskHistory, recoveryState } from "@/src/safety/recovery-gate";
import type { RelationshipSnapshot, RelationshipState } from "./types";
import { analyzeUserState } from "./user-state-analyzer";

function strongDeescalate(user: ReturnType<typeof analyzeUserState>) {
  return user.intent.some((intent) => ["CRYING", "HURT_DISCLOSURE", "SADNESS_DISCLOSURE", "VULNERABILITY", "WITHDRAW", "SHUTDOWN", "SILENCE", "GOODBYE"].includes(intent)) || user.distress >= 75;
}

function strongRepair(user: ReturnType<typeof analyzeUserState>) {
  return user.intent.some((intent) => ["GENUINE_APOLOGY", "REPAIR_ATTEMPT", "ACKNOWLEDGEMENT", "FORGIVENESS"].includes(intent));
}

function transition(input: { previous: RelationshipState; user: ReturnType<typeof analyzeUserState>; duration: number; locked: boolean }) {
  const { previous, user, locked } = input;
  if (locked) return user.intent.includes("GOODBYE") ? "CLOSE" as const : "SOOTHE" as const;
  if (previous === "CONFLICT") return strongDeescalate(user) || (user.hurt > 65 && user.withdrawal > 55) ? "DEESCALATE" : "CONFLICT";
  if (previous === "DEESCALATE") {
    if (strongRepair(user) || (user.hurt > 45 && user.aggression < 35)) return "SOOTHE";
    if (user.aggression >= 58 && user.intent.some((intent) => ["ATTACK", "COUNTERATTACK", "DISMISS", "MOCK"].includes(intent))) return "CONFLICT";
    return "DEESCALATE";
  }
  if (previous === "SOOTHE") {
    if (user.aggression >= 58 && user.intent.some((intent) => ["ATTACK", "DISMISS", "MOCK"].includes(intent))) return "DEESCALATE";
    if (strongRepair(user) && user.openness >= 55) return "REPAIR";
    return "SOOTHE";
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
  let state: RelationshipState = "CONFLICT";
  let duration = 0;
  let penalty = 0;
  let conflictState = createInitialState();
  const historyStates: RelationshipState[] = [];
  let locked = false;
  for (const message of history.filter((item) => item.role === "user")) {
    const classification = classifyUserMessage(message.content);
    const safety = runSafetyGate({ text: message.content, history: history.slice(0, history.indexOf(message)), previousRelationshipState: state });
    if (safety.active && (safety.riskLevel === "HIGH" || safety.riskLevel === "CRITICAL")) locked = true;
    const nextConflict = updateConflictState(conflictState, classification.labels, message.content, "Pursuer");
    const user = analyzeUserState({ text: message.content, classification, emotion: nextConflict, history, currentRelationshipState: state });
    const next = transition({ previous: state, user, duration, locked });
    if (next === "CONFLICT" && state !== "CONFLICT") penalty = Math.min(2, penalty + 1);
    duration = next === state ? duration + 1 : 1;
    state = next;
    conflictState = nextConflict;
    historyStates.push(state);
  }
  return { state, duration, penalty, conflictState, historyStates, locked };
}

export function buildRelationshipSnapshot(input: { history: ChatMessage[]; userMessage: string; classification: Classification; conflictState: ConflictState }): RelationshipSnapshot {
  const replay = replayState(input.history);
  const safetyAssessment = runSafetyGate({ text: input.userMessage, history: input.history, previousRelationshipState: replay.state });
  const safetyState = safetyStateFromAssessment(safetyAssessment);
  const locked = replay.locked || hasHighRiskHistory(input.history);
  const userState = analyzeUserState({ text: input.userMessage, classification: input.classification, emotion: input.conflictState, history: input.history, currentRelationshipState: replay.state });
  const recovered = recoveryState({ history: input.history, currentState: replay.state, currentText: input.userMessage });
  const nextState = safetyAssessment.active ? "SOOTHE" : transition({ previous: replay.state, user: userState, duration: replay.duration, locked: recovered.conflictLocked });
  const previousState = replay.state;
  const stateDuration = nextState === previousState ? replay.duration + 1 : 1;
  const penalty = nextState === "CONFLICT" && previousState !== "CONFLICT" ? Math.min(2, replay.penalty + 1) : replay.penalty;
  return {
    currentState: nextState,
    previousState,
    stateConfidence: safetyAssessment.active ? safetyAssessment.confidence : userState.confidence,
    stateDuration,
    safetyState: { ...safetyState, previousRelationshipState: previousState },
    conflictLocked: recovered.conflictLocked,
    reentryPenalty: penalty,
    conflictState: input.conflictState,
    userState,
    transitionReason: safetyAssessment.active ? "Safety Gate activated" : `${previousState} -> ${nextState} based on text/context signals`,
    stateHistory: [...replay.historyStates, nextState],
  };
}

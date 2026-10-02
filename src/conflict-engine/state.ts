import transitions from "@/data/conflicts/transitions.json";
import type { ChatMessage } from "@/lib/providers";
import type { ArchetypeId, BehaviorLabel, ConflictState, EmotionState } from "./types";
import { classifyUserMessage } from "./classifier";

const initialEmotion: EmotionState = { anger: 48, hurt: 54, disappointment: 50, anxiety: 42, contempt: 18, trust: 58, resentment: 38, connection: 62 };
const neutralEmotion: EmotionState = { anger: 0, hurt: 0, disappointment: 0, anxiety: 0, contempt: 0, trust: 0, resentment: 0, connection: 0 };

export function createInitialState(): ConflictState {
  return { ...initialEmotion, conflictIntensity: 2, turnCount: 0, trajectory: [2] };
}

export function createNeutralBaselineState(): ConflictState {
  return { ...neutralEmotion, conflictIntensity: 1, turnCount: 0, trajectory: [1] };
}

const clamp = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

function seededRange(range: [number, number], seed: string) {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) hash = (hash * 31 + seed.charCodeAt(index)) | 0;
  const ratio = Math.abs(hash % 1000) / 1000;
  return range[0] + (range[1] - range[0]) * ratio;
}

function calculateIntensity(state: EmotionState): 1 | 2 | 3 | 4 | 5 {
  const pressure = (state.anger + state.hurt + state.disappointment + state.contempt + state.resentment) / 5;
  if (pressure >= 78) return 5;
  if (pressure >= 61) return 4;
  if (pressure >= 43) return 3;
  if (pressure >= 25) return 2;
  return 1;
}

export function updateConflictState(state: ConflictState, labels: BehaviorLabel[], text: string, archetype: ArchetypeId = "Pursuer"): ConflictState {
  const next: ConflictState = { ...state };
  labels.forEach((label) => {
    const transition = (transitions as unknown as Record<string, { delta: Partial<Record<keyof EmotionState, [number, number]>> }>)[label];
    if (!transition) return;
    Object.entries(transition.delta).forEach(([key, range]) => {
      const emotion = key as keyof EmotionState;
      const delta = seededRange(range as [number, number], `${text}:${state.turnCount}:${label}:${emotion}`);
      next[emotion] = clamp(next[emotion] + delta);
    });
  });
  if (archetype === "Pursuer" && labels.includes("withdrawal")) next.anger = clamp(next.anger + 8);
  if (archetype === "Pursuer" && labels.includes("dismissal")) next.hurt = clamp(next.hurt + 7);
  if (archetype === "Withdrawer" && labels.includes("interrogation")) next.connection = clamp(next.connection - 8);
  if (archetype === "Pleaser" && labels.includes("genuine_apology")) next.anxiety = clamp(next.anxiety - 5);
  next.turnCount += 1;
  next.conflictIntensity = calculateIntensity(next);
  next.trajectory = [...next.trajectory.slice(-9), next.conflictIntensity];
  return next;
}

export function replayUserHistory(history: ChatMessage[], archetype: ArchetypeId = "Pursuer") {
  let state = createInitialState();
  history.filter((message) => message.role === "user").forEach((message) => {
    const classification = classifyUserMessage(message.content);
    state = updateConflictState(state, classification.labels, message.content, archetype);
  });
  return state;
}

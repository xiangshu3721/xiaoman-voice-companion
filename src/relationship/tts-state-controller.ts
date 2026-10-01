import type { TTSRequest } from "@/lib/providers";
import type { RelationshipSnapshot } from "./types";

export function ttsForRelationship(snapshot: RelationshipSnapshot): Pick<TTSRequest, "emotion" | "intensity" | "speed" | "volume"> {
  if (snapshot.safetyState.active) return { emotion: "calm", intensity: 0.22, speed: 0.9, volume: 0.88 };
  if (snapshot.currentState === "DEESCALATE") return { emotion: "hurt", intensity: 0.34, speed: 0.9, volume: 0.92 };
  if (snapshot.currentState === "SOOTHE") return { emotion: "hurt", intensity: 0.3, speed: 0.86, volume: 0.9 };
  if (snapshot.currentState === "REFLECT") return { emotion: "reflect", intensity: 0.34, speed: 0.88, volume: 0.9 };
  if (snapshot.currentState === "REPAIR") return { emotion: "calm", intensity: 0.28, speed: 0.94, volume: 0.96 };
  if (snapshot.currentState === "CLOSE") return { emotion: "calm", intensity: 0.22, speed: 0.96, volume: 0.94 };
  return { emotion: "angry", intensity: Math.min(0.98, 0.5 + snapshot.conflictState.conflictIntensity * 0.1), speed: 1.04, volume: 1 };
}

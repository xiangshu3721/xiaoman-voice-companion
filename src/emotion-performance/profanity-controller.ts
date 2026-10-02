import type { RelationshipSnapshot } from "@/src/relationship/types";

export function profanityLevel(input: { relationship: RelationshipSnapshot; text: string }): 0 | 1 | 2 {
  const { relationship, text } = input;
  if (relationship.safetyState.active || relationship.repairBid.detected || relationship.userState.withdrawal >= 60) return 0;
  if (relationship.currentState !== "CONFLICT" || relationship.conflictState.conflictIntensity < 4 || relationship.userState.aggression < 50 || relationship.userState.arousal < 75) return /烦死了|有完没完|搞什么|我真服了|靠/.test(text) ? 1 : 0;
  if (relationship.userState.aggression >= 75 && !/道歉|对不起|我错了|原谅/.test(text)) return 1;
  return 0;
}

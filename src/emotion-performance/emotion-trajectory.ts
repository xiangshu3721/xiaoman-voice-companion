import type { RelationshipSnapshot } from "@/src/relationship/types";

export function emotionTrajectory(input: { relationship: RelationshipSnapshot; historyLength: number }) {
  const current = input.relationship.currentState === "CONFLICT" ? input.relationship.conflictState.conflictIntensity : Math.max(1, Math.round(input.relationship.conflictState.conflictIntensity * 0.7));
  const rising = input.relationship.userState.trend === "rising";
  const falling = input.relationship.repairMomentum > 35 || input.relationship.userState.trend === "falling";
  const start = falling ? Math.min(5, current + 1) : rising ? Math.max(1, current - 1) : current;
  return Array.from({ length: Math.min(5, Math.max(2, input.historyLength)) }, (_, index) => {
    const value = falling ? start - index : rising ? start + index : start;
    return Math.max(1, Math.min(5, value));
  });
}

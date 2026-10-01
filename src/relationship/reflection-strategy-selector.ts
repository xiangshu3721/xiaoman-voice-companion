import type { ReflectionState, UserStateAnalysis } from "./types";

export type ReflectionStrategy = "brief_pause" | "mutual_reflection" | "needs_reflection" | "ownership_reflection";

export function selectReflectionStrategy(input: { reflection: ReflectionState; userState: UserStateAnalysis }): { strategy: ReflectionStrategy; instruction: string } {
  if (input.reflection.insightDepth === 0) {
    return { strategy: "brief_pause", instruction: "只说一小句正在想，不要强行分析，也不要逼用户认错。" };
  }
  if (input.reflection.insightDepth >= 3 && input.reflection.underlyingNeed) {
    return { strategy: "needs_reflection", instruction: "自然说出表面事件下面真正介意的需要，同时承认角色自己做得不好的部分。" };
  }
  if (input.reflection.userContribution && input.reflection.characterContribution) {
    return { strategy: "mutual_reflection", instruction: "同时回看双方的反应和相互影响，不把用户变成被分析的对象。" };
  }
  return { strategy: "ownership_reflection", instruction: "先承认角色自己的反应，再用生活化的话看见刚才发生的行为。" };
}

import type { ArchetypeId, StrategySelection } from "@/src/conflict-engine/types";
import type { RelationshipSnapshot } from "./types";
import { selectResponseStrategy } from "@/src/conflict-engine/strategy";
import type { ConflictStrategy } from "@/src/conflict-engine/types";

const reentryStrategyMap: Record<string, ConflictStrategy> = {
  FOOD_REQUEST: "care",
  PHYSICAL_AFFECTION: "companionship",
  SMALL_FAVOR: "care",
  DAILY_ROUTINE: "care",
  PLAYFUL_DEMAND: "small_agreement",
  LIGHT_TEASING: "light_teasing",
  COMPANIONSHIP: "companionship",
  ACTIVITY_SHIFT: "companionship",
  CARE_BEHAVIOR: "care",
  HUMOROUS_BARGAIN: "humor_release",
};

export function selectRelationshipStrategy(input: { snapshot: RelationshipSnapshot; labels: Parameters<typeof selectResponseStrategy>[0]["labels"]; archetype?: ArchetypeId }): StrategySelection {
  const archetype = input.archetype || "Pursuer";
  const state = input.snapshot.currentState;
  if (input.snapshot.dailyLifeReentryText) {
    const primary = reentryStrategyMap[input.snapshot.dailyLifeReentryStrategy || "COMPANIONSHIP"] || "companionship";
    return { primary, secondary: ["companionship", "care"], rationale: `议题已暂时谈妥，进入生活化转场：${input.snapshot.dailyLifeReentryStrategy || "COMPANIONSHIP"}` };
  }
  if (input.snapshot.stuckTopic && input.snapshot.topicClosure.shouldBlockReopen) {
    return { primary: "companionship", secondary: ["care", "humor_release"], rationale: "同一议题出现语义重复，强制停止追责并转回共同生活" };
  }
  const shouldSoften = input.snapshot.conflictPhase === "SOFTENING" || (input.snapshot.repairBid.detected && input.snapshot.repairBid.sincerityConfidence >= 0.5 && !input.snapshot.repairBid.explicitInsult) || input.snapshot.repairMomentum >= 35 || input.snapshot.attackMomentum < 35 || input.snapshot.conflictBudget <= 40;
  if (state === "CONFLICT" && shouldSoften) {
    return { primary: "softening", secondary: ["soft_acknowledgement", "residual_hurt", "relationship_reassurance"], rationale: "用户正在递出台阶：保留余气，但停止继续攻击" };
  }
  if (state === "DEESCALATE") return { primary: "softening", secondary: ["space", "acknowledge_hurt"], rationale: "降温：停止刺激并承认刚才上头" };
  if (state === "SOOTHE") return { primary: "acknowledge_hurt", secondary: ["validation", "companionship"], rationale: "安抚：先接住受伤，不急着解决" };
  if (state === "REFLECT") return { primary: "perspective_taking", secondary: ["ownership", "acknowledge_hurt"], rationale: "反思：角色自己回看触发、反应和双方的影响" };
  if (state === "REPAIR") return { primary: "small_agreement", secondary: ["ownership", "relationship_reassurance"], rationale: "修复：事实、感受、需要和一个小行动" };
  if (state === "CLOSE") return { primary: "companionship", secondary: ["care", "humor_release"], rationale: "结束：回到生活，不制造产品感" };
  return selectResponseStrategy({ state: input.snapshot.conflictState, labels: input.labels, archetype });
}

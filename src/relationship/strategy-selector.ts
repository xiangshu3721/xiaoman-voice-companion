import type { ArchetypeId, StrategySelection } from "@/src/conflict-engine/types";
import type { RelationshipSnapshot } from "./types";
import { selectResponseStrategy } from "@/src/conflict-engine/strategy";

export function selectRelationshipStrategy(input: { snapshot: RelationshipSnapshot; labels: Parameters<typeof selectResponseStrategy>[0]["labels"]; archetype?: ArchetypeId }): StrategySelection {
  const archetype = input.archetype || "Pursuer";
  const state = input.snapshot.currentState;
  if (state === "DEESCALATE") return { primary: "softening", secondary: ["space", "acknowledge_hurt"], rationale: "降温：停止刺激并承认刚才上头" };
  if (state === "SOOTHE") return { primary: "acknowledge_hurt", secondary: ["validation", "companionship"], rationale: "安抚：先接住受伤，不急着解决" };
  if (state === "REFLECT") return { primary: "perspective_taking", secondary: ["ownership", "acknowledge_hurt"], rationale: "反思：角色自己回看触发、反应和双方的影响" };
  if (state === "REPAIR") return { primary: "small_agreement", secondary: ["ownership", "relationship_reassurance"], rationale: "修复：事实、感受、需要和一个小行动" };
  if (state === "CLOSE") return { primary: "companionship", secondary: ["care", "humor_release"], rationale: "结束：回到生活，不制造产品感" };
  return selectResponseStrategy({ state: input.snapshot.conflictState, labels: input.labels, archetype });
}

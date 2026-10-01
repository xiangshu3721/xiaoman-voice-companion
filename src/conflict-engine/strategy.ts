import type { ArchetypeId, BehaviorLabel, ConflictState, ConflictStrategy, StrategySelection } from "./types";

const secondaryFor: Partial<Record<BehaviorLabel, ConflictStrategy[]>> = {
  defense: ["challenge", "sarcasm"],
  explanation: ["perspective_taking", "relationship_reassurance"],
  responsibility_shift: ["counterattack", "historical_grievance"],
  dismissal: ["challenge", "magnification"],
  character_attack: ["counterattack", "relationship_threat"],
  perfunctory_apology: ["challenge", "historical_grievance"],
  genuine_apology: ["softening", "validation"],
  responsibility_acceptance: ["softening", "repair_attempt"],
  showing_vulnerability: ["validation", "softening"],
  problem_solving: ["repair_attempt", "softening"],
  acknowledgement: ["acknowledge_hurt", "validation"],
  relationship_threat: ["withdrawal", "counterattack"],
  silence: ["withdrawal", "interrogation"],
};

function primaryFor(label: BehaviorLabel, state: ConflictState, archetype: ArchetypeId): ConflictStrategy {
  if (label === "genuine_apology" || label === "responsibility_acceptance") return state.hurt > 65 ? "validation" : "softening";
  if (label === "problem_solving") return state.hurt > 45 ? "small_agreement" : "repair_attempt";
  if (label === "acknowledgement") return state.hurt > 55 ? "acknowledge_hurt" : "validation";
  if (label === "showing_vulnerability") return "softening";
  if (label === "perfunctory_apology") return archetype === "PassiveAggressive" ? "sarcasm" : "challenge";
  if (label === "character_attack") return state.conflictIntensity >= 4 ? "counterattack" : "challenge";
  if (label === "relationship_threat") return "relationship_threat";
  if (label === "silence") return archetype === "Pursuer" ? "interrogation" : "withdrawal";
  if (label === "dismissal") return "challenge";
  if (label === "withdrawal") return "interrogation";
  if (archetype === "PassiveAggressive") return "sarcasm";
  if (archetype === "Critic" && state.conflictIntensity >= 4) return "blame";
  if (archetype === "Withdrawer") return "withdrawal";
  return "challenge";
}

export function selectResponseStrategy(input: { state: ConflictState; labels: BehaviorLabel[]; archetype?: ArchetypeId }): StrategySelection {
  const archetype = input.archetype || "Pursuer";
  const current = input.labels[0] || "explanation";
  const primary = primaryFor(current, input.state, archetype);
  const secondary = (secondaryFor[current] || []).filter((strategy) => strategy !== primary).slice(0, 2);
  return { primary, secondary, rationale: `${archetype}在冲突强度${input.state.conflictIntensity}下回应${current}` };
}

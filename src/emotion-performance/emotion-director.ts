import type { ChatMessage } from "@/lib/providers";
import type { RelationshipSnapshot } from "@/src/relationship/types";
import type { StrategySelection } from "@/src/conflict-engine/types";
import type { SpeakerCapability } from "@/src/tts/types";
import { deliveryForEmotion } from "./delivery-planner";
import { emotionalPunchScore } from "./emotional-text-validator";
import { emotionTrajectory } from "./emotion-trajectory";
import { profanityLevel } from "./profanity-controller";
import { buildTTSInstruction } from "./tts-instruction-builder";
import { mapPlanToTTS } from "./tts-parameter-mapper";
import type { EmotionPerformancePlan, PerformanceEmotion, PerformanceIntensity } from "./types";

function chooseEmotion(relationship: RelationshipSnapshot, strategy: StrategySelection, text: string): PerformanceEmotion {
  if (relationship.safetyState.active) return "warm";
  if (relationship.currentState === "REFLECT") return "reflective";
  if (relationship.currentState === "REPAIR" || relationship.repairMomentum >= 60) return relationship.userState.hurt >= 55 ? "softening" : "warm";
  if (relationship.currentState === "CLOSE") return relationship.conflictSubtype === "PLAYFUL" ? "playful" : "warm";
  if (relationship.currentState !== "CONFLICT") return relationship.userState.hurt >= 55 ? "hurt" : "softening";
  if (/不是[……， ]*(你什么意思|你认真的)|所以最后还是我的错/.test(text)) return "disbelief";
  if (strategy.primary === "sarcasm") return "sarcastic_anger";
  if (strategy.primary === "withdrawal" || strategy.primary === "silent_treatment") return "cold_anger";
  if (strategy.primary === "counterattack" || strategy.primary === "relationship_threat") return relationship.conflictState.conflictIntensity >= 4 ? "explosive_anger" : "restrained_anger";
  if (relationship.conflictState.hurt >= 62 || relationship.userState.hurt >= 62) return "hurt_anger";
  if (/到底|多少遍|先让我说完|能不能别/.test(text)) return relationship.conflictState.conflictIntensity >= 4 ? "explosive_anger" : "impatient";
  return relationship.conflictState.conflictIntensity >= 4 ? "restrained_anger" : "annoyed";
}

export function createEmotionPerformancePlan(input: { relationship: RelationshipSnapshot; strategy: StrategySelection; reply: string; history: ChatMessage[]; sectionId: string; speaker?: SpeakerCapability; }): EmotionPerformancePlan {
  const primaryEmotion = chooseEmotion(input.relationship, input.strategy, input.reply);
  const base = input.relationship.safetyState.active ? 1 : input.relationship.currentState === "CONFLICT" ? input.relationship.conflictState.conflictIntensity : Math.max(1, Math.round(input.relationship.conflictState.conflictIntensity * 0.7));
  const reduced = input.relationship.repairMomentum >= 60 || input.relationship.currentState === "REPAIR" || input.relationship.currentState === "CLOSE";
  const intensity = Math.max(1, Math.min(5, reduced ? base - 1 : base)) as PerformanceIntensity;
  const delivery = deliveryForEmotion(primaryEmotion, intensity, input.reply);
  const trajectory = emotionTrajectory({ relationship: input.relationship, historyLength: input.history.length });
  const plan: EmotionPerformancePlan = { primaryEmotion, intensity, arousal: input.relationship.safetyState.active ? 18 : Math.min(100, input.relationship.userState.arousal + (primaryEmotion === "explosive_anger" ? 12 : 0)), valence: primaryEmotion === "warm" || primaryEmotion === "playful" ? 0.45 : primaryEmotion === "softening" ? -0.1 : -0.65, delivery, profanityLevel: profanityLevel({ relationship: input.relationship, text: input.reply }), ttsInstruction: "", sectionId: input.sectionId, fallbackUsed: false, emotionalPunchScore: emotionalPunchScore({ text: input.reply, relationship: input.relationship, emotion: primaryEmotion, intensity }), emotionScale: intensity };
  plan.ttsInstruction = `${buildTTSInstruction(plan, input.reply)} 当前情绪轨迹：${trajectory.join("→")}。`;
  const mapped = mapPlanToTTS(plan, input.speaker);
  plan.apiEmotion = mapped.apiEmotion;
  plan.emotionScale = mapped.emotionScale || intensity;
  plan.speechRate = mapped.speechRate;
  plan.loudnessRate = mapped.loudnessRate;
  plan.fallbackUsed = mapped.fallbackUsed;
  return plan;
}

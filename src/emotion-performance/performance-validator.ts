import type { SpeakerCapability } from "@/src/tts/types";
import type { EmotionPerformancePlan } from "./types";

export function validatePerformance(plan: EmotionPerformancePlan, text: string, speaker?: SpeakerCapability) {
  const issues: string[] = [];
  if (plan.primaryEmotion === "explosive_anger" && plan.intensity >= 4 && !/[？！?!]/.test(text)) issues.push("UNDERPERFORMED_EMOTION");
  if (plan.primaryEmotion === "sarcastic_anger" && !/(行|最忙|对对|真行|可真|呵|哦)/.test(text)) issues.push("MISSING_SARCASTIC_CUE");
  if (plan.primaryEmotion !== "neutral" && !plan.ttsInstruction) issues.push("MISSING_TTS_INSTRUCTION");
  if (speaker?.supportsEmotion && speaker.verificationStatus === "verified" && !plan.apiEmotion && plan.primaryEmotion !== "neutral") issues.push("EMOTION_MAPPING_MISSING");
  return { valid: issues.length === 0, issues };
}

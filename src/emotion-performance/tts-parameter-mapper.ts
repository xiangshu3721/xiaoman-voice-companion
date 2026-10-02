import type { SpeakerCapability } from "@/src/tts/types";
import type { EmotionPerformancePlan, PerformanceEmotion } from "./types";
import { rateForDelivery } from "./delivery-planner";

function apiEmotionFor(internal: PerformanceEmotion, supported: string[]) {
  const candidates: Record<PerformanceEmotion, string[]> = {
    neutral: ["neutral"], annoyed: ["angry"], restrained_anger: ["angry"], sarcastic_anger: ["angry"], explosive_anger: ["angry"], hurt_anger: ["sad", "angry"], cold_anger: ["angry", "sad"], disbelief: ["angry", "neutral"], impatient: ["angry"], contemptuous: ["angry"], hurt: ["sad"], sad: ["sad"], softening: ["sad", "happy"], warm: ["happy"], playful: ["happy"], reflective: ["sad", "neutral"],
  };
  return candidates[internal].find((candidate) => supported.includes(candidate));
}

export function mapPlanToTTS(plan: EmotionPerformancePlan, speaker?: SpeakerCapability) {
  const apiEmotion = speaker?.verificationStatus === "verified" && speaker.supportsEmotion ? apiEmotionFor(plan.primaryEmotion, speaker.supportedEmotions) : undefined;
  const rates = rateForDelivery(plan.delivery);
  return { apiEmotion, emotionScale: apiEmotion ? plan.emotionScale : undefined, speechRate: rates.speechRate, loudnessRate: rates.loudnessRate, fallbackUsed: Boolean(plan.primaryEmotion !== "neutral" && !apiEmotion) };
}

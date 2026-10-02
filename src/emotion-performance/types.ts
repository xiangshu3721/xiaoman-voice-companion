import type { TTSRequest } from "@/lib/providers";

export type PerformanceEmotion = "neutral" | "annoyed" | "restrained_anger" | "sarcastic_anger" | "explosive_anger" | "hurt_anger" | "cold_anger" | "disbelief" | "impatient" | "contemptuous" | "hurt" | "sad" | "softening" | "warm" | "playful" | "reflective";
export type PerformanceIntensity = 1 | 2 | 3 | 4 | 5;
export type Delivery = {
  pace: "slow" | "slightly_slow" | "normal" | "slightly_fast" | "fast";
  loudness: "quiet" | "slightly_low" | "normal" | "raised" | "strong";
  pitch: "low" | "slightly_low" | "normal" | "slightly_high" | "high";
  sharpness: "soft" | "normal" | "sharp";
  pauseStyle: "none" | "short" | "broken" | "long_before" | "dramatic";
  ending: "falling" | "rising" | "cut_off" | "flat" | "soft";
  emphasisWords: string[];
  nonverbal: "none" | "sigh" | "scoff" | "cold_laugh" | "breath";
};

export interface EmotionPerformancePlan {
  primaryEmotion: PerformanceEmotion;
  intensity: PerformanceIntensity;
  arousal: number;
  valence: number;
  delivery: Delivery;
  profanityLevel: 0 | 1 | 2;
  ttsInstruction: string;
  apiEmotion?: string;
  emotionScale?: 1 | 2 | 3 | 4 | 5;
  speechRate?: number;
  loudnessRate?: number;
  sectionId: string;
  fallbackUsed: boolean;
  emotionalPunchScore: number;
}

export type PerformanceTTSRequest = TTSRequest & { performancePlan?: EmotionPerformancePlan; primaryEmotion?: PerformanceEmotion; sectionId?: string; contextText?: string; emotionScale?: number };

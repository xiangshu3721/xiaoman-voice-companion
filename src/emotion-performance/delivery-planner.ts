import type { EmotionPerformancePlan, PerformanceEmotion, PerformanceIntensity } from "./types";

export function deliveryForEmotion(emotion: PerformanceEmotion, intensity: PerformanceIntensity, text: string): EmotionPerformancePlan["delivery"] {
  const emphasisWords = text.match(/(?:到底|多少遍|最忙|行了|随便|不想|没在意|什么意思|听我说)/g) || [];
  const map: Record<PerformanceEmotion, EmotionPerformancePlan["delivery"]> = {
    neutral: { pace: "normal", loudness: "normal", pitch: "normal", sharpness: "normal", pauseStyle: "short", ending: "soft", emphasisWords, nonverbal: "none" },
    annoyed: { pace: "slightly_fast", loudness: "normal", pitch: "slightly_high", sharpness: "sharp", pauseStyle: "short", ending: "cut_off", emphasisWords, nonverbal: "none" },
    restrained_anger: { pace: "normal", loudness: "slightly_low", pitch: "low", sharpness: "sharp", pauseStyle: "broken", ending: "falling", emphasisWords, nonverbal: "breath" },
    sarcastic_anger: { pace: "normal", loudness: "slightly_low", pitch: "slightly_low", sharpness: "sharp", pauseStyle: "short", ending: "falling", emphasisWords, nonverbal: "cold_laugh" },
    explosive_anger: { pace: "fast", loudness: "strong", pitch: "slightly_high", sharpness: "sharp", pauseStyle: "dramatic", ending: "cut_off", emphasisWords, nonverbal: "breath" },
    hurt_anger: { pace: "slightly_slow", loudness: "raised", pitch: "normal", sharpness: "sharp", pauseStyle: "broken", ending: "rising", emphasisWords, nonverbal: "breath" },
    cold_anger: { pace: "slow", loudness: "slightly_low", pitch: "low", sharpness: "sharp", pauseStyle: "long_before", ending: "flat", emphasisWords, nonverbal: "none" },
    disbelief: { pace: "slightly_slow", loudness: "normal", pitch: "slightly_high", sharpness: "normal", pauseStyle: "long_before", ending: "rising", emphasisWords, nonverbal: "none" },
    impatient: { pace: "slightly_fast", loudness: "raised", pitch: "normal", sharpness: "sharp", pauseStyle: "short", ending: "cut_off", emphasisWords, nonverbal: "none" },
    contemptuous: { pace: "normal", loudness: "slightly_low", pitch: "low", sharpness: "sharp", pauseStyle: "short", ending: "falling", emphasisWords, nonverbal: "scoff" },
    hurt: { pace: "slightly_slow", loudness: "slightly_low", pitch: "slightly_low", sharpness: "soft", pauseStyle: "broken", ending: "soft", emphasisWords, nonverbal: "breath" },
    sad: { pace: "slow", loudness: "quiet", pitch: "slightly_low", sharpness: "soft", pauseStyle: "broken", ending: "falling", emphasisWords, nonverbal: "sigh" },
    softening: { pace: "slightly_slow", loudness: "slightly_low", pitch: "normal", sharpness: "normal", pauseStyle: "short", ending: "soft", emphasisWords, nonverbal: "breath" },
    warm: { pace: "normal", loudness: "normal", pitch: "slightly_high", sharpness: "soft", pauseStyle: "short", ending: "soft", emphasisWords, nonverbal: "none" },
    playful: { pace: "normal", loudness: "normal", pitch: "slightly_high", sharpness: "normal", pauseStyle: "short", ending: "rising", emphasisWords, nonverbal: "cold_laugh" },
    reflective: { pace: "slow", loudness: "slightly_low", pitch: "normal", sharpness: "soft", pauseStyle: "long_before", ending: "soft", emphasisWords, nonverbal: "breath" },
  };
  return map[emotion];
}

export function rateForDelivery(delivery: EmotionPerformancePlan["delivery"]) {
  const speechRate: Record<EmotionPerformancePlan["delivery"]["pace"], number> = { slow: -12, slightly_slow: -7, normal: 0, slightly_fast: 12, fast: 26 };
  const loudnessRate: Record<EmotionPerformancePlan["delivery"]["loudness"], number> = { quiet: -12, slightly_low: -6, normal: 0, raised: 9, strong: 22 };
  return { speechRate: speechRate[delivery.pace], loudnessRate: loudnessRate[delivery.loudness] };
}

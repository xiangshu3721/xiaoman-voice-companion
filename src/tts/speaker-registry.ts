import rawSpeakers from "@/data/tts/seed-tts-2-speakers.json";
import type { SpeakerCapability } from "./types";

const registry = rawSpeakers as SpeakerCapability[];

export function getSpeakerRegistry() {
  return registry.map((speaker) => ({ ...speaker, supportedEmotions: [...speaker.supportedEmotions] }));
}

export function getSpeakerCapability(speakerId: string) {
  return registry.find((speaker) => speaker.speakerId === speakerId);
}

export function mergeConfiguredSpeaker(speakerId: string, displayName?: string) {
  return getSpeakerCapability(speakerId) || {
    speakerId,
    displayName: displayName || speakerId,
    gender: speakerId.includes("_male_") ? "male" as const : speakerId.includes("_female_") ? "female" as const : "unknown" as const,
    model: "seed-tts-2.0" as const,
    supportsEmotion: false,
    supportedEmotions: [],
    supportsContextTexts: true,
    supportsSectionId: true,
    supportsLoudnessRate: true,
    supportsSpeechRate: true,
    source: "official_docs" as const,
    verificationStatus: "unverified" as const,
    notes: "服务端配置音色；逐音色 Emotion 能力尚未 Runtime Probe。",
  } satisfies SpeakerCapability;
}

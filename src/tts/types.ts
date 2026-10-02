export type SpeakerGender = "female" | "male" | "unknown";
export type SpeakerSource = "official_metadata" | "official_docs" | "runtime_verified" | "manual_verified";

export interface SpeakerCapability {
  speakerId: string;
  displayName: string;
  gender: SpeakerGender;
  model: "seed-tts-2.0";
  supportsEmotion: boolean;
  supportedEmotions: string[];
  supportsContextTexts: boolean;
  supportsSectionId: boolean;
  supportsLoudnessRate: boolean;
  supportsSpeechRate: boolean;
  source: SpeakerSource;
  verificationStatus: "verified" | "unverified";
  verifiedAt?: string;
  notes?: string;
}

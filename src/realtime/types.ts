export type RealtimeConversationState =
  | "IDLE" | "PREPARING_MIC" | "LISTENING" | "USER_SPEAKING" | "POSSIBLE_END"
  | "FINALIZING_USER_TURN" | "AI_GENERATING" | "AI_SPEAKING" | "BARGE_IN_DETECTED"
  | "INTERRUPTING_AI" | "RECOVERING_ASR" | "ERROR";

export type MicHealth = {
  permissionGranted: boolean;
  trackState: string;
  trackMuted: boolean;
  audioContextState: string;
  vadAlive: boolean;
  asrAlive: boolean;
  lastVoiceActivityAt: number | null;
  lastAsrResultAt: number | null;
  noiseFloor: number;
  vadThreshold: number;
};

export type TranscriptAccumulatorState = {
  committedTranscript: string;
  interimTranscript: string;
  segmentHistory: string[];
};

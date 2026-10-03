export type VoiceTraceEvent =
  | "VOICE_SESSION_START"
  | "MIC_READY"
  | "ASR_START"
  | "ASR_READY"
  | "ASR_RESULT"
  | "USER_FINAL"
  | "AI_REQUEST"
  | "AI_TEXT_READY"
  | "TTS_REQUEST"
  | "TTS_READY"
  | "AUDIO_PLAY_CALL"
  | "AUDIO_PLAYING"
  | "AUDIO_PROGRESS"
  | "AUDIO_ENDED"
  | "ASR_RESTART"
  | "ASR_READY_NEXT_TURN";

export type VoiceTraceRecord = {
  event: VoiceTraceEvent;
  platform: "desktop" | "mobile";
  browser: string;
  sessionId: string;
  turnId?: string;
  timestamp: number;
};

function getPlatform() {
  if (typeof navigator === "undefined") return "desktop" as const;
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1) ? "mobile" as const : "desktop" as const;
}

function getBrowser() {
  if (typeof navigator === "undefined") return "unknown";
  const userAgent = navigator.userAgent;
  if (/CriOS/i.test(userAgent)) return "Chrome iOS";
  if (/FxiOS/i.test(userAgent)) return "Firefox iOS";
  if (/EdgiOS|EdgA|Edg/i.test(userAgent)) return "Edge";
  if (/Chrome|Chromium/i.test(userAgent)) return "Chrome";
  if (/Firefox/i.test(userAgent)) return "Firefox";
  if (/Safari/i.test(userAgent)) return "Safari";
  return "unknown";
}

export class VoiceTrace {
  private readonly platform = getPlatform();
  private readonly browser = getBrowser();

  constructor(private readonly sessionId: string) {}

  emit(event: VoiceTraceEvent, turnId?: string): VoiceTraceRecord {
    const record: VoiceTraceRecord = { event, platform: this.platform, browser: this.browser, sessionId: this.sessionId, turnId, timestamp: Date.now() };
    console.debug("[VOICE_TRACE]", record);
    return record;
  }
}

export type AudioSessionState =
  | "IDLE"
  | "PREPARING"
  | "LISTENING"
  | "USER_SPEAKING"
  | "SWITCHING_TO_PLAYBACK"
  | "PLAYBACK_READY"
  | "AI_SPEAKING"
  | "SWITCHING_TO_LISTENING"
  | "RECOVERING"
  | "ERROR";

export type AudioPlatformStrategy = "DESKTOP_FULL_DUPLEX" | "ANDROID_FULL_DUPLEX" | "IOS_SMART_HALF_DUPLEX";

function isIOSDevice() {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export function detectAudioPlatformStrategy(): AudioPlatformStrategy {
  if (isIOSDevice()) return "IOS_SMART_HALF_DUPLEX";
  if (typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent)) return "ANDROID_FULL_DUPLEX";
  return "DESKTOP_FULL_DUPLEX";
}

export class AudioSessionManager {
  private state: AudioSessionState = "IDLE";
  private readonly configuredStrategy?: AudioPlatformStrategy;

  constructor(strategy?: AudioPlatformStrategy, private readonly onStateChange?: (state: AudioSessionState) => void) {
    this.configuredStrategy = strategy;
  }

  getState() {
    return this.state;
  }

  getStrategy() {
    return this.configuredStrategy || detectAudioPlatformStrategy();
  }

  usesSmartHalfDuplex() {
    return this.getStrategy() === "IOS_SMART_HALF_DUPLEX";
  }

  setState(state: AudioSessionState) {
    this.state = state;
    this.onStateChange?.(state);
  }

  prepareForPlayback(releaseMicrophone: () => void) {
    this.setState("SWITCHING_TO_PLAYBACK");
    if (this.usesSmartHalfDuplex()) releaseMicrophone();
    this.setState("PLAYBACK_READY");
  }

  markAiSpeaking() {
    this.setState("AI_SPEAKING");
  }

  async prepareForListening(acquireMicrophone: () => Promise<boolean>) {
    this.setState("SWITCHING_TO_LISTENING");
    if (this.usesSmartHalfDuplex()) {
      const acquired = await acquireMicrophone();
      if (!acquired) {
        this.setState("ERROR");
        return false;
      }
    }
    this.setState("LISTENING");
    return true;
  }
}

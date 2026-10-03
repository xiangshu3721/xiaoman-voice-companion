import { DoubaoTTSProvider, type TTSCallbacks, type TTSProvider, type TTSRequest } from "@/lib/providers";
import { isIOSMobileBrowser, playAudioAndWaitUntilEnded, releaseVerifiedAudioUrl, requestSeedTTS, type VerifiedVoiceEventPayload } from "@/src/voice/verified-mobile-voice-core";

function currentTimeFromEvent(event: VerifiedVoiceEventPayload) {
  const match = event.detail?.match(/currentTime=([0-9.]+)/);
  return match ? Number(match[1]) : 0;
}

class VerifiedMobilePlaybackAdapter implements TTSProvider {
  private generation = 0;
  private abortController: AbortController | null = null;
  private audioUrl: string | null = null;

  isSupported() { return typeof window !== "undefined" && typeof window.Audio === "function"; }

  speak(request: TTSRequest, callbacks: TTSCallbacks) {
    const generation = ++this.generation;
    this.abortController?.abort();
    this.abortController = new AbortController();
    void this.run(request, callbacks, generation, this.abortController.signal);
  }

  stop() {
    this.generation += 1;
    this.abortController?.abort();
    this.abortController = null;
    releaseVerifiedAudioUrl(this.audioUrl);
    this.audioUrl = null;
  }

  private async run(request: TTSRequest, callbacks: TTSCallbacks, generation: number, signal: AbortSignal) {
    const event = (payload: VerifiedVoiceEventPayload) => {
      if (generation !== this.generation) return;
      if (payload.type === "AUDIO_PLAYING") callbacks.onPlaybackSignal?.({ type: "playing", currentTime: currentTimeFromEvent(payload) });
      if (payload.type === "AUDIO_FIRST_PROGRESS") callbacks.onPlaybackSignal?.({ type: "timeupdate", currentTime: currentTimeFromEvent(payload) });
      if (payload.type === "AUDIO_ENDED") callbacks.onPlaybackSignal?.({ type: "ended", currentTime: currentTimeFromEvent(payload) });
    };
    try {
      callbacks.onStateChange?.("REQUESTING");
      const url = await requestSeedTTS(request.text, event);
      if (generation !== this.generation || !url) throw new Error("TTS_AUDIO_UNAVAILABLE");
      this.audioUrl = url;
      callbacks.onMetrics?.({ provider: "volcengine", voice: request.voiceId || "verified-mobile", emotion: request.emotion, intensity: request.intensity, streaming: false, generationSuccess: true });
      callbacks.onStateChange?.("READY");
      callbacks.onStart?.();
      const result = await playAudioAndWaitUntilEnded(url, { label: "UNIFIED_TTS", signal, onEvent: event });
      if (generation !== this.generation) return;
      if (result === "ENDED") {
        callbacks.onStateChange?.("COMPLETED");
        callbacks.onEnd();
      } else {
        callbacks.onStateChange?.("FAILED");
        callbacks.onError("移动端音频播放失败");
      }
    } catch (error) {
      if (generation !== this.generation) return;
      callbacks.onStateChange?.("FAILED");
      callbacks.onError(error instanceof Error ? error.message : String(error));
    } finally {
      if (generation === this.generation) {
        releaseVerifiedAudioUrl(this.audioUrl);
        this.audioUrl = null;
      }
    }
  }
}

export class PlatformTTSProvider implements TTSProvider {
  private readonly desktopProvider = new DoubaoTTSProvider();
  private readonly mobileProvider = new VerifiedMobilePlaybackAdapter();

  private get activeProvider(): TTSProvider & { unlockAudio?: () => void; setAudioSessionType?: (type: "playback" | "play-and-record") => void } {
    return isIOSMobileBrowser() ? this.mobileProvider : this.desktopProvider;
  }

  isSupported() { return this.activeProvider.isSupported(); }
  speak(request: TTSRequest, callbacks: TTSCallbacks) { this.activeProvider.speak(request, callbacks); }
  stop() { this.activeProvider.stop(); }
  unlockAudio() { this.desktopProvider.unlockAudio?.(); }
  setAudioSessionType(type: "playback" | "play-and-record") { this.desktopProvider.setAudioSessionType?.(type); }
}

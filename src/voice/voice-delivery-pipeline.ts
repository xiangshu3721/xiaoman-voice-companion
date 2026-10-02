import type { TTSCallbacks, TTSProvider, TTSRequest, TTSPlaybackState } from "@/lib/providers";

export type VoiceJobState = "CREATED" | "GENERATING" | "GENERATED" | "VALIDATING" | "READY" | "PLAY_REQUESTED" | "PLAYING" | "COMPLETED" | "INTERRUPTED" | "RECOVERING" | "FAILED";

export type PlaybackSignal = { type: "loadedmetadata" | "canplay" | "play" | "playing" | "timeupdate" | "ended" | "error"; currentTime?: number; duration?: number; readyState?: number; networkState?: number; errorName?: string; errorMessage?: string };

export type VoiceJob = {
  assistantTurnId: string;
  voiceJobId: string;
  ttsRequestId: string;
  playbackToken: string;
  text: string;
  state: VoiceJobState;
  audioBytes?: number;
  audioDuration?: number;
  playbackAttempts: number;
  playbackStartedAt?: number;
  lastCurrentTime?: number;
  failureReason?: string;
};

export type VoiceDeliveryCallbacks = TTSCallbacks & {
  onJobState?: (job: VoiceJob) => void;
  onPlaybackSignal?: (signal: PlaybackSignal, job: VoiceJob) => void;
};

function id(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function mapState(state: TTSPlaybackState): VoiceJobState {
  if (state === "REQUESTING") return "GENERATING";
  if (state === "BUFFERING") return "GENERATED";
  if (state === "READY") return "READY";
  if (state === "PLAYING") return "PLAYING";
  if (state === "COMPLETED") return "COMPLETED";
  if (state === "INTERRUPTED") return "INTERRUPTED";
  if (state === "RECOVERING") return "RECOVERING";
  if (state === "FAILED") return "FAILED";
  return "PLAY_REQUESTED";
}

export class VoiceDeliveryPipeline {
  private activeJob: VoiceJob | null = null;

  constructor(private readonly provider: TTSProvider & { unlockAudio?: () => void }) {}

  unlockAudio() { this.provider.unlockAudio?.(); }

  getActiveJob() { return this.activeJob; }

  speak(assistantTurnId: string, request: TTSRequest, callbacks: VoiceDeliveryCallbacks): VoiceJob {
    this.stop("NEW_TURN");
    const job: VoiceJob = { assistantTurnId, voiceJobId: id("voice"), ttsRequestId: id("tts"), playbackToken: id("playback"), text: request.text, state: "CREATED", playbackAttempts: 0 };
    this.activeJob = job;
    const isActive = () => this.activeJob?.playbackToken === job.playbackToken;
    const publish = (state: VoiceJobState, reason?: string) => {
      if (!isActive()) return;
      job.state = state;
      if (reason) job.failureReason = reason;
      callbacks.onJobState?.({ ...job });
    };
    const wrapped: TTSCallbacks = {
      onStart: () => { if (!isActive()) return; publish("PLAY_REQUESTED"); callbacks.onStart?.(); },
      onProgress: (progress) => { if (!isActive()) return; callbacks.onProgress?.(progress); },
      onMetrics: (metrics) => {
        if (!isActive()) return;
        if (metrics.audioBytes != null) job.audioBytes = metrics.audioBytes;
        if (metrics.audioDuration != null) job.audioDuration = metrics.audioDuration;
        if (metrics.generationSuccess) publish(job.state === "GENERATING" ? "GENERATED" : job.state);
        callbacks.onMetrics?.(metrics);
      },
      onStateChange: (state) => { if (!isActive()) return; publish(mapState(state)); callbacks.onStateChange?.(state); },
      onPlaybackSignal: (signal) => {
        if (!isActive()) return;
        if (signal.duration != null) job.audioDuration = signal.duration;
        if (signal.currentTime != null) job.lastCurrentTime = signal.currentTime;
        if (signal.type === "playing") { job.playbackStartedAt = Date.now(); publish("PLAYING"); }
        callbacks.onPlaybackSignal?.(signal, { ...job });
      },
      onEnd: () => { if (!isActive()) return; publish("COMPLETED"); callbacks.onEnd(); this.activeJob = null; },
      onError: (message) => { if (!isActive()) return; publish("FAILED", message); callbacks.onError(message); },
    };
    publish("GENERATING");
    this.provider.speak(request, wrapped);
    return job;
  }

  stop(reason: "USER_BARGE_IN" | "NEW_TURN" | "SESSION_END" | "PLAYBACK_RECOVERY" | "STALE_JOB" | "SYSTEM_ERROR" = "SESSION_END") {
    const job = this.activeJob;
    if (job) {
      job.state = reason === "USER_BARGE_IN" ? "INTERRUPTED" : "INTERRUPTED";
      job.failureReason = reason;
      this.activeJob = null;
    }
    this.provider.stop();
  }
}

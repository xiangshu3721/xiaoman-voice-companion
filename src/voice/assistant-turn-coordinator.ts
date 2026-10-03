import type { TTSCallbacks, TTSMetrics, TTSPlaybackSignal, TTSRequest } from "@/lib/providers";
import { VoiceDeliveryPipeline, type VoiceJob, type VoiceJobState } from "@/src/voice/voice-delivery-pipeline";

export type AssistantTurnState =
  | "IDLE"
  | "GENERATING_TEXT"
  | "TEXT_STREAMING"
  | "TEXT_READY"
  | "TTS_PENDING"
  | "TTS_GENERATING"
  | "TTS_READY"
  | "PLAYBACK_STARTING"
  | "PLAYING"
  | "COMPLETED"
  | "COMPLETED_WITH_AUDIO_FAILURE"
  | "INTERRUPTED"
  | "FAILED";

export type AssistantTurnTrace = {
  assistantTurnId: string;
  generationId: number;
  sessionId: string;
  state: AssistantTurnState;
  voiceMode: boolean;
  voiceJobId?: string;
  playbackGeneration?: number;
  llmRequestStartedAt?: number;
  firstTokenAt?: number;
  llmCompletedAt?: number;
  messageCommittedAt?: number;
  voiceJobCreatedAt?: number;
  ttsStartedAt?: number;
  ttsSucceededAt?: number;
  audioBytes?: number;
  playRequestedAt?: number;
  playingAt?: number;
  playbackCurrentTime?: number;
  playbackEndedAt?: number;
  listeningRestoredAt?: number;
  events: string[];
  error?: string;
};

export type AssistantTurnCallbacks = {
  onStateChange?: (state: AssistantTurnState, trace: AssistantTurnTrace) => void;
  onTrace?: (trace: AssistantTurnTrace) => void;
  onVoiceJobCreated?: (job: VoiceJob) => void;
  onVoiceJobState?: (job: VoiceJob) => void;
  onTtsMetrics?: (metrics: TTSMetrics) => void;
  onPlaybackSignal?: (signal: TTSPlaybackSignal) => void;
  onAudioError?: (message: string) => void;
  onPlaybackEnded?: (trace: AssistantTurnTrace) => void;
  onPlaybackFailed?: (result: { error: string; trace: AssistantTurnTrace }) => void;
  onPlaybackInterrupted?: (result: { reason: string; trace: AssistantTurnTrace }) => void;
  onTurnFailed?: (result: { error: string; trace: AssistantTurnTrace }) => void;
};

type ActiveTurn = {
  trace: AssistantTurnTrace;
  callbacks: AssistantTurnCallbacks;
  ttsRequest?: TTSRequest;
  commitMessage: () => void;
  preparePlayback?: () => void;
  voiceJobCreated: boolean;
  completed: boolean;
  playbackRecoveryAttempted: boolean;
  playbackGeneration: number;
  voiceMissingTimer?: number;
  ttsStartTimer?: number;
  playbackTimer?: number;
};

function now() {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function scheduleTimer(callback: () => void, delay: number) {
  return globalThis.setTimeout(callback, delay) as unknown as number;
}

function cancelTimer(timer: number) {
  globalThis.clearTimeout(timer);
}

function mapVoiceState(state: VoiceJobState): AssistantTurnState | null {
  if (state === "GENERATING") return "TTS_GENERATING";
  if (state === "GENERATED" || state === "READY") return "TTS_READY";
  if (state === "PLAY_REQUESTED") return "PLAYBACK_STARTING";
  if (state === "FAILED") return "COMPLETED_WITH_AUDIO_FAILURE";
  if (state === "INTERRUPTED") return "INTERRUPTED";
  return null;
}

export class AssistantTurnCoordinator {
  private active: ActiveTurn | null = null;

  constructor(private readonly voicePipeline: VoiceDeliveryPipeline) {}

  getTrace() {
    return this.active ? { ...this.active.trace, events: [...this.active.trace.events] } : null;
  }

  beginTextGeneration(input: { assistantTurnId: string; generationId: number; sessionId: string; voiceMode: boolean; callbacks: AssistantTurnCallbacks }) {
    this.stop("INTERRUPTED");
    const trace: AssistantTurnTrace = { assistantTurnId: input.assistantTurnId, generationId: input.generationId, sessionId: input.sessionId, state: "GENERATING_TEXT", voiceMode: input.voiceMode, llmRequestStartedAt: Date.now(), events: ["LLM_REQUEST_START"] };
    this.active = { trace, callbacks: input.callbacks, commitMessage: () => undefined, voiceJobCreated: false, completed: false, playbackRecoveryAttempted: false, playbackGeneration: 0 };
    this.publish("GENERATING_TEXT");
  }

  markTextStreaming() {
    if (!this.active || this.active.completed) return;
    this.active.trace.firstTokenAt ||= Date.now();
    this.active.trace.events.push("FIRST_TOKEN");
    this.publish("TEXT_STREAMING");
  }

  commitAssistantMessage(input: { text: string; voiceMode: boolean; ttsRequest?: TTSRequest; commitMessage: () => void; preparePlayback?: () => void }) {
    const active = this.active;
    if (!active || active.completed) return false;
    active.trace.llmCompletedAt = Date.now();
    active.trace.events.push("LLM_COMPLETE");
    input.commitMessage();
    active.trace.messageCommittedAt = Date.now();
    active.trace.events.push("MESSAGE_COMMITTED");
    active.commitMessage = input.commitMessage;
    active.ttsRequest = input.ttsRequest;
    active.preparePlayback = input.preparePlayback;
    active.trace.voiceMode = input.voiceMode;
    this.publish("TEXT_READY");
    if (!input.voiceMode || !input.ttsRequest) {
      this.complete(false);
      return true;
    }
    this.scheduleCommitWatchdogs();
    this.createVoiceJob();
    return true;
  }

  failText(message: string) {
    if (!this.active || this.active.completed) return;
    this.active.trace.error = message;
    this.active.trace.events.push(`LLM_FAILED:${message}`);
    this.complete(true, "FAILED");
  }

  private createVoiceJob() {
    const active = this.active;
    if (!active || active.completed || active.voiceJobCreated || !active.ttsRequest || !active.trace.voiceMode) return;
    active.voiceJobCreated = true;
    active.playbackGeneration += 1;
    active.trace.playbackGeneration = active.playbackGeneration;
    active.trace.voiceJobCreatedAt = Date.now();
    active.trace.events.push("VOICE_JOB_CREATED");
    this.publish("TTS_PENDING");
    active.preparePlayback?.();
    const job = this.voicePipeline.speak(active.trace.assistantTurnId, active.ttsRequest, this.createTtsCallbacks(active));
    active.trace.voiceJobId = job.voiceJobId;
    this.publishTrace();
    active.callbacks.onVoiceJobCreated?.(job);
    if (active.trace.state === "PLAYBACK_STARTING") this.schedulePlaybackWatchdog();
  }

  private createTtsCallbacks(active: ActiveTurn): TTSCallbacks & { onJobState?: (job: VoiceJob) => void } {
    const isCurrent = () => this.active === active && !active.completed;
    return {
      onStart: () => { if (!isCurrent()) return; active.trace.playRequestedAt = Date.now(); active.trace.events.push("PLAY_REQUESTED"); this.publish("PLAYBACK_STARTING"); },
      onStateChange: (state) => {
        if (!isCurrent()) return;
        if (state === "REQUESTING") { active.trace.ttsStartedAt ||= Date.now(); active.trace.events.push("TTS_STARTED"); this.publish("TTS_GENERATING"); }
        if (state === "BUFFERING") this.publish("TTS_GENERATING");
        if (state === "READY") this.publish("TTS_READY");
      },
      onMetrics: (metrics) => {
        if (!isCurrent()) return;
        if (metrics.audioBytes != null) active.trace.audioBytes = metrics.audioBytes;
        if (metrics.generationSuccess) { active.trace.ttsSucceededAt = Date.now(); active.trace.events.push("TTS_SUCCESS"); this.publish("TTS_READY"); }
        active.callbacks.onTtsMetrics?.(metrics);
        this.publishTrace();
      },
      onPlaybackSignal: (signal) => {
        if (!isCurrent()) return;
        if (signal.currentTime != null) active.trace.playbackCurrentTime = signal.currentTime;
        if ((signal.type === "playing" || signal.type === "timeupdate") && (signal.currentTime || 0) > 0) {
          this.clearPlaybackWatchdog(active, "PLAYING");
          active.trace.playingAt ||= Date.now();
          active.trace.events.push("PLAYING");
          this.publish("PLAYING");
        }
        if (signal.type === "ended") { active.trace.playbackEndedAt = Date.now(); active.trace.events.push("PLAYBACK_ENDED"); }
        active.callbacks.onPlaybackSignal?.(signal);
        this.publishTrace();
      },
      onEnd: () => { if (!isCurrent()) return; this.complete(false); },
      onError: (message) => { if (!isCurrent()) return; active.trace.error = message; active.trace.events.push(`AUDIO_FAILED:${message}`); active.callbacks.onAudioError?.(message); this.complete(true); },
      onJobState: (job) => { if (!isCurrent()) return; active.trace.voiceJobId = job.voiceJobId; const mapped = mapVoiceState(job.state); if (mapped && mapped !== "COMPLETED_WITH_AUDIO_FAILURE") this.publish(mapped); active.callbacks.onVoiceJobState?.(job); },
    };
  }

  private scheduleCommitWatchdogs() {
    const active = this.active;
    if (!active) return;
    active.voiceMissingTimer = scheduleTimer(() => {
      if (this.active !== active || active.completed) return;
      if (!active.voiceJobCreated) { active.trace.events.push("VOICE_JOB_MISSING"); this.createVoiceJob(); }
    }, 500);
    active.ttsStartTimer = scheduleTimer(() => {
      if (this.active !== active || active.completed) return;
      if (!active.voiceJobCreated || active.trace.state === "TEXT_READY") { active.trace.events.push("TTS_PIPELINE_NOT_STARTED"); this.createVoiceJob(); }
    }, 1000);
  }

  private schedulePlaybackWatchdog() {
    const active = this.active;
    if (!active || active.playbackTimer || !active.trace.voiceJobId) return;
    const capturedVoiceJobId = active.trace.voiceJobId;
    const capturedPlaybackGeneration = active.playbackGeneration;
    active.trace.events.push(`PLAYBACK_WATCHDOG_ARM:${capturedVoiceJobId}:${capturedPlaybackGeneration}`);
    active.playbackTimer = scheduleTimer(() => {
      active.playbackTimer = undefined;
      if (this.active !== active || active.completed) return;
      if (capturedVoiceJobId !== active.trace.voiceJobId || capturedPlaybackGeneration !== active.playbackGeneration) return;
      if (active.trace.state === "TTS_READY" || active.trace.state === "PLAYBACK_STARTING") {
        if (!active.playbackRecoveryAttempted) {
          active.playbackRecoveryAttempted = true;
          active.trace.events.push(`PLAYBACK_RECOVERY:${capturedVoiceJobId}:${capturedPlaybackGeneration}`);
          this.voicePipeline.stop("PLAYBACK_RECOVERY");
          active.voiceJobCreated = false;
          this.createVoiceJob();
          return;
        }
        active.trace.events.push(`PLAYBACK_FAILED:PLAYBACK_START_TIMEOUT:${capturedVoiceJobId}:${capturedPlaybackGeneration}`);
        this.voicePipeline.stop("PLAYBACK_RECOVERY");
        active.trace.error = "PLAYBACK_START_TIMEOUT";
        active.callbacks.onAudioError?.("这次语音没有正常开始播放，正在恢复对话。");
        this.complete(true);
      }
    }, 2600);
  }

  private clearPlaybackWatchdog(active: ActiveTurn, reason: string) {
    if (active.playbackTimer === undefined) return;
    cancelTimer(active.playbackTimer);
    active.playbackTimer = undefined;
    active.trace.events.push(`PLAYBACK_WATCHDOG_CLEAR:${reason}:${active.trace.voiceJobId || "NONE"}:${active.playbackGeneration}`);
  }

  private publish(state: AssistantTurnState) {
    if (!this.active || this.active.completed) return;
    this.active.trace.state = state;
    if (state === "TTS_READY" || state === "PLAYBACK_STARTING") this.schedulePlaybackWatchdog();
    this.publishTrace();
    this.active.callbacks.onStateChange?.(state, { ...this.active.trace, events: [...this.active.trace.events] });
  }

  private publishTrace() {
    if (!this.active) return;
    this.active.callbacks.onTrace?.({ ...this.active.trace, events: [...this.active.trace.events] });
  }

  private clearTimers(active: ActiveTurn) {
    if (active.voiceMissingTimer !== undefined) cancelTimer(active.voiceMissingTimer);
    if (active.ttsStartTimer !== undefined) cancelTimer(active.ttsStartTimer);
    if (active.playbackTimer !== undefined) cancelTimer(active.playbackTimer);
    active.voiceMissingTimer = undefined;
    active.ttsStartTimer = undefined;
    active.playbackTimer = undefined;
  }

  private complete(audioFailure: boolean, state: AssistantTurnState = audioFailure ? "COMPLETED_WITH_AUDIO_FAILURE" : "COMPLETED") {
    const active = this.active;
    if (!active || active.completed) return;
    active.completed = true;
    this.clearTimers(active);
    active.trace.state = state;
    active.trace.events.push(state);
    if (!audioFailure) active.trace.listeningRestoredAt = Date.now();
    const trace = { ...active.trace, events: [...active.trace.events] };
    active.callbacks.onStateChange?.(state, trace);
    if (state === "COMPLETED") active.callbacks.onPlaybackEnded?.(trace);
    else if (state === "COMPLETED_WITH_AUDIO_FAILURE") active.callbacks.onPlaybackFailed?.({ error: active.trace.error || "PLAYBACK_FAILED", trace });
    else if (state === "INTERRUPTED") active.callbacks.onPlaybackInterrupted?.({ reason: active.trace.error || "INTERRUPTED", trace });
    else if (state === "FAILED") active.callbacks.onTurnFailed?.({ error: active.trace.error || "TURN_FAILED", trace });
  }

  stop(reason: "INTERRUPTED" | "SESSION_END" = "SESSION_END") {
    const active = this.active;
    if (active && !active.completed) {
      this.clearTimers(active);
      active.completed = true;
      active.trace.state = reason === "INTERRUPTED" ? "INTERRUPTED" : "FAILED";
      active.trace.events.push(reason);
      const trace = { ...active.trace, events: [...active.trace.events] };
      this.active = null;
      this.voicePipeline.stop(reason === "INTERRUPTED" ? "STALE_JOB" : "SESSION_END");
      active.callbacks.onStateChange?.(reason === "INTERRUPTED" ? "INTERRUPTED" : "FAILED", trace);
      if (reason === "INTERRUPTED") active.callbacks.onPlaybackInterrupted?.({ reason, trace });
      return;
    }
    this.active = null;
    this.voicePipeline.stop(reason === "INTERRUPTED" ? "STALE_JOB" : "SESSION_END");
  }
}

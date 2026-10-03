import { AssistantTurnCoordinator, type AssistantTurnTrace } from "../src/voice/assistant-turn-coordinator";
import type { TTSCallbacks, TTSProvider } from "../lib/providers";
import { VoiceDeliveryPipeline } from "../src/voice/voice-delivery-pipeline";

type Plan = "immediate" | "delayed" | "never" | "error";

class TimedTTSProvider implements TTSProvider {
  private timer: ReturnType<typeof setTimeout> | null = null;
  speakCount = 0;
  constructor(private readonly plans: Plan[]) {}
  isSupported() { return true; }
  stop() { if (this.timer) clearTimeout(this.timer); this.timer = null; }
  speak(_request: Parameters<TTSProvider["speak"]>[0], callbacks: TTSCallbacks) {
    const plan = this.plans[Math.min(this.speakCount, this.plans.length - 1)] || "immediate";
    this.speakCount += 1;
    callbacks.onStateChange?.("REQUESTING");
    callbacks.onMetrics?.({ provider: "browser", voice: "fake", streaming: false, generationSuccess: true, audioBytes: 800, audioDuration: 0.2 });
    callbacks.onStateChange?.("READY");
    callbacks.onStart?.();
    if (plan === "never") return;
    this.timer = setTimeout(() => {
      this.timer = null;
      if (plan === "error") {
        callbacks.onError("FAKE_PLAYBACK_ERROR");
        return;
      }
      callbacks.onPlaybackSignal?.({ type: "playing", currentTime: 0.05, duration: 0.2 });
      callbacks.onPlaybackSignal?.({ type: "timeupdate", currentTime: 0.1, duration: 0.2 });
      callbacks.onPlaybackSignal?.({ type: "ended", currentTime: 0.2, duration: 0.2 });
      callbacks.onEnd();
    }, plan === "delayed" ? 1000 : 15);
  }
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function makeTurn(plans: Plan[]) {
  const provider = new TimedTTSProvider(plans);
  const coordinator = new AssistantTurnCoordinator(new VoiceDeliveryPipeline(provider));
  const states: string[] = [];
  const traces: AssistantTurnTrace[] = [];
  let ended = 0;
  let failed = 0;
  coordinator.beginTextGeneration({
    assistantTurnId: "test-turn",
    generationId: 1,
    sessionId: "test-session",
    voiceMode: true,
    callbacks: {
      onStateChange: (state, trace) => { states.push(state); traces.push(trace); },
      onPlaybackEnded: () => { ended += 1; },
      onPlaybackFailed: () => { failed += 1; },
    },
  });
  coordinator.commitAssistantMessage({ text: "测试回复", voiceMode: true, ttsRequest: { text: "测试回复", emotion: "calm" }, commitMessage: () => undefined });
  return { provider, coordinator, states, traces, get ended() { return ended; }, get failed() { return failed; } };
}

async function run() {
  // 1. Normal playback ends once and is the only path that reports playback-ended.
  const normal = makeTurn(["immediate"]);
  await wait(80);
  if (normal.ended !== 1 || normal.failed !== 0) throw new Error("case 1: normal playback was not classified exactly once");

  // 2. A slow but real start (< watchdog) is not treated as a failure.
  const delayed = makeTurn(["delayed"]);
  await wait(1250);
  if (delayed.ended !== 1 || delayed.failed !== 0 || delayed.provider.speakCount !== 1) throw new Error("case 2: delayed playback was falsely recovered");

  // 3. A start timeout gets one controlled retry instead of immediately resuming ASR.
  const retry = makeTurn(["never", "immediate"]);
  await wait(2800);
  if (retry.provider.speakCount !== 2 || retry.ended !== 1 || retry.failed !== 0) throw new Error("case 3: playback timeout retry failed");

  // 4. A second start timeout becomes a playback failure, not playback-ended.
  const timeout = makeTurn(["never", "never"]);
  await wait(5450);
  if (timeout.provider.speakCount !== 2 || timeout.failed !== 1 || timeout.ended !== 0) throw new Error("case 4: repeated playback timeout was misclassified");

  // 5. Provider error is reported only after the pipeline has released its job.
  const providerError = makeTurn(["error"]);
  await wait(80);
  if (providerError.failed !== 1 || providerError.ended !== 0) throw new Error("case 5: provider error was not classified as playback failure");

  // 6. Stopping an old turn prevents its watchdog from affecting the new turn.
  const stale = makeTurn(["never", "immediate"]);
  await wait(60);
  stale.coordinator.beginTextGeneration({ assistantTurnId: "new-turn", generationId: 2, sessionId: "test-session", voiceMode: true, callbacks: {} });
  stale.coordinator.commitAssistantMessage({ text: "新回复", voiceMode: true, ttsRequest: { text: "新回复", emotion: "calm" }, commitMessage: () => undefined });
  await wait(120);
  if (stale.provider.speakCount !== 2 || stale.failed !== 0) throw new Error("case 6: stale watchdog leaked across turns");

  // 7. Playback-starting is observable before playing, so a resume timer cannot be mistaken for completion.
  const starting = makeTurn(["never"]);
  await wait(80);
  if (!starting.states.includes("PLAYBACK_STARTING") || starting.states.includes("COMPLETED")) throw new Error("case 7: playback-starting phase was not protected");

  // 8. Actual playing clears the watchdog and records a positive playing event.
  const playing = makeTurn(["immediate"]);
  await wait(80);
  const playingTrace = playing.traces.at(-1);
  if (!playingTrace?.events.includes("PLAYING") || !playingTrace.events.some((event) => event.startsWith("PLAYBACK_WATCHDOG_CLEAR:PLAYING"))) throw new Error("case 8: watchdog was not cleared after real playback");

  // 9. Audio failure never emits a normal completion callback.
  const failureOnly = makeTurn(["error"]);
  await wait(80);
  if (failureOnly.ended !== 0 || failureOnly.states.includes("COMPLETED")) throw new Error("case 9: audio failure emitted normal completion");

  // 10. Trace retains the recovery generation and failure reason for diagnosis.
  const traced = makeTurn(["never", "never"]);
  await wait(5450);
  const finalTrace = traced.traces.at(-1);
  if (!finalTrace?.events.some((event) => event.startsWith("PLAYBACK_RECOVERY:")) || !finalTrace.events.some((event) => event.startsWith("PLAYBACK_FAILED:PLAYBACK_START_TIMEOUT:")) || finalTrace.error !== "PLAYBACK_START_TIMEOUT") throw new Error("case 10: playback trace is incomplete");

  console.log(JSON.stringify({ cases: 10, passed: 10, normalEnded: normal.ended, timeoutFailed: timeout.failed, staleJobsSuppressed: true }));
}

void run().catch((error) => { console.error(error); process.exitCode = 1; });

import assert from "node:assert/strict";
import { VoiceDeliveryPipeline } from "@/src/voice/voice-delivery-pipeline";
import type { TTSCallbacks, TTSProvider, TTSRequest } from "@/lib/providers";

class DelayedTTSProvider implements TTSProvider {
  private callbacks: TTSCallbacks[] = [];
  private sequence = 0;
  isSupported() { return true; }
  speak(_request: TTSRequest, callbacks: TTSCallbacks) {
    const sequence = ++this.sequence;
    this.callbacks.push(callbacks);
    const delay = [1, 3, 7, 11, 17][sequence % 5];
    callbacks.onStateChange?.("REQUESTING");
    setTimeout(() => {
      callbacks.onStateChange?.("BUFFERING");
      callbacks.onMetrics?.({ provider: "volcengine", voice: "mock", streaming: false, generationSuccess: true });
      callbacks.onStateChange?.("READY");
      callbacks.onPlaybackSignal?.({ type: "playing", currentTime: 0.01, duration: 0.4 });
      callbacks.onPlaybackSignal?.({ type: "timeupdate", currentTime: 0.2, duration: 0.4 });
      callbacks.onStateChange?.("PLAYING");
      callbacks.onPlaybackSignal?.({ type: "ended", currentTime: 0.4, duration: 0.4 });
      callbacks.onStateChange?.("COMPLETED");
      callbacks.onEnd();
    }, delay);
  }
  stop() { /* Deliberately keep old callbacks alive to simulate late browser events. */ }
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
async function main() {
  const provider = new DelayedTTSProvider();
  const pipeline = new VoiceDeliveryPipeline(provider);
  let sequentialPass = 0;
  let staleCallbackLeaks = 0;

  for (let index = 0; index < 100; index += 1) {
  let completed = false;
  const job = pipeline.speak(`assistant-${index}`, { text: `压力测试第${index}轮` }, { onEnd: () => { completed = true; }, onError: () => undefined });
  await wait(30);
  assert.equal(completed, true, `voice job ${index + 1} did not complete`);
  assert.equal(job.state, "COMPLETED", `voice job ${index + 1} was not completed`);
  sequentialPass += 1;
  }

let rapidCompleted = 0;
  for (let index = 0; index < 100; index += 1) {
    pipeline.speak(`rapid-${index}`, { text: `快速竞态${index}` }, { onEnd: () => { rapidCompleted += 1; }, onError: () => undefined });
  }
  await wait(40);
  assert.equal(rapidCompleted, 1, "rapid turn test allowed an old callback to complete a new turn");
  staleCallbackLeaks = 99;

  console.log(JSON.stringify({
    voiceJobs: 100,
    sequentialPass,
    sequentialFailure: 100 - sequentialPass,
    rapidTurns: 100,
    rapidActiveCompletion: rapidCompleted,
    staleCallbackLeaks,
    note: "Deterministic desktop race simulation; real mobile playback requires /audio-diagnostics.",
  }, null, 2));
}

void main();

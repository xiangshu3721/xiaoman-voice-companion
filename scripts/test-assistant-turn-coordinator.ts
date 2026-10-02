import { AssistantTurnCoordinator, type AssistantTurnState } from "../src/voice/assistant-turn-coordinator";
import type { TTSCallbacks, TTSProvider } from "../lib/providers";
import { VoiceDeliveryPipeline } from "../src/voice/voice-delivery-pipeline";

class FakeTTSProvider implements TTSProvider {
  isSupported() { return true; }
  unlockAudio() {}
  stop() {}
  speak(_request: Parameters<TTSProvider["speak"]>[0], callbacks: TTSCallbacks) {
    callbacks.onStateChange?.("REQUESTING");
    callbacks.onMetrics?.({ provider: "browser", voice: "fake", streaming: false, generationSuccess: true, audioBytes: 1200, audioDuration: 1 });
    callbacks.onStateChange?.("READY");
    callbacks.onStart?.();
    callbacks.onPlaybackSignal?.({ type: "playing", currentTime: 0.05, duration: 1 });
    callbacks.onPlaybackSignal?.({ type: "timeupdate", currentTime: 0.5, duration: 1 });
    callbacks.onPlaybackSignal?.({ type: "ended", currentTime: 1, duration: 1 });
    callbacks.onEnd();
  }
}

const pipeline = new VoiceDeliveryPipeline(new FakeTTSProvider());
const coordinator = new AssistantTurnCoordinator(pipeline);
let completed = 0;
let failures = 0;
const states: AssistantTurnState[] = [];

for (let index = 0; index < 20; index += 1) {
  const turnStates: AssistantTurnState[] = [];
  coordinator.beginTextGeneration({ assistantTurnId: `assistant-${index + 1}`, generationId: index + 1, sessionId: "test-session", voiceMode: true, callbacks: {
    onStateChange: (state) => { turnStates.push(state); states.push(state); },
    onCompleted: ({ audioFailure }) => { if (audioFailure) failures += 1; else completed += 1; },
  } });
  coordinator.commitAssistantMessage({ text: "测试回复", voiceMode: true, ttsRequest: { text: "测试回复", emotion: "calm" }, commitMessage: () => undefined });
  const required: AssistantTurnState[] = ["GENERATING_TEXT", "TEXT_READY", "TTS_PENDING", "TTS_GENERATING", "TTS_READY", "PLAYBACK_STARTING", "PLAYING", "COMPLETED"];
  if (!required.every((state) => turnStates.includes(state))) throw new Error(`turn ${index + 1} missing state: ${required.filter((state) => !turnStates.includes(state)).join(",")}`);
  const textReadyIndex = turnStates.indexOf("TEXT_READY");
  if (turnStates.slice(textReadyIndex + 1).includes("GENERATING_TEXT")) throw new Error(`turn ${index + 1} returned to GENERATING_TEXT after commit`);
}

if (completed !== 20 || failures !== 0) throw new Error(`unexpected completion counts: ${completed}/${failures}`);
console.log(JSON.stringify({ turns: 20, completed, failures, statesAfterTextReadyNeverGenerating: true, stateCount: states.length }));

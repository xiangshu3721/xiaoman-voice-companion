import { VoiceRuntime } from "../src/voice/voice-runtime";
import type { TTSCallbacks, TTSProvider } from "../lib/providers";
import { VoiceDeliveryPipeline } from "../src/voice/voice-delivery-pipeline";

class DesktopGoldenTTSProvider implements TTSProvider {
  isSupported() { return true; }
  unlockAudio() {}
  stop() {}
  speak(_request: Parameters<TTSProvider["speak"]>[0], callbacks: TTSCallbacks) {
    callbacks.onStateChange?.("REQUESTING");
    callbacks.onMetrics?.({ provider: "volcengine", voice: "golden-desktop", streaming: false, generationSuccess: true, audioBytes: 1024, audioDuration: 0.4 });
    callbacks.onStateChange?.("READY");
    callbacks.onStart?.();
    callbacks.onPlaybackSignal?.({ type: "playing", currentTime: 0.05, duration: 0.4 });
    callbacks.onPlaybackSignal?.({ type: "timeupdate", currentTime: 0.2, duration: 0.4 });
    callbacks.onPlaybackSignal?.({ type: "ended", currentTime: 0.4, duration: 0.4 });
    callbacks.onEnd();
  }
}

const pipeline = new VoiceDeliveryPipeline(new DesktopGoldenTTSProvider());
const runtime = new VoiceRuntime(pipeline);
const events: string[] = ["VOICE_SESSION_START", "MIC_READY", "ASR_START", "ASR_READY", "ASR_RESULT", "USER_FINAL"];
let playbackEnded = 0;

runtime.beginTextGeneration({
  assistantTurnId: "golden-turn-1",
  generationId: 1,
  sessionId: "golden-session",
  voiceMode: true,
  callbacks: {
    onStateChange: (state) => {
      const eventByState = {
        GENERATING_TEXT: "AI_REQUEST",
        TEXT_READY: "AI_TEXT_READY",
        TTS_GENERATING: "TTS_REQUEST",
        TTS_READY: "TTS_READY",
        PLAYBACK_STARTING: "AUDIO_PLAY_CALL",
        PLAYING: "AUDIO_PLAYING",
        COMPLETED: "AUDIO_ENDED",
      } as const;
      const event = eventByState[state as keyof typeof eventByState];
      if (event) events.push(event);
    },
    onPlaybackEnded: () => {
      playbackEnded += 1;
      events.push("ASR_RESTART");
      events.push("ASR_READY_NEXT_TURN");
    },
  },
});

events.push("ASR_RESULT_FINAL");
runtime.commitAssistantMessage({
  text: "我刚刚有点烦。",
  voiceMode: true,
  ttsRequest: { text: "我刚刚有点烦。", emotion: "annoyed", intensity: 0.7 },
  commitMessage: () => events.push("MESSAGE_COMMITTED"),
});

const required = [
  "VOICE_SESSION_START",
  "MIC_READY",
  "ASR_START",
  "ASR_READY",
  "ASR_RESULT",
  "USER_FINAL",
  "AI_REQUEST",
  "ASR_RESULT_FINAL",
  "MESSAGE_COMMITTED",
  "AI_TEXT_READY",
  "TTS_REQUEST",
  "TTS_READY",
  "AUDIO_PLAY_CALL",
  "AUDIO_PLAYING",
  "AUDIO_ENDED",
  "ASR_RESTART",
  "ASR_READY_NEXT_TURN",
];

let cursor = -1;
for (const event of required) {
  const next = events.indexOf(event, cursor + 1);
  if (next === -1) throw new Error(`Golden Path missing or out of order: ${event}; events=${events.join(",")}`);
  cursor = next;
}
if (playbackEnded !== 1) throw new Error(`Golden Path expected one playback-ended callback, got ${playbackEnded}`);

console.log(JSON.stringify({ path: "desktop-golden", passed: true, playbackEnded, events }));

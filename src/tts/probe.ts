import { randomUUID } from "node:crypto";
import type { SpeakerCapability } from "./types";

const TTS_ENDPOINT = "https://openspeech.bytedance.com/api/v3/tts/unidirectional";
const PROBE_TEXT = "你到底有没有听我说话？";

export async function probeSpeakerEmotion(input: { apiKey: string; speaker: SpeakerCapability; emotion: string; }) {
  const response = await fetch(TTS_ENDPOINT, {
    method: "POST",
    headers: {
      "X-Api-Key": input.apiKey,
      "X-Api-Resource-Id": "seed-tts-2.0",
      "X-Api-Request-Id": randomUUID(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      req_params: {
        text: PROBE_TEXT,
        model: "seed-tts-2.0-standard",
        speaker: input.speaker.speakerId,
        audio_params: { format: "mp3", sample_rate: 24000, emotion: input.emotion, emotion_scale: 4 },
        additions: JSON.stringify({ context_texts: ["这是情侣冲突中的一句话，请保留明显但自然的情绪。"], section_id: randomUUID() }),
      },
    }),
    signal: AbortSignal.timeout(30000),
  });
  const payload = await response.text();
  const unsupported = /unsupported|not support|不支持|emotion/i.test(payload);
  const errorCode = [...payload.matchAll(/"code"\s*:\s*(-?\d+)/g)]
    .map((match) => Number(match[1]))
    .find((code) => code !== 0 && code !== 20000000);
  const success = response.ok && !unsupported && errorCode === undefined;
  return {
    success,
    status: response.status,
    detail: success ? undefined : unsupported ? "unsupported emotion" : errorCode === undefined ? `HTTP ${response.status}` : `provider code ${errorCode}`,
  };
}

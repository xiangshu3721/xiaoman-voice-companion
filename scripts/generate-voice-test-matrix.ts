import fs from "node:fs/promises";
import path from "node:path";
import speakers from "../data/tts/seed-tts-2-speakers.json";

const baseUrl = process.env.VOICE_TEST_BASE_URL || "http://127.0.0.1:3001";
const outputDirectory = path.resolve("public/voice-tests");
const cases = [
  { key: "sarcastic", text: "对，你最忙。全世界就你有事。", emotion: "angry", primaryEmotion: "sarcastic_anger", emotionScale: 3, speechRate: 5, loudnessRate: 3 },
  { key: "explosive", text: "你到底有没有听我说话？！", emotion: "angry", primaryEmotion: "explosive_anger", emotionScale: 5, speechRate: 26, loudnessRate: 22 },
  { key: "hurt_anger", text: "我等你那么久，你回来就跟我说这个？", emotion: "sad", primaryEmotion: "hurt_anger", emotionScale: 4, speechRate: 4, loudnessRate: 9 },
  { key: "cold", text: "行，随便你。", emotion: "angry", primaryEmotion: "cold_anger", emotionScale: 2, speechRate: -12, loudnessRate: -6 },
  { key: "softening", text: "……行了，我知道了，我还气一点。", emotion: "sad", primaryEmotion: "softening", emotionScale: 2, speechRate: -7, loudnessRate: -6 },
  { key: "playful", text: "行吧，给我买点好吃的，我考虑原谅你。", emotion: "happy", primaryEmotion: "playful", emotionScale: 2, speechRate: 0, loudnessRate: 0 },
] as const;

async function main() {
  await fs.mkdir(outputDirectory, { recursive: true });
  const results: Array<Record<string, unknown>> = [];
  for (const speaker of speakers) {
    for (const testCase of cases) {
      const fileName = `${speaker.speakerId}-${testCase.key}.mp3`;
      const sectionId = `voice-test-${speaker.speakerId}`;
      const response = await fetch(`${baseUrl}/api/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...testCase, text: testCase.text, voiceId: speaker.speakerId, intensity: testCase.emotionScale / 5, contextText: `这是情侣关系中的${testCase.key}表达。像真人说话，保留停顿、短句和关键词重音，不要播音腔。`, useSectionContext: true, sectionId }),
        signal: AbortSignal.timeout(30000),
      });
      const data = new Uint8Array(await response.arrayBuffer());
      if (!response.ok || !data.byteLength) throw new Error(`${speaker.speakerId}/${testCase.key}: HTTP ${response.status}`);
      await fs.writeFile(path.join(outputDirectory, fileName), data);
      results.push({ speakerId: speaker.speakerId, displayName: speaker.displayName, case: testCase.key, text: testCase.text, file: `/voice-tests/${fileName}`, status: response.status, bytes: data.byteLength, provider: response.headers.get("X-TTS-Provider"), emotion: response.headers.get("X-TTS-Emotion") || null, emotionScale: response.headers.get("X-TTS-Emotion-Scale") || null, sectionId: response.headers.get("X-TTS-Section-Id"), streaming: response.headers.get("X-TTS-Streaming"), fallbackUsed: response.headers.get("X-TTS-Fallback-Used") === "true" });
      console.log(`${speaker.speakerId} / ${testCase.key}: ${data.byteLength} bytes`);
    }
  }

  await fs.writeFile(path.join(outputDirectory, "voice-test-report.json"), `${JSON.stringify({ generatedAt: new Date().toISOString(), endpoint: `${baseUrl}/api/tts`, candidateCount: speakers.length, cases: cases.map(({ key, text }) => ({ key, text })), results }, null, 2)}\n`, "utf8");
  console.log(`Generated ${results.length} voice test files and voice-test-report.json in ${outputDirectory}`);
}

void main();

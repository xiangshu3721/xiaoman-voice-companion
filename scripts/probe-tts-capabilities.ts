import fs from "node:fs";
import path from "node:path";
import { probeSpeakerEmotion } from "../src/tts/probe";
import type { SpeakerCapability } from "../src/tts/types";

type ProbeResult = { emotion: string; success: boolean; status?: number; detail?: string };

function loadLocalEnv() {
  const envPath = path.resolve(".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
}

async function main() {
  loadLocalEnv();
  const apiKey = process.env.VOLCENGINE_TTS_API_KEY;
  if (!apiKey) {
    console.error("VOLCENGINE_TTS_API_KEY is not configured; no probe was run.");
    process.exitCode = 1;
    return;
  }

  const registryPath = path.resolve("data/tts/seed-tts-2-speakers.json");
  const registry = JSON.parse(fs.readFileSync(registryPath, "utf8")) as SpeakerCapability[];
  const emotions = ["angry", "sad", "happy"];
  let verified = 0;
  let supported = 0;

  for (const speaker of registry) {
    const results: ProbeResult[] = [];
    for (const emotion of emotions) {
      try {
        results.push({ emotion, ...(await probeSpeakerEmotion({ apiKey, speaker, emotion })) });
      } catch (error) {
        results.push({ emotion, success: false, detail: error instanceof Error ? error.message : "probe failed" });
      }
    }
    const receivedResponse = results.some((result) => typeof result.status === "number");
    if (receivedResponse) {
      const supportedEmotions = results.filter((result) => result.success).map((result) => result.emotion);
      speaker.supportsEmotion = supportedEmotions.length > 0;
      speaker.supportedEmotions = supportedEmotions;
      speaker.source = "runtime_verified";
      speaker.verificationStatus = "verified";
      speaker.verifiedAt = new Date().toISOString();
      speaker.notes = `Runtime Probe：${results.map((result) => `${result.emotion}=${result.success ? "success" : result.detail || "failed"}`).join(", ")}`;
      verified += 1;
      if (speaker.supportsEmotion) supported += 1;
    }
    console.log(`${speaker.speakerId}: ${results.map((result) => `${result.emotion}=${result.success ? "ok" : "no"}`).join(" ")}`);
  }

  fs.writeFileSync(registryPath, `${JSON.stringify(registry, null, 2)}\n`, "utf8");
  console.log(`Probe complete: ${registry.length} candidates, ${verified} runtime verified, ${supported} with at least one supported emotion.`);
}

void main();

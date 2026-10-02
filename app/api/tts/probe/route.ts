import { NextResponse } from "next/server";
import { corsHeaders } from "@/lib/cors";
import { getSpeakerCapability, getSpeakerRegistry } from "@/src/tts/speaker-registry";
import { probeSpeakerEmotion } from "@/src/tts/probe";
import { getRuntimeSpeaker, setRuntimeSpeaker } from "@/src/tts/runtime-cache";
import type { SpeakerCapability } from "@/src/tts/types";

export const maxDuration = 60;

export function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

export async function POST(request: Request) {
  const body = await request.json() as { speakerId?: string; emotions?: string[] };
  const base = body.speakerId ? getSpeakerCapability(body.speakerId) : undefined;
  if (!base || !getSpeakerRegistry().some((speaker) => speaker.speakerId === base.speakerId)) return NextResponse.json({ error: "speaker 不在候选注册表中" }, { status: 400, headers: corsHeaders() });
  const apiKey = process.env.VOLCENGINE_TTS_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "VOLCENGINE_TTS_API_KEY is not configured" }, { status: 503, headers: corsHeaders() });
  const emotions = [...new Set((body.emotions || ["angry"]).filter((emotion) => /^[a-z_]+$/.test(emotion)).slice(0, 3))];
  const results = await Promise.all(emotions.map(async (emotion) => ({ emotion, ...(await probeSpeakerEmotion({ apiKey, speaker: base, emotion })) })));
  const supportedEmotions = results.filter((result) => result.success).map((result) => result.emotion);
  const nextSpeaker: SpeakerCapability = { ...base, supportsEmotion: supportedEmotions.length > 0, supportedEmotions, source: "runtime_verified", verificationStatus: "verified", verifiedAt: new Date().toISOString(), notes: `Runtime Probe 测试：${results.map((result) => `${result.emotion}=${result.success ? "success" : "unsupported"}`).join(", ")}` };
  setRuntimeSpeaker(nextSpeaker);
  return NextResponse.json({ speaker: nextSpeaker, results }, { headers: corsHeaders() });
}

export async function GET(request: Request) {
  const speakerId = new URL(request.url).searchParams.get("speakerId");
  const speaker = speakerId ? getRuntimeSpeaker(speakerId) || getSpeakerCapability(speakerId) : undefined;
  return NextResponse.json({ speaker: speaker || null, cached: Boolean(speaker && getRuntimeSpeaker(speaker.speakerId)) }, { headers: corsHeaders() });
}

import { NextResponse } from "next/server";
import { DOUBAO_TTS_DEFAULTS, getConfiguredTTSVoices } from "@/lib/tts-config";
import { corsHeaders } from "@/lib/cors";
import { getSpeakerRegistry } from "@/src/tts/speaker-registry";
import { getRuntimeSpeaker } from "@/src/tts/runtime-cache";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

export async function GET() {
  return NextResponse.json({
    provider: "doubao",
    resourceId: process.env.VOLCENGINE_TTS_RESOURCE_ID || DOUBAO_TTS_DEFAULTS.resourceId,
    model: process.env.VOLCENGINE_TTS_MODEL || DOUBAO_TTS_DEFAULTS.model,
    configured: Boolean(process.env.VOLCENGINE_TTS_API_KEY),
    voices: getConfiguredTTSVoices().map((voice) => ({ ...voice, capability: getRuntimeSpeaker(voice.id) || getSpeakerRegistry().find((speaker) => speaker.speakerId === voice.id) || null })),
    speakers: getSpeakerRegistry().map((speaker) => getRuntimeSpeaker(speaker.speakerId) || speaker),
    defaultFemaleSpeaker: process.env.DEFAULT_FEMALE_SPEAKER || DOUBAO_TTS_DEFAULTS.voiceId,
    defaultMaleSpeaker: process.env.DEFAULT_MALE_SPEAKER || getConfiguredTTSVoices().find((voice) => voice.gender === "male")?.id || "",
  }, { headers: { ...corsHeaders(), "Cache-Control": "public, max-age=60, stale-while-revalidate=300" } });
}

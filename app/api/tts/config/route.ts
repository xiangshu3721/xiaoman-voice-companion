import { NextResponse } from "next/server";
import { DOUBAO_TTS_DEFAULTS, getConfiguredTTSVoices } from "@/lib/tts-config";
import { corsHeaders } from "@/lib/cors";

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
    voices: getConfiguredTTSVoices(),
  }, { headers: corsHeaders() });
}

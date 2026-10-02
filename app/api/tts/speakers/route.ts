import { NextResponse } from "next/server";
import { corsHeaders } from "@/lib/cors";
import { getSpeakerRegistry } from "@/src/tts/speaker-registry";
import { getRuntimeSpeaker } from "@/src/tts/runtime-cache";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

export async function GET() {
  const speakers = getSpeakerRegistry().map((speaker) => getRuntimeSpeaker(speaker.speakerId) || speaker);
  return NextResponse.json({ model: "seed-tts-2.0", speakers }, { headers: corsHeaders() });
}

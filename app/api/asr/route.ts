import { NextResponse } from "next/server";
import { corsHeaders } from "@/lib/cors";
import { transcribeWithVolcengine } from "@/src/asr/volcengine-asr";

export const runtime = "nodejs";
export const maxDuration = 30;

export function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

export async function POST(request: Request) {
  if (!process.env.VOLCENGINE_ASR_API_KEY) return NextResponse.json({ error: "云端语音识别尚未配置，请先配置 ASR API Key。" }, { status: 503, headers: corsHeaders() });
  const form = await request.formData();
  const audio = form.get("audio");
  if (!(audio instanceof Blob)) return NextResponse.json({ error: "缺少录音数据。" }, { status: 400, headers: corsHeaders() });
  if (audio.size < 128) return NextResponse.json({ error: "录音太短，请再说一次。" }, { status: 400, headers: corsHeaders() });
  if (audio.size > 8 * 1024 * 1024) return NextResponse.json({ error: "录音过长，请分段说。" }, { status: 413, headers: corsHeaders() });
  try {
    const result = await transcribeWithVolcengine(new Uint8Array(await audio.arrayBuffer()), audio.type || "audio/webm");
    if (!result.text) return NextResponse.json({ error: "没有听清，请再说一次。" }, { status: 422, headers: corsHeaders() });
    return NextResponse.json({ text: result.text }, { headers: { ...corsHeaders(), "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("ASR request failed", error);
    return NextResponse.json({ error: "云端语音识别暂时不可用，请再试一次。" }, { status: 502, headers: corsHeaders() });
  }
}

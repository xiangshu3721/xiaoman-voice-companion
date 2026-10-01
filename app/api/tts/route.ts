import { NextResponse } from "next/server";
import type { TTSRequest } from "@/lib/providers";
import { DOUBAO_TTS_DEFAULTS, getConfiguredTTSVoices } from "@/lib/tts-config";
import { corsHeaders } from "@/lib/cors";

const TTS_ENDPOINT = "https://openspeech.bytedance.com/api/v3/tts/unidirectional";

export const maxDuration = 60;

export function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

const emotionInstructions: Record<NonNullable<TTSRequest["emotion"]>, string> = {
  neutral: "自然、平静、像二三十岁中国女性日常说话，不要像播音或客服。",
  sarcastic: "表面平静但字里带刺，像熟悉的伴侣在讽刺，反问和重音要明显，不要夸张表演。",
  annoyed: "明显不耐烦，短促一点，像已经解释过很多遍，不要像播音或客服。",
  angry: "情绪强、更直接，像争吵中压着火，重音清楚、句子有冲击力，但不要喊叫。",
  hurt: "有明显受伤和失望，前半句可以嘴硬，后半句稍微泄气，保留自然停顿。",
  cold: "冷一点、短一点、克制一点，句间留白，像暂时不想继续争吵。",
  disappointed: "失望明显但不爆发，像在意却不想再解释，语气往下收。",
  calm: "自然、平静、像二三十岁中国女性日常说话，但仍然要有真实的态度。",
  reflect: "像熟悉的伴侣在慢慢回想刚才发生的事，清醒、真诚、略慢，保留‘我现在想想……’后的自然停顿，不要像心理咨询师或疗愈主播。",
};

const emotionExpression: Record<NonNullable<TTSRequest["emotion"]>, { speechRate: number; loudnessRate: number }> = {
  neutral: { speechRate: 0, loudnessRate: 0 },
  sarcastic: { speechRate: 5, loudnessRate: 3 },
  annoyed: { speechRate: 9, loudnessRate: 5 },
  angry: { speechRate: 15, loudnessRate: 9 },
  hurt: { speechRate: -10, loudnessRate: -3 },
  cold: { speechRate: -11, loudnessRate: -5 },
  disappointed: { speechRate: -8, loudnessRate: -3 },
  calm: { speechRate: -2, loudnessRate: 0 },
  reflect: { speechRate: -12, loudnessRate: -5 },
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function decodeChunk(data: string) {
  const binary = Buffer.from(data, "base64");
  return new Uint8Array(binary.buffer, binary.byteOffset, binary.byteLength);
}

export async function POST(request: Request) {
  const body = await request.json() as TTSRequest;
  const text = body.text?.trim();
  if (!text) return NextResponse.json({ error: "TTS text is required" }, { status: 400, headers: corsHeaders() });
  if (text.length > 500) return NextResponse.json({ error: "TTS text is too long" }, { status: 400, headers: corsHeaders() });

  const apiKey = process.env.VOLCENGINE_TTS_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "VOLCENGINE_TTS_API_KEY is not configured" }, { status: 503, headers: corsHeaders() });

  const resourceId = process.env.VOLCENGINE_TTS_RESOURCE_ID || DOUBAO_TTS_DEFAULTS.resourceId;
  const configuredVoice = process.env.VOLCENGINE_TTS_VOICE || DOUBAO_TTS_DEFAULTS.voiceId;
  const allowedVoices = new Set(getConfiguredTTSVoices().map((item) => item.id));
  const voice = body.voiceId && allowedVoices.has(body.voiceId) ? body.voiceId : configuredVoice;
  const model = process.env.VOLCENGINE_TTS_MODEL || DOUBAO_TTS_DEFAULTS.model;
  const intensity = clamp(body.intensity ?? 0.5, 0, 1);
  const speed = clamp(body.speed ?? 1, 0.5, 2);
  const volume = clamp(body.volume ?? 1, 0.5, 2);
  const requestedEmotion = body.emotion || "neutral";
  const emotion = emotionInstructions[requestedEmotion] ? requestedEmotion : "neutral";
  const expression = emotionExpression[emotion];
  const speechRate = body.speed == null ? Math.round(expression.speechRate * intensity) : Math.round((speed - 1) * 100);
  const loudnessRate = body.volume == null ? Math.round(expression.loudnessRate * intensity) : Math.round((volume - 1) * 100);

  const upstream = await fetch(TTS_ENDPOINT, {
    method: "POST",
    headers: {
      "X-Api-Key": apiKey,
      "X-Api-Resource-Id": resourceId,
      "X-Api-Request-Id": crypto.randomUUID(),
      "Content-Type": "application/json",
      Connection: "keep-alive",
    },
    body: JSON.stringify({
      req_params: {
        text,
        model,
        speaker: voice,
        context_texts: [emotionInstructions[emotion], `情绪强度为${Math.round(intensity * 100)}%。请保留中文标点、语气词、重复和短句带来的自然停顿，不要把情绪读平。`],
        audio_params: { format: "mp3", sample_rate: 24000, speech_rate: speechRate, loudness_rate: loudnessRate },
        disable_markdown_filter: false,
        explicit_language: "zh-cn",
      },
    }),
    signal: AbortSignal.timeout(30000),
  });

  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => "");
    return NextResponse.json({ error: `Volcengine TTS failed: ${upstream.status}`, detail: detail.slice(0, 500) }, { status: 502, headers: corsHeaders() });
  }

  let audio: Uint8Array;
  try {
    // CloudBase HTTP functions may terminate unexpectedly when a Web Stream
    // is closed from inside an async pull(). Buffering the small TTS response
    // keeps the function process stable; the browser still starts playback as
    // soon as this response arrives and can fall back safely on failure.
    const payload = new Uint8Array(await upstream.arrayBuffer());
    const contentType = upstream.headers.get("content-type") || "";
    if (contentType.startsWith("audio/") || looksLikeMp3(payload)) {
      audio = payload;
    } else {
      const payloadText = new TextDecoder().decode(payload);
      audio = parseAudioPayload(payloadText);
    }
  } catch (error) {
    console.error("Volcengine TTS response parsing failed", error);
    return NextResponse.json({ error: "Volcengine TTS returned an invalid audio response" }, { status: 502, headers: corsHeaders() });
  }

  return new Response(Buffer.from(audio), {
    status: 200,
    headers: {
      "Content-Type": "audio/mpeg",
      "Content-Length": String(audio.byteLength),
      "Cache-Control": "no-store",
      "X-TTS-Provider": "volcengine",
      "X-TTS-Voice": voice,
      "X-TTS-Streaming": "false",
      ...corsHeaders(),
    },
  });
}

function parseAudioPayload(text: string) {
  const dataFields = [...text.matchAll(/"data"\s*:\s*"([^"]+)"/g)].map((match) => match[1]);
  if (dataFields.length) return joinAudioChunks(dataFields.map(decodeChunk));

  let remainder = text;
  const chunks: Uint8Array[] = [];
  while (remainder.length) {
    const start = remainder.search(/\{/);
    if (start < 0) break;
    remainder = remainder.slice(start);
    const end = findJsonObjectEnd(remainder);
    if (end < 0) throw new Error("Volcengine TTS returned incomplete JSON");
    const rawJson = remainder.slice(0, end + 1);
    remainder = remainder.slice(end + 1);
    const chunk = JSON.parse(rawJson) as { code?: number; message?: string; data?: string; usage?: { text_words?: number } };
    const success = chunk.code === 0 || chunk.code === 20000000 || chunk.message === "OK";
    if (chunk.data) chunks.push(decodeChunk(chunk.data));
    if (typeof chunk.code === "number" && !success) throw new Error(chunk.message || `Volcengine TTS code ${chunk.code}`);
  }
  if (!chunks.length) throw new Error("Volcengine TTS returned no audio data");
  return joinAudioChunks(chunks);
}

function joinAudioChunks(chunks: Uint8Array[]) {
  const size = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
  const audio = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    audio.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return audio;
}

function looksLikeMp3(bytes: Uint8Array) {
  return bytes.length >= 3 && (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33 || bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0);
}

function findJsonObjectEnd(text: string) {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') { inString = true; continue; }
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

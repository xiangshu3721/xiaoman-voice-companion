import { NextResponse } from "next/server";
import type { TTSRequest } from "@/lib/providers";
import { DOUBAO_TTS_DEFAULTS, getConfiguredTTSVoices } from "@/lib/tts-config";
import { corsHeaders } from "@/lib/cors";
import { getSpeakerCapability } from "@/src/tts/speaker-registry";

const TTS_ENDPOINT = "https://openspeech.bytedance.com/api/v3/tts/unidirectional";

export const maxDuration = 60;

export function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

const emotionInstructions: Record<string, string> = {
  neutral: "自然、平静、像二三十岁中国女性日常说话，不要像播音或客服。",
  sarcastic: "表面平静但字里带刺，像熟悉的伴侣在讽刺，反问和重音要明显，不要夸张表演。",
  annoyed: "明显不耐烦，短促一点，像已经解释过很多遍，不要像播音或客服。",
  angry: "情绪强、更直接，像争吵中压着火，重音清楚、句子有冲击力，但不要喊叫。",
  hurt: "有明显受伤和失望，前半句可以嘴硬，后半句稍微泄气，保留自然停顿。",
  cold: "冷一点、短一点、克制一点，句间留白，像暂时不想继续争吵。",
  disappointed: "失望明显但不爆发，像在意却不想再解释，语气往下收。",
  calm: "自然、平静、像二三十岁中国女性日常说话，但仍然要有真实的态度。",
  reflect: "像熟悉的伴侣在慢慢回想刚才发生的事，清醒、真诚、略慢，保留‘我现在想想……’后的自然停顿，不要像心理咨询师或疗愈主播。",
  restrained_anger: "这是情侣争吵里压着火的一句，声音不必很大，但字要咬重，停顿短而硬。",
  sarcastic_anger: "这是情侣正在争吵中的一句话，主要通过讽刺和反话表达，关键词重读，尾音略往下压。",
  explosive_anger: "这是激烈争吵中突然爆发的一句，语速和能量突然提高，但不要从头到尾一直尖叫。",
  hurt_anger: "这是生气里夹着委屈和被忽视的受伤，前半压着，后半情绪顶上来。",
  cold_anger: "刚刚还在争吵但现在心冷了，声音降低、语速变慢、句子短，不要大喊。",
  disbelief: "难以置信地反问，先停一下再说，像真的听不懂对方为什么这么讲。",
  softening: "刚刚吵过但对方递了台阶，仍有一点余气，后半句明显收住，不再攻击。",
  warm: "像熟悉的伴侣重新回到日常，温和但不甜腻，不要客服腔。",
  playful: "嘴硬里有一点玩笑和亲近感，像关系缓过来了，不要短视频配音腔。",
  reflective: "像熟悉的伴侣慢慢回想刚才发生的事，清醒、真诚、略慢，不要心理咨询师腔。",
};

const emotionExpression: Record<NonNullable<TTSRequest["emotion"]>, { speechRate: number; loudnessRate: number }> = {
  neutral: { speechRate: 0, loudnessRate: 0 },
  sarcastic: { speechRate: 5, loudnessRate: 3 },
  annoyed: { speechRate: 9, loudnessRate: 5 },
  angry: { speechRate: 15, loudnessRate: 9 },
  sad: { speechRate: -10, loudnessRate: -3 },
  happy: { speechRate: 6, loudnessRate: 2 },
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
  const speaker = getSpeakerCapability(voice);
  const model = process.env.VOLCENGINE_TTS_MODEL || DOUBAO_TTS_DEFAULTS.model;
  const intensity = clamp(body.intensity ?? 0.5, 0, 1);
  const speed = clamp(body.speed ?? 1, 0.5, 2);
  const volume = clamp(body.volume ?? 1, 0.5, 2);
  const requestedEmotion = body.emotion || "neutral";
  const emotionAllowed = Boolean(speaker?.verificationStatus === "verified" && speaker.supportsEmotion && speaker.supportedEmotions.includes(requestedEmotion));
  const emotion = emotionAllowed ? requestedEmotion : undefined;
  const expression = emotionExpression[requestedEmotion] || emotionExpression.neutral;
  const speechRate = body.speechRate ?? (body.speed == null ? Math.round(expression.speechRate * intensity) : Math.round((speed - 1) * 100));
  const loudnessRate = body.loudnessRate ?? (body.volume == null ? Math.round(expression.loudnessRate * intensity) : Math.round((volume - 1) * 100));
  const emotionScale = clamp(body.emotionScale ?? Math.round(1 + intensity * 4), 1, 5);
  const sectionId = body.sectionId || crypto.randomUUID();
  const contextText = body.contextText || emotionInstructions[body.primaryEmotion || requestedEmotion] || emotionInstructions.neutral;
  const additions = {
    ...(body.useSectionContext === false ? {} : { context_texts: [contextText] }),
    section_id: sectionId,
  };

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
        audio_params: { format: "mp3", sample_rate: 24000, speech_rate: speechRate, loudness_rate: loudnessRate, ...(emotion ? { emotion, emotion_scale: emotionScale } : {}) },
        additions: JSON.stringify({ ...additions, explicit_language: "zh-cn", disable_markdown_filter: false }),
      },
    }),
    signal: AbortSignal.timeout(30000),
  });

  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => "");
    return NextResponse.json({ error: `Volcengine TTS failed: ${upstream.status}`, detail: detail.slice(0, 500) }, { status: 502, headers: corsHeaders() });
  }

  const upstreamContentType = upstream.headers.get("content-type") || "";
  if (upstreamContentType.startsWith("audio/")) {
    return new Response(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": upstreamContentType,
        "Cache-Control": "no-store",
        "X-TTS-Provider": "volcengine",
        "X-TTS-Voice": voice,
        "X-TTS-Emotion": emotion || "",
        "X-TTS-Emotion-Scale": emotion ? String(emotionScale) : "",
        "X-TTS-Section-Id": sectionId,
        "X-TTS-Fallback-Used": String(!emotionAllowed && requestedEmotion !== "neutral"),
        "X-TTS-Streaming": "true",
        ...corsHeaders(),
      },
    });
  }

  if (upstreamContentType.includes("text/plain") || upstreamContentType.includes("json")) {
    return new Response(createAudioStream(upstream.body), {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
        "X-TTS-Provider": "volcengine",
        "X-TTS-Voice": voice,
        "X-TTS-Emotion": emotion || "",
        "X-TTS-Emotion-Scale": emotion ? String(emotionScale) : "",
        "X-TTS-Section-Id": sectionId,
        "X-TTS-Fallback-Used": String(!emotionAllowed && requestedEmotion !== "neutral"),
        "X-TTS-Streaming": "true",
        ...corsHeaders(),
      },
    });
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
      "X-TTS-Emotion": emotion || "",
      "X-TTS-Emotion-Scale": emotion ? String(emotionScale) : "",
      "X-TTS-Section-Id": sectionId,
      "X-TTS-Fallback-Used": String(!emotionAllowed && requestedEmotion !== "neutral"),
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

function createAudioStream(body: ReadableStream<Uint8Array>) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let remainder = "";
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        while (true) {
          const next = await reader.read();
          remainder += decoder.decode(next.value || new Uint8Array(), { stream: !next.done });
          while (true) {
            const start = remainder.search(/\{/);
            if (start < 0) {
              remainder = remainder.slice(-32);
              break;
            }
            remainder = remainder.slice(start);
            const end = findJsonObjectEnd(remainder);
            if (end < 0) break;
            const rawJson = remainder.slice(0, end + 1);
            remainder = remainder.slice(end + 1);
            const chunk = JSON.parse(rawJson) as { code?: number; message?: string; data?: string };
            const success = chunk.code === undefined || chunk.code === 0 || chunk.code === 20000000 || chunk.message === "OK";
            if (!success) throw new Error(chunk.message || `Volcengine TTS code ${chunk.code}`);
            if (chunk.data) controller.enqueue(decodeChunk(chunk.data));
          }
          if (next.done) {
            remainder += decoder.decode();
            if (remainder.trim()) throw new Error("Volcengine TTS returned incomplete JSON");
            controller.close();
            return;
          }
        }
      } catch (error) {
        controller.error(error);
      }
    },
    async cancel() {
      await reader.cancel();
    },
  });
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

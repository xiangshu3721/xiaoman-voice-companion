import { NextResponse } from "next/server";
import type { ChatMessage } from "@/lib/providers";
import { corsHeaders } from "@/lib/cors";

export const maxDuration = 30;

type ReviewEmotion = { label: string; level: number; evidence: string };
type EmotionReview = {
  title: string;
  summary: string;
  emotions: ReviewEmotion[];
  needs: string[];
  suggestions: string[];
  nextPrompt: string;
};
type ReviewRequest = { history?: ChatMessage[]; scenarioContext?: string; question?: string };

const FALLBACK_REVIEW: EmotionReview = {
  title: "这次让你难受的，不只是这一句话",
  summary: "从这一轮对话看，表面上是在说一件具体的事，底下更像是在确认：我对你来说到底重不重要。你想被看见，也想知道这段关系不是只有你一个人在用力。",
  emotions: [
    { label: "被忽视", level: 78, evidence: "你反复抓住了对方没有回应或没有在意的部分。" },
    { label: "委屈", level: 66, evidence: "你有不满，但真正想要的不是把话说赢。" },
    { label: "不安", level: 54, evidence: "你在试探对方是否还把你的感受放在心上。" },
  ],
  needs: ["被认真回应", "确定自己是重要的", "不用靠生气才能被看见"],
  suggestions: ["先说出最受伤的那一刻，不急着给对方下结论。", "把“你总是”换成“刚刚这件事让我觉得……”", "如果愿意，可以直接说你希望对方下一次怎么做。"],
  nextPrompt: "你更想先看看自己的真实需求，还是想练习下一句怎么说？",
};

function latestRound(history: ChatMessage[]) {
  const lastUserIndex = history.map((message) => message.role).lastIndexOf("user");
  if (lastUserIndex < 0) return history.slice(-6);
  return history.slice(Math.max(0, lastUserIndex - 2), Math.min(history.length, lastUserIndex + 3));
}

function text(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function list(value: unknown, fallback: string[]) {
  if (!Array.isArray(value)) return fallback;
  const result = value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim()).slice(0, 5);
  return result.length ? result : fallback;
}

function normaliseReview(value: unknown): EmotionReview {
  if (!value || typeof value !== "object") return FALLBACK_REVIEW;
  const candidate = value as Partial<EmotionReview>;
  const emotions = Array.isArray(candidate.emotions)
    ? candidate.emotions.map((item) => {
      const emotion = item as Partial<ReviewEmotion>;
      return {
        label: text(emotion.label, "复杂情绪"),
        level: Math.max(0, Math.min(100, Math.round(Number(emotion.level) || 50))),
        evidence: text(emotion.evidence, "这份感受和刚才的对话有关。"),
      };
    }).slice(0, 4)
    : FALLBACK_REVIEW.emotions;
  return {
    title: text(candidate.title, FALLBACK_REVIEW.title),
    summary: text(candidate.summary, FALLBACK_REVIEW.summary),
    emotions: emotions.length ? emotions : FALLBACK_REVIEW.emotions,
    needs: list(candidate.needs, FALLBACK_REVIEW.needs),
    suggestions: list(candidate.suggestions, FALLBACK_REVIEW.suggestions),
    nextPrompt: text(candidate.nextPrompt, FALLBACK_REVIEW.nextPrompt),
  };
}

function parseJson(content: string) {
  const cleaned = content.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("DeepSeek review was not JSON");
  return JSON.parse(cleaned.slice(start, end + 1)) as unknown;
}

function mockFollowup(question: string) {
  return `可以。先别急着判断自己是不是太敏感。你可以回到刚才最刺痛的那个瞬间，问自己：我当时最希望对方看见什么？如果答案是“我很在意，也希望你在意”，下一句就从这里说起。\n\n你刚刚问的是：${question}`;
}

async function callDeepSeek(apiKey: string, prompt: string) {
  const response = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "deepseek-chat",
      temperature: 0.55,
      max_tokens: 700,
      messages: [
        { role: "system", content: "你是一个温和、具体、不说教的亲密关系情绪复盘助手。你只分析用户提供的这一轮虚构对话，不做心理疾病诊断，不替任何一方下人格结论，不把分析写成空泛鸡汤。" },
        { role: "user", content: prompt },
      ],
    }),
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error(`DeepSeek review failed: ${response.status}`);
  const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error("DeepSeek review returned an empty reply");
  return content;
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

export async function POST(request: Request) {
  const body = await request.json() as ReviewRequest;
  const history = (body.history || []).filter((message) => message.role === "user" || message.role === "assistant").slice(-12);
  const round = latestRound(history);
  const question = body.question?.trim();
  const transcript = round.map((message) => `${message.role === "user" ? "用户" : "小满"}：${message.content}`).join("\n");
  if (!history.some((message) => message.role === "user")) {
    return NextResponse.json({ error: "先和小满聊一轮，再来做情绪复盘吧。" }, { status: 400, headers: corsHeaders() });
  }

  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (question) {
    if (!apiKey) return NextResponse.json({ answer: mockFollowup(question), mode: "mock" }, { headers: corsHeaders() });
    try {
      const answer = await callDeepSeek(apiKey, `这是刚才这一轮对话：\n${transcript}\n\n用户想继续复盘的问题：${question}\n\n请用 2 到 4 段简短中文回答。先回应问题，再给一个用户此刻就能尝试的小动作。不要诊断，不要替用户决定要不要分手，不要把小满的角色扮演内容当成现实事实。`);
      return NextResponse.json({ answer, mode: "deepseek" }, { headers: corsHeaders() });
    } catch (error) {
      console.error("emotion review follow-up error", error);
      return NextResponse.json({ answer: mockFollowup(question), mode: "fallback" }, { headers: corsHeaders() });
    }
  }

  if (!apiKey) return NextResponse.json({ review: FALLBACK_REVIEW, mode: "mock" }, { headers: corsHeaders() });
  try {
    const content = await callDeepSeek(apiKey, `请复盘下面这一轮亲密关系角色扮演。场景背景：${body.scenarioContext || "未提供"}\n\n对话：\n${transcript}\n\n只输出合法 JSON，不要 Markdown，不要额外解释，字段必须是：\n{"title":"一句有共鸣的标题","summary":"80到140字，解释这轮冲突表面和底下的情绪","emotions":[{"label":"情绪名称","level":0到100,"evidence":"结合对话的证据"}],"needs":["用户可能真正想要的需求，最多3条"],"suggestions":["可执行建议，最多3条"],"nextPrompt":"一句邀请用户继续复盘的问题"}\n\n要求：最多列 4 种情绪；区分情绪和需求；证据必须来自对话；建议不能是“好好沟通”这种空话；语气像一个懂关系的朋友，温和但不替用户下结论。`);
    return NextResponse.json({ review: normaliseReview(parseJson(content)), mode: "deepseek" }, { headers: corsHeaders() });
  } catch (error) {
    console.error("emotion review error", error);
    return NextResponse.json({ review: FALLBACK_REVIEW, mode: "fallback" }, { headers: corsHeaders() });
  }
}

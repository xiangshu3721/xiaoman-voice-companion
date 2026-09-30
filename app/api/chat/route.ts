import { NextResponse } from "next/server";
import type { ChatMessage, TTSRequest } from "@/lib/providers";
import { corsHeaders } from "@/lib/cors";
import { classifyUserMessage } from "@/src/conflict-engine/classifier";
import { buildConflictPrompt } from "@/src/conflict-engine/prompt-builder";
import { retrieveSimilarEpisodes, resolveScene } from "@/src/conflict-engine/retriever";
import { createInitialState, replayUserHistory, updateConflictState } from "@/src/conflict-engine/state";
import { selectResponseStrategy } from "@/src/conflict-engine/strategy";
import { fallbackForStrategy, validateResponse } from "@/src/conflict-engine/validator";
import type { ConflictState, DebugTrace } from "@/src/conflict-engine/types";

export const maxDuration = 60;

export function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

type ChatRequest = {
  history?: ChatMessage[];
  userMessage?: string;
  sceneContext?: string;
  scenarioId?: string;
  characterGender?: "female" | "male";
  debug?: boolean;
};

function removeDuplicatedCurrentTurn(history: ChatMessage[], userMessage: string) {
  const last = history[history.length - 1];
  return last?.role === "user" && last.content.trim() === userMessage ? history.slice(0, -1) : history;
}

function mockReply(strategy: ReturnType<typeof selectResponseStrategy>, userMessage: string, history: ChatMessage[]) {
  if (/对不起|抱歉|我错了/.test(userMessage) && /行行行|行吧|随便|行了/.test(userMessage)) return "你这叫道歉吗？说得好像是我逼你认错一样。";
  if (/无理取闹|夸张|神经|有病/.test(userMessage)) return "你现在还说我无理取闹？我在意的事情，在你这儿就这么不值一提。";
  if (history.length > 6 && strategy.primary === "withdrawal") return "算了，我现在不想再说了。";
  return fallbackForStrategy(strategy.primary);
}

function voiceCue(strategy: ReturnType<typeof selectResponseStrategy>, state: ConflictState): { emotion: NonNullable<TTSRequest["emotion"]>; intensity: number } {
  const emotion = strategy.primary === "sarcasm"
    ? "sarcastic"
    : strategy.primary === "counterattack" || strategy.primary === "relationship_threat"
      ? "angry"
      : strategy.primary === "withdrawal" || strategy.primary === "silent_treatment"
        ? state.disappointment >= 65 ? "disappointed" : "cold"
        : strategy.primary === "softening" || strategy.primary === "validation" || strategy.primary === "repair_attempt"
          ? state.hurt >= 60 ? "hurt" : "neutral"
          : strategy.primary === "challenge" && state.anger >= 68 ? "angry" : strategy.primary === "challenge" || strategy.primary === "interrogation" ? "annoyed" : "neutral";
  const intensityByTier = [0.35, 0.54, 0.7, 0.86, 0.98][state.conflictIntensity - 1];
  const strategyBoost = ["sarcasm", "challenge", "interrogation", "counterattack", "relationship_threat"].includes(strategy.primary) ? 0.06 : 0;
  const repairReduction = ["softening", "validation", "repair_attempt"].includes(strategy.primary) ? 0.08 : 0;
  return { emotion, intensity: Math.max(0.25, Math.min(1, Number((intensityByTier + strategyBoost - repairReduction).toFixed(2)))) };
}

async function callDeepSeek(apiKey: string, prompt: ReturnType<typeof buildConflictPrompt>, history: ChatMessage[], userMessage: string) {
  const response = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "deepseek-chat",
      temperature: 0.92,
      max_tokens: 180,
      messages: [
        { role: "system", content: prompt.systemPrompt },
        { role: "system", content: prompt.contextPrompt },
        ...history.slice(-10),
        { role: "user", content: userMessage },
      ],
    }),
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error(`DeepSeek request failed: ${response.status}`);
  const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  const reply = data.choices?.[0]?.message?.content?.trim();
  if (!reply) throw new Error("DeepSeek returned an empty reply");
  return reply;
}

export async function POST(request: Request) {
  const body = (await request.json()) as ChatRequest;
  const userMessage = body.userMessage?.trim();
  if (!userMessage) return NextResponse.json({ error: "请输入你想说的话。" }, { status: 400, headers: corsHeaders() });

  const debugRequested = body.debug === true || new URL(request.url).searchParams.get("debug") === "true";
  const fullHistory = (body.history || []).slice(-20);
  const history = removeDuplicatedCurrentTurn(fullHistory, userMessage);
  const scene = resolveScene({ scenarioId: body.scenarioId, sceneContext: body.sceneContext });
  const classification = classifyUserMessage(userMessage);
  const previousState = history.length ? replayUserHistory(history, "Pursuer") : createInitialState();
  const state = updateConflictState(previousState, classification.labels, userMessage, "Pursuer");
  const strategy = selectResponseStrategy({ state, labels: classification.labels, archetype: "Pursuer" });
  const voice = voiceCue(strategy, state);
  const retrieved = retrieveSimilarEpisodes({ scene, archetype: "Pursuer", labels: classification.labels, intensity: state.conflictIntensity, limit: 3 });
  const characterGender = body.characterGender === "male" ? "male" : "female";
  const characterName = characterGender === "male" ? "死鬼" : "臭娘们";
  const prompt = buildConflictPrompt({ scene, state, classification, strategy, retrieved, history, userMessage, characterGender, characterName });
  const apiKey = process.env.DEEPSEEK_API_KEY;
  let reply = "";
  let mode: "mock" | "deepseek" | "fallback" = "mock";
  let validation = { valid: true, issues: [] as string[] };

  try {
    if (!apiKey) {
      reply = mockReply(strategy, userMessage, history);
    } else {
      reply = await callDeepSeek(apiKey, prompt, history, userMessage);
      validation = validateResponse(reply, history, strategy.primary);
      if (!validation.valid) {
        const retryPrompt = { ...prompt, systemPrompt: `${prompt.systemPrompt}\n\n上一次草稿不合格。请删除助手式表达，只返回更短、更像小满本人说的话。` };
        reply = await callDeepSeek(apiKey, retryPrompt, history, userMessage);
        validation = validateResponse(reply, history, strategy.primary);
      }
      mode = "deepseek";
    }
  } catch (error) {
    console.error("conflict chat route error", error);
    reply = fallbackForStrategy(strategy.primary);
    mode = "fallback";
    validation = validateResponse(reply, history, strategy.primary);
  }

  if (!reply || !validateResponse(reply, history, strategy.primary).valid) {
    reply = fallbackForStrategy(strategy.primary);
    mode = mode === "deepseek" ? "fallback" : mode;
  }

  const debug: DebugTrace = {
    userStrategy: classification.labels,
    confidence: classification.confidence,
    emotion: state,
    selectedStrategy: strategy,
    retrievedEpisodeIds: retrieved.map((item) => item.episode.id),
    validator: validation,
  };
  return NextResponse.json({ text: reply, reply, mode, voice, ...(debugRequested ? { debug } : {}) }, { headers: corsHeaders() });
}

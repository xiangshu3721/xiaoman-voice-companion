import { NextResponse } from "next/server";
import type { ChatMessage, TTSRequest } from "@/lib/providers";
import { corsHeaders } from "@/lib/cors";
import { classifyUserMessage } from "@/src/conflict-engine/classifier";
import { buildConflictPrompt } from "@/src/conflict-engine/prompt-builder";
import { retrieveSimilarEpisodes, resolveScene } from "@/src/conflict-engine/retriever";
import { createNeutralBaselineState, replayUserHistory, updateConflictState } from "@/src/conflict-engine/state";
import { selectResponseStrategy } from "@/src/conflict-engine/strategy";
import { fallbackForRelationshipState, fallbackForStrategy, validateReflectionResponse, validateRepairResponse, validateRepairBidResponse, validateResponse, validateTopicLifecycleResponse } from "@/src/conflict-engine/validator";
import type { ConflictState, DebugTrace } from "@/src/conflict-engine/types";
import { runSafetyGate } from "@/src/safety/safety-gate";
import { safetyResponse } from "@/src/safety/safety-response";
import { buildRelationshipSnapshot } from "@/src/relationship/state-manager";
import { selectRelationshipStrategy } from "@/src/relationship/strategy-selector";
import { ttsForRelationship } from "@/src/relationship/tts-state-controller";
import { createSessionBoundary, isCasualOpening, isUserCorrection, validateMemoryGrounding, type MemoryGuardResult } from "@/src/memory/grounding";
import { createEmotionPerformancePlan } from "@/src/emotion-performance/emotion-director";
import { validatePerformance } from "@/src/emotion-performance/performance-validator";
import { getSpeakerCapability } from "@/src/tts/speaker-registry";
import type { EmotionPerformancePlan } from "@/src/emotion-performance/types";

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
  sessionId?: string;
  continuePreviousScene?: boolean;
  voiceId?: string;
  sectionId?: string;
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

function fallbackReply(relationship: ReturnType<typeof buildRelationshipSnapshot>, strategy: ReturnType<typeof selectResponseStrategy>, userMessage: string, history: ChatMessage[]) {
  if (isUserCorrection(userMessage)) return history.some((message) => message.role === "assistant") ? "嗯，那是我理解岔了。" : "没有，是我刚才说岔了。";
  if (/^你别生气呀/.test(userMessage.trim())) return "我没生气呀，怎么突然这么说？";
  if (isCasualOpening(userMessage)) return "嗯，在呢。怎么啦？";
  if (relationship.topicMemory.status === "AGREED" && relationship.topicClosure.shouldBlockReopen && !relationship.dailyLifeReentryText) return "行，我记着。";
  return relationship.dailyLifeReentryText || (relationship.currentState === "CONFLICT" ? mockReply(strategy, userMessage, history) : fallbackForRelationshipState(relationship.currentState));
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

function debugForRelationship(relationship: ReturnType<typeof buildRelationshipSnapshot>, classification: ReturnType<typeof classifyUserMessage>, strategy: ReturnType<typeof selectResponseStrategy>, validation: { valid: boolean; issues: string[] }, memory?: MemoryGuardResult): DebugTrace {
  return {
    userStrategy: classification.labels,
    confidence: classification.confidence,
    emotion: relationship.conflictState,
    selectedStrategy: strategy,
    retrievedEpisodeIds: [],
    validator: validation,
    memory: {
      sessionId: relationship.sessionBoundary.sessionId,
      sessionType: relationship.sessionBoundary.sessionType,
      continuePreviousScene: relationship.sessionBoundary.continuePreviousScene,
      activeTopic: relationship.sessionBoundary.activeTopic,
      memoryClaimDetected: memory?.claimDetected ?? false,
      claim: memory?.claim || "",
      evidenceId: memory?.evidenceId,
      evidenceSource: memory?.evidenceSource,
      evidenceConfidence: memory?.evidenceConfidence ?? 0,
      exactQuoteMatch: memory?.exactQuoteMatch ?? true,
      inferenceUsed: memory?.inferenceUsed ?? false,
      userCorrection: memory?.userCorrection ?? false,
      referenceDataUsedAsFact: false,
      issues: memory?.issues || [],
    },
    relationship: {
      currentState: relationship.currentState,
      previousState: relationship.previousState,
      stateConfidence: relationship.stateConfidence,
      stateDuration: relationship.stateDuration,
      conflictLocked: relationship.conflictLocked,
      transitionReason: relationship.transitionReason,
    },
    reflection: relationship.reflection,
    safety: relationship.safetyState,
    repair: {
      detected: relationship.repairBid.detected,
      type: relationship.repairBid.types.join(" + ") || "NONE",
      strength: relationship.repairBid.strength,
      sincerity: relationship.repairBid.sincerityConfidence,
      momentum: relationship.repairMomentum,
      attackMomentum: relationship.attackMomentum,
      userSoftening: relationship.userSoftening,
      rejectionCount: relationship.repairRejectionCount,
      conflictBudget: relationship.conflictBudget,
      conflictPhase: relationship.conflictPhase,
    },
    userState: {
      ...relationship.userState,
      intent: relationship.userState.intent,
      voiceSignals: "UNAVAILABLE",
      visualSignals: "UNAVAILABLE",
    },
    topic: {
      topic: relationship.topicMemory.topic,
      status: relationship.topicMemory.status,
      agreement: relationship.topicMemory.agreement,
      actionOwner: relationship.topicMemory.actionOwner,
      actionDeadline: relationship.topicMemory.actionDeadline,
      newEvidence: relationship.topicMemory.newEvidence,
      repetitionCount: relationship.topicMemory.repetitionCount,
      topicExhaustionScore: relationship.topicMemory.topicExhaustionScore,
      stuckTopic: relationship.topicMemory.stuckTopic,
      reopenAllowed: relationship.topicMemory.reopenAllowed,
      lettingGoReadiness: relationship.lettingGoReadiness,
      topicShiftProbability: relationship.topicShiftProbability,
      dailyLifeReentryStrategy: relationship.dailyLifeReentryStrategy,
      reason: relationship.topicClosure.reason,
    },
  };
}

function validateGeneratedReply(reply: string, relationship: ReturnType<typeof buildRelationshipSnapshot>, history: ChatMessage[], userMessage: string, strategy: ReturnType<typeof selectResponseStrategy>, referenceTexts: string[]) {
  const base = validateResponse(reply, history, strategy.primary);
  const memory = validateMemoryGrounding({ reply, history, currentUserMessage: userMessage, sessionId: relationship.sessionBoundary.sessionId, referenceTexts });
  const reflection = relationship.currentState === "REFLECT" ? validateReflectionResponse(reply) : { valid: true, issues: [] as string[] };
  const repair = relationship.currentState === "REPAIR" ? validateRepairResponse(reply) : { valid: true, issues: [] as string[] };
  const bid = validateRepairBidResponse(reply, relationship);
  const topic = validateTopicLifecycleResponse(reply, relationship);
  return { valid: base.valid && memory.valid && reflection.valid && repair.valid && bid.valid && topic.valid, issues: [...base.issues, ...memory.issues, ...reflection.issues, ...repair.issues, ...bid.issues, ...topic.issues], memory };
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
  const sectionId = body.sectionId || crypto.randomUUID();
  const fullHistory = (body.history || []).slice(-20);
  const history = removeDuplicatedCurrentTurn(fullHistory, userMessage);
  const sessionBoundary = createSessionBoundary({ history, sessionId: body.sessionId, continuePreviousScene: body.continuePreviousScene });
  const classification = classifyUserMessage(userMessage);
  const scene = resolveScene({ scenarioId: body.scenarioId, sceneContext: body.sceneContext });
  const earlySafety = runSafetyGate({ text: userMessage, history });
  if (earlySafety.riskLevel === "HIGH" || earlySafety.riskLevel === "CRITICAL") {
    const safeState = createNeutralBaselineState();
    const relationship = buildRelationshipSnapshot({ history, userMessage, classification, conflictState: safeState, scene, sessionBoundary });
    const safeStrategy = { primary: "softening" as const, secondary: ["validation" as const], rationale: "Safety Override：停止刺激性策略" };
    const safeValidation = { valid: true, issues: [] as string[] };
    const safeVoice = { emotion: "calm" as const, primaryEmotion: "warm", intensity: earlySafety.riskLevel === "CRITICAL" ? 0.18 : 0.24, sectionId, contextText: "语气稳定、清楚、温和，不继续刺激对方。", fallbackUsed: false };
    const debug = debugForRelationship(relationship, classification, safeStrategy, safeValidation);
    return NextResponse.json({ text: safetyResponse({ name: "Ta", riskLevel: earlySafety.riskLevel }), reply: safetyResponse({ name: "Ta", riskLevel: earlySafety.riskLevel }), mode: "safety", voice: safeVoice, ...(debugRequested ? { debug } : {}) }, { headers: corsHeaders() });
  }
  const previousState = history.some((message) => message.role === "user") ? replayUserHistory(history, "Pursuer") : createNeutralBaselineState();
  const state = updateConflictState(previousState, classification.labels, userMessage, "Pursuer");
  const relationship = buildRelationshipSnapshot({ history, userMessage, classification, conflictState: state, scene, sessionBoundary });
  const effectiveState: ConflictState = relationship.currentState === "CONFLICT" && relationship.reentryPenalty > 0
    ? { ...state, conflictIntensity: Math.min(3, state.conflictIntensity) as ConflictState["conflictIntensity"] }
    : state;
  relationship.conflictState = effectiveState;
  const strategy = selectRelationshipStrategy({ snapshot: relationship, labels: classification.labels, archetype: "Pursuer" });
  const voice = relationship.currentState === "CONFLICT" ? voiceCue(strategy, effectiveState) : ttsForRelationship(relationship);
  const speaker = body.voiceId ? getSpeakerCapability(body.voiceId) : undefined;
  const retrieved = relationship.topicClosure.shouldBlockReopen || relationship.stuckTopic
    ? []
    : retrieveSimilarEpisodes({ scene, archetype: "Pursuer", labels: classification.labels, intensity: state.conflictIntensity, currentState: relationship.currentState, intent: relationship.userState.intent, interactionPattern: relationship.reflection.interactionPattern, limit: 3 });
  const characterGender = body.characterGender === "male" ? "male" : "female";
  const characterName = "Ta";
  const referenceTexts = retrieved.map((item) => `${item.episode.id}：${item.episode.turns.slice(0, 6).map((turn) => turn.text).join(" / ")}`);
  const prompt = buildConflictPrompt({ scene, state: effectiveState, classification, strategy, retrieved, history, userMessage, characterGender, characterName, relationship, sessionBoundary, referenceTexts });
  const apiKey = process.env.DEEPSEEK_API_KEY;
  let reply = "";
  let mode: "mock" | "deepseek" | "fallback" | "safety" = "mock";
  let performancePlan: EmotionPerformancePlan | null = null;
  let validation: ReturnType<typeof validateGeneratedReply> = { valid: true, issues: [], memory: validateMemoryGrounding({ reply: "", history, currentUserMessage: userMessage, sessionId: sessionBoundary.sessionId }) };

  try {
    if (!apiKey) {
      reply = fallbackReply(relationship, strategy, userMessage, history);
    } else {
      reply = await callDeepSeek(apiKey, prompt, history, userMessage);
      validation = validateGeneratedReply(reply, relationship, history, userMessage, strategy, referenceTexts);
      if (!validation.valid) {
        const retryPrompt = { ...prompt, systemPrompt: `${prompt.systemPrompt}\n\n上一次草稿不合格。请删除助手式表达，只返回更短、更像当前角色本人说的话。` };
        reply = await callDeepSeek(apiKey, retryPrompt, history, userMessage);
        validation = validateGeneratedReply(reply, relationship, history, userMessage, strategy, referenceTexts);
      }
      mode = "deepseek";
    }
  } catch (error) {
    console.error("conflict chat route error", error);
    reply = fallbackReply(relationship, strategy, userMessage, history);
    mode = "fallback";
    validation = { ...validateResponse(reply, history, strategy.primary), memory: validateMemoryGrounding({ reply, history, currentUserMessage: userMessage, sessionId: sessionBoundary.sessionId, referenceTexts }) };
  }

  const finalValidation = validateGeneratedReply(reply, relationship, history, userMessage, strategy, referenceTexts);
  if (!reply || !finalValidation.valid) {
    reply = fallbackReply(relationship, strategy, userMessage, history);
    mode = mode === "deepseek" ? "fallback" : mode;
    validation = { valid: true, issues: [], memory: validateMemoryGrounding({ reply, history, currentUserMessage: userMessage, sessionId: sessionBoundary.sessionId }) };
  }

  performancePlan = createEmotionPerformancePlan({ relationship, strategy, reply, history, sectionId, speaker });
  const performanceThreshold = effectiveState.conflictIntensity >= 4 ? 75 : 65;
  const performanceCheck = validatePerformance(performancePlan, reply, speaker);
  if (apiKey && mode === "deepseek" && relationship.currentState === "CONFLICT" && effectiveState.conflictIntensity >= 3 && (performancePlan.emotionalPunchScore < performanceThreshold || !performanceCheck.valid)) {
    try {
      const performancePrompt = { ...prompt, systemPrompt: `${prompt.systemPrompt}\n\n【Emotion Performance要求】这句不能写成平淡说明。请让用户听出${performancePlan.primaryEmotion}，使用自然中国情侣口语、短句、反问、停顿或重音；不要心理咨询腔，不要凭空编造事实。情绪表现最低分目标：${performanceThreshold}/100。` };
      reply = await callDeepSeek(apiKey, performancePrompt, history, userMessage);
      validation = validateGeneratedReply(reply, relationship, history, userMessage, strategy, referenceTexts);
      performancePlan = createEmotionPerformancePlan({ relationship, strategy, reply, history, sectionId, speaker });
    } catch (error) {
      console.error("emotion performance retry failed", error);
    }
  }

  const debug = debugForRelationship(relationship, classification, strategy, validation, validation.memory);
  debug.retrievedEpisodeIds = retrieved.map((item) => item.episode.id);
  const finalVoice = performancePlan ? {
    ...voice,
    emotion: performancePlan.apiEmotion as TTSRequest["emotion"],
    primaryEmotion: performancePlan.primaryEmotion,
    emotionScale: performancePlan.emotionScale,
    intensity: performancePlan.intensity / 5,
    speed: undefined,
    volume: undefined,
    speechRate: performancePlan.speechRate,
    loudnessRate: performancePlan.loudnessRate,
    sectionId: performancePlan.sectionId,
    contextText: performancePlan.ttsInstruction,
    fallbackUsed: performancePlan.fallbackUsed,
  } : voice;
  debug.emotionPerformance = performancePlan;
  return NextResponse.json({ text: reply, reply, mode, voice: finalVoice, ...(debugRequested ? { debug } : {}) }, { headers: corsHeaders() });
}

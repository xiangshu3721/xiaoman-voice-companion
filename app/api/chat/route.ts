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
import { analyzeUserSemantic } from "@/src/semantic/user-semantic-analyzer";
import { noveltyReport } from "@/src/realtime/response-novelty";
import { assessASRQuality, conservativelyCorrectTranscript, type ASRQuality, type UserTranscript } from "@/src/asr/transcript";
import { createUserSemanticLedger, criticalSemanticGuard, type UserSemanticLedger } from "@/src/semantic/semantic-grounding";
import { validateCurrentTurnClaims } from "@/src/semantic/response-claim-validator";

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
  userTurnId?: string;
  generationId?: number;
  rawAsrText?: string;
  asrConfidence?: number;
  asrAlternatives?: string[];
  asrSessionCount?: number;
  speechDurationMs?: number;
};

function removeDuplicatedCurrentTurn(history: ChatMessage[], ...userMessages: string[]) {
  const last = history[history.length - 1];
  return last?.role === "user" && userMessages.some((message) => message && last.content.trim() === message.trim()) ? history.slice(0, -1) : history;
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

function noveltySafeReply(userMessage: string, ledger: UserSemanticLedger, relationship: ReturnType<typeof buildRelationshipSnapshot>) {
  if (ledger.negatedIntents.includes("APOLOGY")) return "那你先把你刚才那句说清楚。你到底觉得哪儿没错？";
  if (ledger.apologyEvidence.type === "EXPLICIT") return "我听见你在道歉了。别只说这一句，你具体觉得哪儿伤到我了？";
  if (ledger.explicitIntents.includes("AFFECTION")) return "嗯，我听见了。那你先别只哄我，刚才那件事你想怎么面对？";
  if (/[？?]/.test(userMessage)) return `你问的这个，我不想用一句“没事”糊弄过去。${userMessage.slice(0, 24)}`;
  if (relationship.currentState === "REFLECT") return "你先把这句话说完整，我想听你自己怎么理解刚才那一下。";
  return "我听见你这句了。别绕开刚才那件事，你再说具体一点。";
}

function groundedFallbackReply(ledger: UserSemanticLedger, relationship: ReturnType<typeof buildRelationshipSnapshot>, strategy: ReturnType<typeof selectResponseStrategy>, history: ChatMessage[]) {
  if (ledger.apologyEvidence.type === "EXPLICIT") return "我听见你在道歉了……但我还没缓过来，先让我缓一下。";
  if (ledger.apologyEvidence.type === "PERFUNCTORY" || ledger.apologyEvidence.type === "SARCASTIC") return "你先别急着把这事糊弄过去，我现在还不想接这个话。";
  return fallbackReply(relationship, strategy, ledger.finalText, history);
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

function debugForRelationship(relationship: ReturnType<typeof buildRelationshipSnapshot>, classification: ReturnType<typeof classifyUserMessage>, strategy: ReturnType<typeof selectResponseStrategy>, validation: { valid: boolean; issues: string[] }, memory?: MemoryGuardResult, realtime?: DebugTrace["realtime"], transcript?: UserTranscript, asrQuality?: ASRQuality, ledger?: UserSemanticLedger, claimValidation?: { valid: boolean; claims: string[]; issues: string[]; regenerationCount: number }): DebugTrace {
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
      explicitApology: relationship.repairBid.explicitApology,
      explicitOwnership: relationship.repairBid.explicitOwnership,
      apologyEvidence: relationship.repairBid.apologyEvidence,
    },
    userState: {
      ...relationship.userState,
      intent: relationship.userState.intent,
      voiceSignals: "UNAVAILABLE",
      visualSignals: "UNAVAILABLE",
    },
    realtime,
    transcript: transcript && asrQuality ? {
      rawAsrText: transcript.rawAsrText,
      correctedText: transcript.correctedText,
      finalUserText: transcript.finalUserText,
      confidence: typeof transcript.confidence === "number" ? transcript.confidence : "UNKNOWN",
      alternatives: transcript.alternatives || [],
      uncertainSpans: transcript.uncertainSpans || [],
      corrections: transcript.corrections,
      quality: { score: asrQuality.score, level: asrQuality.level, issues: asrQuality.issues, sessionCount: asrQuality.sessionCount, semanticCriticalAmbiguity: asrQuality.semanticCriticalAmbiguity, possibleDropout: asrQuality.possibleDropout },
    } : undefined,
    semanticGrounding: ledger ? {
      explicitIntents: ledger.explicitIntents,
      inferredIntents: ledger.inferredIntents,
      negatedIntents: ledger.negatedIntents,
      ambiguousIntents: ledger.ambiguousIntents,
      notExpressed: ledger.notExpressed,
      apologyEvidence: ledger.apologyEvidence,
      ownershipEvidence: ledger.ownershipEvidence,
      referenceDataUsedAsFact: false,
    } : undefined,
    claimValidation,
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

function validateGeneratedReply(reply: string, relationship: ReturnType<typeof buildRelationshipSnapshot>, history: ChatMessage[], userMessage: string, strategy: ReturnType<typeof selectResponseStrategy>, referenceTexts: string[], ledger: UserSemanticLedger) {
  const base = validateResponse(reply, history, strategy.primary);
  const memory = validateMemoryGrounding({ reply, history, currentUserMessage: userMessage, sessionId: relationship.sessionBoundary.sessionId, referenceTexts });
  const reflection = relationship.currentState === "REFLECT" ? validateReflectionResponse(reply) : { valid: true, issues: [] as string[] };
  const repair = relationship.currentState === "REPAIR" ? validateRepairResponse(reply) : { valid: true, issues: [] as string[] };
  const bid = validateRepairBidResponse(reply, relationship);
  const topic = validateTopicLifecycleResponse(reply, relationship);
  const claims = validateCurrentTurnClaims(reply, ledger);
  return { valid: base.valid && memory.valid && reflection.valid && repair.valid && bid.valid && topic.valid && claims.valid, issues: [...base.issues, ...memory.issues, ...reflection.issues, ...repair.issues, ...bid.issues, ...topic.issues, ...claims.issues], memory, claims };
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
  const inputMessage = body.userMessage?.trim();
  if (!inputMessage) return NextResponse.json({ error: "请输入你想说的话。" }, { status: 400, headers: corsHeaders() });

  const transcript = conservativelyCorrectTranscript({
    rawAsrText: body.rawAsrText?.trim() || inputMessage,
    confidence: body.asrConfidence,
    alternatives: body.asrAlternatives,
    asrSessionCount: body.asrSessionCount,
    speechDurationMs: body.speechDurationMs,
  });
  const userMessage = transcript.finalUserText || inputMessage;
  const asrQuality = assessASRQuality(transcript);

  const debugRequested = body.debug === true || new URL(request.url).searchParams.get("debug") === "true";
  const sectionId = body.sectionId || crypto.randomUUID();
  const fullHistory = (body.history || []).slice(-20);
  const history = removeDuplicatedCurrentTurn(fullHistory, inputMessage, transcript.rawAsrText, userMessage);
  const sessionBoundary = createSessionBoundary({ history, sessionId: body.sessionId, continuePreviousScene: body.continuePreviousScene });
  const classification = classifyUserMessage(userMessage);
  const userSemantic = analyzeUserSemantic(userMessage);
  const semanticLedger = createUserSemanticLedger({ rawText: transcript.rawAsrText, correctedText: transcript.correctedText, finalText: userMessage, analysis: userSemantic, confidence: transcript.confidence });
  const criticalGuard = criticalSemanticGuard(semanticLedger);
  const scene = resolveScene({ scenarioId: body.scenarioId, sceneContext: body.sceneContext });
  const earlySafety = runSafetyGate({ text: userMessage, history });
  if (earlySafety.riskLevel === "HIGH" || earlySafety.riskLevel === "CRITICAL") {
    const safeState = createNeutralBaselineState();
    const relationship = buildRelationshipSnapshot({ history, userMessage, classification, conflictState: safeState, scene, sessionBoundary });
    const safeStrategy = { primary: "softening" as const, secondary: ["validation" as const], rationale: "Safety Override：停止刺激性策略" };
    const safeValidation = { valid: true, issues: [] as string[] };
    const safeVoice = { emotion: "calm" as const, primaryEmotion: "warm", intensity: earlySafety.riskLevel === "CRITICAL" ? 0.18 : 0.24, sectionId, contextText: "语气稳定、清楚、温和，不继续刺激对方。", fallbackUsed: false };
    const debug = debugForRelationship(relationship, classification, safeStrategy, safeValidation, undefined, undefined, transcript, asrQuality, semanticLedger);
    return NextResponse.json({ text: safetyResponse({ name: "Ta", riskLevel: earlySafety.riskLevel }), reply: safetyResponse({ name: "Ta", riskLevel: earlySafety.riskLevel }), mode: "safety", voice: safeVoice, ...(debugRequested ? { debug } : {}) }, { headers: corsHeaders() });
  }
  const criticalConfidenceRisk = asrQuality.semanticCriticalAmbiguity && (asrQuality.confidence === "UNKNOWN" || asrQuality.confidence < 0.85);
  if (asrQuality.level === "LOW" || criticalConfidenceRisk || (!criticalGuard.valid && asrQuality.semanticCriticalAmbiguity)) {
    const clarification = "等等，你刚才后半句我没听清。你再说一遍，好吗？";
    const safeState = createNeutralBaselineState();
    const relationship = buildRelationshipSnapshot({ history, userMessage, classification, conflictState: safeState, scene, sessionBoundary });
    const safeStrategy = { primary: "validation" as const, secondary: [], rationale: "ASR Quality Guard：不对低质量语音做语义猜测" };
    const safeValidation = { valid: true, issues: ["ASR_QUALITY_GUARD"] };
    const debug = debugForRelationship(relationship, classification, safeStrategy, safeValidation, undefined, undefined, transcript, asrQuality, semanticLedger, { valid: true, claims: [], issues: [], regenerationCount: 0 });
    return NextResponse.json({ text: clarification, reply: clarification, mode: "fallback", voice: { emotion: "calm", intensity: 0.25, sectionId }, ...(debugRequested ? { debug } : {}) }, { headers: corsHeaders() });
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
  const prompt = buildConflictPrompt({ scene, state: effectiveState, classification, strategy, retrieved, history, userMessage, characterGender, characterName, relationship, sessionBoundary, referenceTexts, transcript, asrQuality, semanticLedger });
  const apiKey = process.env.DEEPSEEK_API_KEY;
  let reply = "";
  let mode: "mock" | "deepseek" | "fallback" | "safety" = "mock";
  let performancePlan: EmotionPerformancePlan | null = null;
  let validation: ReturnType<typeof validateGeneratedReply> = { valid: true, issues: [], memory: validateMemoryGrounding({ reply: "", history, currentUserMessage: userMessage, sessionId: sessionBoundary.sessionId }), claims: { valid: true, claims: [], issues: [] } };
  let claimRegenerationCount = 0;

  try {
    if (!apiKey) {
      reply = fallbackReply(relationship, strategy, userMessage, history);
    } else {
      reply = await callDeepSeek(apiKey, prompt, history, userMessage);
      validation = validateGeneratedReply(reply, relationship, history, userMessage, strategy, referenceTexts, semanticLedger);
      if (!validation.valid) {
        claimRegenerationCount += 1;
        const retryPrompt = { ...prompt, systemPrompt: `${prompt.systemPrompt}\n\n上一次草稿不合格：${validation.issues.join(", ")}。请删除未被当前轮证据支持的用户事实，只返回更短、更像当前角色本人说的话。` };
        reply = await callDeepSeek(apiKey, retryPrompt, history, userMessage);
        validation = validateGeneratedReply(reply, relationship, history, userMessage, strategy, referenceTexts, semanticLedger);
      }
      mode = "deepseek";
    }
  } catch (error) {
    console.error("conflict chat route error", error);
    reply = groundedFallbackReply(semanticLedger, relationship, strategy, history);
    mode = "fallback";
    validation = { ...validateGeneratedReply(reply, relationship, history, userMessage, strategy, referenceTexts, semanticLedger), memory: validateMemoryGrounding({ reply, history, currentUserMessage: userMessage, sessionId: sessionBoundary.sessionId, referenceTexts }) };
  }

  const finalValidation = validateGeneratedReply(reply, relationship, history, userMessage, strategy, referenceTexts, semanticLedger);
  if (!reply || !finalValidation.valid) {
    reply = groundedFallbackReply(semanticLedger, relationship, strategy, history);
    mode = mode === "deepseek" ? "fallback" : mode;
    validation = validateGeneratedReply(reply, relationship, history, userMessage, strategy, referenceTexts, semanticLedger);
  }

  let novelty = noveltyReport(reply, history, userMessage, userSemantic);
  if (apiKey && mode === "deepseek" && (novelty.semanticDuplicateScore >= 0.78 || !novelty.addressesLatestDelta)) {
    try {
      const noveltyPrompt = { ...prompt, systemPrompt: `${prompt.systemPrompt}\n\n【本轮去重与最新意图】上一轮回复不能复用。必须直接回应用户本轮最新一句的具体词或明确意图：${userMessage}。不要再用“行，我记着/好，我记住了”这类承接。请换一种对话动作，只输出角色台词。` };
      const alternative = await callDeepSeek(apiKey, noveltyPrompt, history, userMessage);
      const alternativeValidation = validateGeneratedReply(alternative, relationship, history, userMessage, strategy, referenceTexts, semanticLedger);
      const alternativeNovelty = noveltyReport(alternative, history, userMessage, userSemantic);
      if (alternativeValidation.valid && alternativeNovelty.semanticDuplicateScore < novelty.semanticDuplicateScore && alternativeNovelty.addressesLatestDelta) {
        reply = alternative;
        validation = alternativeValidation;
        novelty = alternativeNovelty;
      }
    } catch (error) {
      console.error("response novelty retry failed", error);
    }
  }

  performancePlan = createEmotionPerformancePlan({ relationship, strategy, reply, history, sectionId, speaker });
  const performanceThreshold = effectiveState.conflictIntensity >= 4 ? 75 : 65;
  const performanceCheck = validatePerformance(performancePlan, reply, speaker);
  if (apiKey && mode === "deepseek" && relationship.currentState === "CONFLICT" && effectiveState.conflictIntensity >= 3 && (performancePlan.emotionalPunchScore < performanceThreshold || !performanceCheck.valid)) {
    try {
      const performancePrompt = { ...prompt, systemPrompt: `${prompt.systemPrompt}\n\n【Emotion Performance要求】这句不能写成平淡说明。请让用户听出${performancePlan.primaryEmotion}，使用自然中国情侣口语、短句、反问、停顿或重音；不要心理咨询腔，不要凭空编造事实。情绪表现最低分目标：${performanceThreshold}/100。` };
      const performanceCandidate = await callDeepSeek(apiKey, performancePrompt, history, userMessage);
      const performanceValidation = validateGeneratedReply(performanceCandidate, relationship, history, userMessage, strategy, referenceTexts, semanticLedger);
      if (performanceValidation.valid) {
        reply = performanceCandidate;
        validation = performanceValidation;
        performancePlan = createEmotionPerformancePlan({ relationship, strategy, reply, history, sectionId, speaker });
      }
    } catch (error) {
      console.error("emotion performance retry failed", error);
    }
  }

  novelty = noveltyReport(reply, history, userMessage, userSemantic);
  if (novelty.semanticDuplicateScore >= 0.92 || !novelty.addressesLatestDelta) {
    reply = noveltySafeReply(userMessage, semanticLedger, relationship);
    mode = mode === "deepseek" ? "fallback" : mode;
    validation = validateGeneratedReply(reply, relationship, history, userMessage, strategy, referenceTexts, semanticLedger);
    novelty = noveltyReport(reply, history, userMessage, userSemantic);
  }
  const debug = debugForRelationship(relationship, classification, strategy, validation, validation.memory, {
    userTurnId: body.userTurnId,
    generationId: body.generationId,
    latestUserDelta: userMessage,
    explicitIntents: userSemantic.explicitIntents,
    inferredIntents: userSemantic.inferredIntents,
    negatedIntents: userSemantic.negatedIntents,
    ambiguousIntents: userSemantic.ambiguousIntents,
    apologyEvidence: semanticLedger.apologyEvidence.detected && semanticLedger.apologyEvidence.type === "EXPLICIT",
    semanticDuplicateScore: novelty.semanticDuplicateScore,
    responseNoveltyScore: novelty.responseNoveltyScore,
    addressesLatestDelta: novelty.addressesLatestDelta,
    dialogueAct: novelty.dialogueAct,
  }, transcript, asrQuality, semanticLedger, { valid: validation.claims.valid, claims: validation.claims.claims, issues: validation.claims.issues, regenerationCount: claimRegenerationCount });
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

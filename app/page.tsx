"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  BrowserSpeechRecognitionProvider,
  DoubaoTTSProvider,
  SCENARIOS,
  TTS_VOICE_STORAGE_KEY,
  type ChatMessage,
  type ScenarioId,
  type TTSMetrics,
  type TTSPlaybackState,
  type TTSRequest,
  type ASRSessionEvent,
} from "@/lib/providers";
import { apiUrl, sitePath } from "@/lib/api";
import { fetchWithTimeout } from "@/src/network/fetch-with-timeout";
import { readChatArchives, upsertChatArchive, type ChatArchive } from "@/lib/chat-history";
import type { EmotionPerformancePlan } from "@/src/emotion-performance/types";
import { AdaptiveVadMonitor } from "@/src/realtime/adaptive-vad";
import { detectEndOfTurn, semanticCompleteness } from "@/src/realtime/end-of-turn";
import { TranscriptAccumulator } from "@/src/realtime/transcript-accumulator";
import type { MicHealth, RealtimeConversationState } from "@/src/realtime/types";
import { MicrophonePermissionManager } from "@/src/realtime/microphone-permission";
import { AudioSessionManager } from "@/src/realtime/audio-session-manager";
import { VoiceDeliveryPipeline } from "@/src/voice/voice-delivery-pipeline";
import { AssistantTurnCoordinator, type AssistantTurnState, type AssistantTurnTrace } from "@/src/voice/assistant-turn-coordinator";
import type { VoiceJob } from "@/src/voice/voice-delivery-pipeline";
import { mobileBootTrace } from "@/src/boot/mobile-boot-trace";
import { VOICE_FEATURES } from "@/src/voice/feature-flags";

type Status = "idle" | "listening" | "thinking" | "preparing" | "speaking";
type MicrophoneState = "unknown" | "requesting" | "granted" | "denied" | "unavailable" | "error";
type CharacterGender = "female" | "male";
type RecoveryReason = "PLAYBACK_ENDED" | "PLAYBACK_FAILED" | "PLAYBACK_INTERRUPTED" | "ASR_RECOVERY" | "MANUAL_RETRY" | "TEXT_FAILED";

type DebugInfo = {
  userStrategy: string[];
  confidence: number;
  emotion: { anger: number; hurt: number; disappointment: number; anxiety: number; contempt: number; trust: number; resentment: number; connection: number; conflictIntensity: number };
  selectedStrategy: { primary: string; secondary: string[]; rationale: string };
  retrievedEpisodeIds: string[];
  validator: { valid: boolean; issues: string[] };
  emotionPerformance?: EmotionPerformancePlan;
  memory?: { sessionId: string; sessionType: string; continuePreviousScene: boolean; activeTopic: string; memoryClaimDetected: boolean; claim: string; evidenceId?: string; evidenceSource?: string; evidenceConfidence: number; exactQuoteMatch: boolean; inferenceUsed: boolean; userCorrection: boolean; referenceDataUsedAsFact: false; issues: string[] };
  relationship?: { currentState: string; previousState: string; stateConfidence: number; stateDuration: number; conflictLocked: boolean; transitionReason: string };
  reflection?: { insightDepth: 0 | 1 | 2 | 3; mutualUnderstanding: number; surfaceConflict?: string; triggerIdentified?: string; underlyingNeed?: string; userContribution?: string; characterContribution?: string; interactionPattern?: string };
  safety?: { active: boolean; riskLevel: string; signals: string[]; confidence: number };
  repair?: { detected: boolean; type: string; strength: number; sincerity: number; momentum: number; attackMomentum: number; userSoftening: number; rejectionCount: number; conflictBudget: number; conflictPhase: string; explicitApology?: boolean; explicitOwnership?: boolean; apologyEvidence?: { type: string; evidenceText?: string } };
  topic?: { topic: string; status: string; agreement?: string; actionOwner?: string; actionDeadline?: string; newEvidence: boolean; repetitionCount: number; topicExhaustionScore: number; stuckTopic: boolean; reopenAllowed: boolean; lettingGoReadiness: number; topicShiftProbability: number; dailyLifeReentryStrategy?: string; reason: string };
  userState?: { anger: number; hurt: number; sadness: number; anxiety: number; aggression: number; withdrawal: number; openness: number; distress: number; intent: string[]; trend: string; voiceSignals: string; visualSignals: string };
  realtime?: { userTurnId?: string; generationId?: number; latestUserDelta: string; explicitIntents: string[]; inferredIntents: string[]; negatedIntents: string[]; ambiguousIntents?: string[]; apologyEvidence: boolean; semanticDuplicateScore: number; responseNoveltyScore: number; addressesLatestDelta: boolean; dialogueAct: string };
  transcript?: { rawAsrText: string; correctedText: string; finalUserText: string; confidence: number | "UNKNOWN"; alternatives: string[]; uncertainSpans: Array<{ text: string; reason: string; confidence?: number }>; corrections: Array<{ original: string; corrected: string; type: string; confidence: number; semanticRisk: string }>; quality: { score: number; level: string; issues: string[]; sessionCount: number; semanticCriticalAmbiguity: boolean; possibleDropout: boolean } };
  semanticGrounding?: { explicitIntents: string[]; inferredIntents: string[]; negatedIntents: string[]; ambiguousIntents: string[]; notExpressed: string[]; apologyEvidence: { detected: boolean; type: string; evidenceText?: string; source: string; confidence: number }; ownershipEvidence: boolean; referenceDataUsedAsFact: false };
  claimValidation?: { valid: boolean; claims: string[]; issues: string[]; regenerationCount: number };
};

type VoiceOption = { id: string; name: string; gender?: "female" | "male" };
type ReviewEmotion = { label: string; level: number; evidence: string };
type EmotionReview = { title: string; summary: string; emotions: ReviewEmotion[]; needs: string[]; suggestions: string[]; nextPrompt: string };
type ReviewTurn = { role: "user" | "assistant"; content: string };
const STATUS_COPY: Record<Status, string> = {
  idle: "准备好了",
  listening: "正在听你说……",
  thinking: "小满正在想……",
  preparing: "小满正准备开口……",
  speaking: "小满正在说……",
};

const WELCOME: ChatMessage = {
  role: "assistant",
  content: "你来了。今天想跟我说什么？",
};

function Avatar({ small = false, gender = "female" }: { small?: boolean; gender?: CharacterGender }) {
  const avatarName = gender === "male" ? "ta-male" : "ta-female";
  const source = sitePath(`/avatars/${avatarName}-${small ? "96" : "416"}.jpg`);
  const fallback = sitePath(`/avatars/${avatarName}-416.jpg`);
  const srcSet = [96, 416].map((size) => `${sitePath(`/avatars/${avatarName}-${size}.jpg`)} ${size}w`).join(", ");
  const label = gender === "male" ? "Ta 的男声头像" : "Ta 的女声头像";
  return (
    <div className={`relative shrink-0 overflow-hidden rounded-full bg-[#211e1d] ${small ? "h-11 w-11" : "h-44 w-44 sm:h-52 sm:w-52"}`} aria-label={label}>
      <img src={source} srcSet={srcSet} sizes={small ? "44px" : "(min-width: 640px) 208px, 176px"} alt="" className="h-full w-full object-cover object-center" width={small ? 44 : 208} height={small ? 44 : 208} loading={small ? "lazy" : "eager"} fetchPriority={small ? "low" : "high"} decoding="async" onError={(event) => { if (event.currentTarget.src !== fallback) event.currentTarget.src = fallback; }} />
      <div className="pointer-events-none absolute inset-0 rounded-full ring-1 ring-white/10" />
    </div>
  );
}

function newSectionId() {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `section-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function Wave() {
  return <div className="wave flex h-8 items-center justify-center gap-1" aria-hidden="true"><span /><span /><span /><span /><span /></div>;
}

function RepairDebug({ debugInfo }: { debugInfo: DebugInfo | null }) {
  if (!debugInfo?.repair) return null;
  const repair = debugInfo.repair;
  return <details open className="mt-4 w-full max-w-xl rounded-2xl border border-white/10 bg-[#1b1818] p-4 text-xs text-[#b7adab]"><summary className="cursor-pointer text-[#e98972]">Repair Bid Debug</summary><div className="mt-3 grid gap-2 sm:grid-cols-2"><p>Repair Bid：{repair.detected ? "yes" : "no"}</p><p>Repair Type：{repair.type}</p><p>Explicit Apology：{repair.explicitApology ? "yes" : "no"}</p><p>Explicit Ownership：{repair.explicitOwnership ? "yes" : "no"}</p><p>Apology Evidence：{repair.apologyEvidence?.type || "NONE"}</p><p>Repair Strength：{repair.strength.toFixed(2)}</p><p>Sincerity：{repair.sincerity.toFixed(2)}</p><p>Repair Momentum：{repair.momentum}</p><p>Attack Momentum：{repair.attackMomentum}</p><p>User Softening：{repair.userSoftening}</p><p>Repair Rejections：{repair.rejectionCount}</p><p>Conflict Budget：{repair.conflictBudget}</p><p>Conflict Phase：{repair.conflictPhase}</p></div></details>;
}

function PerformanceDebug({ plan }: { plan: EmotionPerformancePlan | null }) {
  if (!plan) return null;
  return <details open className="mt-4 w-full max-w-xl rounded-2xl border border-white/10 bg-[#1b1818] p-4 text-xs text-[#b7adab]"><summary className="cursor-pointer text-[#e98972]">Emotion Performance Debug</summary><div className="mt-3 grid gap-2 sm:grid-cols-2"><p>Primary Emotion：{plan.primaryEmotion}</p><p>Internal Intensity：{plan.intensity}/5</p><p>API Emotion：{plan.apiEmotion || "omitted"}</p><p>Emotion Scale：{plan.emotionScale ?? "-"}</p><p>Arousal：{plan.arousal}</p><p>Valence：{plan.valence}</p><p>Speech Rate：{plan.delivery.pace}</p><p>Loudness：{plan.delivery.loudness}</p><p>Section ID：{plan.sectionId}</p><p>Punch Score：{plan.emotionalPunchScore}/100</p><p>Profanity Level：{plan.profanityLevel}</p><p>Fallback Used：{plan.fallbackUsed ? "yes" : "no"}</p><p className="sm:col-span-2">Context：{plan.ttsInstruction}</p></div></details>;
}

function VoiceSelector({ voices, selectedVoiceId, onChange }: { voices: VoiceOption[]; selectedVoiceId: string; onChange: (voiceId: string) => void }) {
  const selectedVoice = voices.find((voice) => voice.id === selectedVoiceId) || voices[0];
  if (!selectedVoice) return null;
  return (
    <div className="mt-5 rounded-2xl border border-white/10 bg-[#1b1818] p-4 text-left">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><p className="text-xs tracking-[0.12em] text-[#9f9795]">Ta 的声音 · {selectedVoice.gender === "male" ? "男版" : "女版"}</p><p className="mt-1 text-sm text-[#f4efeb]">Ta · {selectedVoice.name}</p></div>
        <a href={sitePath("/voice-lab")} className="text-xs text-[#f6a08b] underline decoration-[#f6a08b]/30 underline-offset-4">试听更多音色</a>
      </div>
      <select value={selectedVoiceId || selectedVoice.id} onChange={(event) => onChange(event.target.value)} className="mt-3 w-full rounded-xl border border-white/10 bg-[#141313] px-3 py-3 text-sm text-[#f4efeb] outline-none transition focus:border-[#e98972]">
        {voices.map((voice) => <option key={voice.id} value={voice.id}>{voice.gender === "male" ? "男声 · " : "女声 · "}{voice.name}</option>)}
      </select>
      <p className="mt-2 text-[11px] leading-5 text-[#746c6a]">切换后，头像、昵称和下一次回复会同步使用这个角色。</p>
    </div>
  );
}

function formatArchiveDate(value: string) {
  try {
    return new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
  } catch {
    return "刚刚";
  }
}

function ChatHistoryPanel({ archives, selectedArchiveId, onSelect, onBack, onClose, gender }: { archives: ChatArchive[]; selectedArchiveId: string | null; onSelect: (id: string) => void; onBack: () => void; onClose: () => void; gender: CharacterGender }) {
  const selectedArchive = archives.find((archive) => archive.id === selectedArchiveId);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-3 sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label="历史聊天记录">
      <section className="flex max-h-[88dvh] w-full max-w-xl flex-col overflow-hidden rounded-[1.5rem] border border-white/10 bg-[#1b1818] shadow-2xl shadow-black/40">
        <header className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div><p className="text-[10px] tracking-[0.16em] text-[#e98972]">LOCAL / ARCHIVE</p><h2 className="mt-1 text-lg font-medium text-[#f4efeb]">历史聊天记录</h2></div>
          <button type="button" onClick={onClose} className="rounded-full px-2 py-1 text-xl leading-none text-[#817876] transition hover:bg-white/5 hover:text-[#f4efeb]" aria-label="关闭历史聊天记录">×</button>
        </header>
        {selectedArchive ? <>
          <div className="flex items-center gap-3 border-b border-white/10 px-5 py-3"><button type="button" onClick={onBack} className="text-xs text-[#f6a08b]">← 返回记录</button><span className="text-xs text-[#817876]">{formatArchiveDate(selectedArchive.updatedAt)}</span></div>
          <div className="overflow-y-auto px-5 py-4"><h3 className="text-base leading-6 text-[#f4efeb]">{selectedArchive.title}</h3><p className="mt-1 text-xs text-[#817876]">{Math.floor(selectedArchive.messages.filter((message) => message.role === "user").length)} 轮对话</p><div className="mt-5 space-y-3">{selectedArchive.messages.map((message, index) => <div key={`${message.role}-${index}`} className={`flex items-start gap-3 ${message.role === "user" ? "justify-end" : "justify-start"}`}>{message.role === "assistant" && <Avatar small gender={gender} />}<div className={`max-w-[82%] rounded-2xl px-4 py-3 text-sm leading-6 ${message.role === "user" ? "rounded-br-md bg-[#e98972] text-[#241615]" : "rounded-bl-md bg-[#211e1d] text-[#ded4d1]"}`}><span className="mb-1 block text-[10px] tracking-[0.12em] opacity-50">{message.role === "user" ? "我" : "Ta"}</span>{message.content}</div></div>)}</div></div>
        </> : <div className="overflow-y-auto px-5 py-4">{archives.length === 0 ? <div className="py-12 text-center"><p className="text-sm text-[#c7bdb9]">还没有历史记录</p><p className="mt-2 text-xs leading-5 text-[#817876]">完成一轮对话后，会自动保存在这台设备的浏览器里。</p></div> : <div className="space-y-2">{archives.map((archive) => <button key={archive.id} type="button" onClick={() => onSelect(archive.id)} className="w-full rounded-2xl border border-white/10 bg-[#211e1d] px-4 py-3 text-left transition hover:border-[#e98972]/50"><div className="flex items-center justify-between gap-3"><span className="line-clamp-2 text-sm leading-6 text-[#f4efeb]">{archive.title}</span><span className="shrink-0 text-[10px] text-[#817876]">{formatArchiveDate(archive.updatedAt)}</span></div><p className="mt-1 text-xs text-[#817876]">{archive.messages.filter((message) => message.role === "user").length} 轮 · 点击查看</p></button>)}</div>}<p className="mt-5 text-center text-[10px] leading-5 text-[#756d6b]">记录只保存在本机浏览器，不会自动上传。</p></div>}
      </section>
    </div>
  );
}

function EmotionReviewPanel({ review, turns, question, loading, error, onQuestionChange, onContinue, onRetry, onClose }: { review: EmotionReview | null; turns: ReviewTurn[]; question: string; loading: boolean; error: string; onQuestionChange: (value: string) => void; onContinue: () => void; onRetry: () => void; onClose: () => void }) {
  return (
    <section className="mt-4 w-full rounded-[1.35rem] border border-[#e98972]/25 bg-[#1b1818] p-4 text-left shadow-2xl shadow-black/10 sm:p-5" aria-label="情绪复盘">
      <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-4">
        <div><p className="text-[10px] tracking-[0.16em] text-[#e98972]">AI / 当前这一轮</p><h2 className="mt-2 text-lg font-medium text-[#f4efeb]">情绪复盘</h2></div>
        <button type="button" onClick={onClose} className="rounded-full px-2 py-1 text-xl leading-none text-[#817876] transition hover:bg-white/5 hover:text-[#f4efeb]" aria-label="关闭情绪复盘">×</button>
      </div>
      {loading && !review && <div className="space-y-3 py-5" aria-live="polite"><div className="h-5 w-3/4 animate-pulse rounded bg-white/10" /><div className="h-12 animate-pulse rounded bg-white/5" /><div className="grid grid-cols-3 gap-2"><div className="h-16 animate-pulse rounded-xl bg-white/5" /><div className="h-16 animate-pulse rounded-xl bg-white/5" /><div className="h-16 animate-pulse rounded-xl bg-white/5" /></div><p className="text-xs text-[#9f9795]">小满正在把这一轮对话拆开看看……</p></div>}
      {error && !review && <div className="py-5"><p className="text-sm leading-6 text-[#f6a08b]">{error}</p><button type="button" onClick={onRetry} className="mt-3 rounded-full border border-[#e98972]/40 px-4 py-2 text-xs text-[#f6a08b] transition hover:bg-[#e98972]/10">再试一次</button></div>}
      {review && <>
        <div className="grid grid-cols-2 gap-2 border-b border-white/10 py-4 sm:grid-cols-4">{["梳理事件经过", "识别情绪类型", "看见真实需求", "给出可行建议"].map((item) => <div key={item} className="flex items-center gap-2 rounded-lg bg-white/5 px-2 py-2 text-[11px] text-[#c7bdb9]"><span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#4caf68] text-[10px] text-[#141313]">✓</span>{item}</div>)}</div>
        <div className="py-5"><h3 className="text-base font-medium leading-7 text-[#f4efeb]">{review.title}</h3><p className="mt-2 text-sm leading-6 text-[#b7adab]">{review.summary}</p></div>
        <div><p className="text-xs tracking-[0.12em] text-[#817876]">我在这一轮里听见了</p><div className="mt-3 grid gap-2 sm:grid-cols-3">{review.emotions.map((emotion) => <div key={`${emotion.label}-${emotion.evidence}`} className="rounded-xl border border-white/10 bg-[#211e1d] p-3"><div className="flex items-center justify-between gap-2"><span className="text-sm text-[#f4efeb]">{emotion.label}</span><span className="text-[10px] text-[#e98972]">{emotion.level}%</span></div><div className="mt-2 h-1 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-[#e98972] transition-all" style={{ width: `${emotion.level}%` }} /></div><p className="mt-2 text-[11px] leading-5 text-[#948a87]">{emotion.evidence}</p></div>)}</div></div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2"><div><p className="text-xs tracking-[0.12em] text-[#817876]">可能真正想要</p><ul className="mt-2 space-y-2">{review.needs.map((need) => <li key={need} className="flex gap-2 text-sm leading-6 text-[#d6cbc8]"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#e98972]" />{need}</li>)}</ul></div><div><p className="text-xs tracking-[0.12em] text-[#817876]">下一步可以试试</p><ul className="mt-2 space-y-2">{review.suggestions.map((suggestion) => <li key={suggestion} className="flex gap-2 text-sm leading-6 text-[#d6cbc8]"><span className="mt-1 text-[#e98972]">↳</span>{suggestion}</li>)}</ul></div></div>
        <p className="mt-5 rounded-xl bg-[#e98972]/10 px-3 py-3 text-sm leading-6 text-[#f2c0b2]">{review.nextPrompt}</p>
        {turns.length > 0 && <div className="mt-4 space-y-2 border-t border-white/10 pt-4">{turns.map((turn, index) => <div key={`${turn.role}-${index}`} className={`rounded-xl px-3 py-2 text-sm leading-6 ${turn.role === "user" ? "bg-[#e98972]/10 text-[#f2c0b2]" : "bg-white/5 text-[#c7bdb9]"}`}><span className="mr-2 text-[10px] tracking-[0.1em] text-[#817876]">{turn.role === "user" ? "你问" : "复盘"}</span>{turn.content}</div>)}</div>}
        <div className="mt-4 flex flex-col gap-2 sm:flex-row"><textarea value={question} onChange={(event) => onQuestionChange(event.target.value)} rows={2} placeholder="还想继续看看什么？例如：我到底在怕什么？" className="min-h-12 flex-1 resize-none rounded-xl border border-white/10 bg-[#141313] px-3 py-3 text-sm leading-6 text-[#f4efeb] outline-none placeholder:text-[#756d6b] focus:border-[#e98972]/60" /><button type="button" onClick={onContinue} disabled={loading || !question.trim()} className="rounded-xl bg-[#e98972] px-4 py-3 text-sm font-medium text-[#241615] transition hover:bg-[#f6a08b] disabled:cursor-not-allowed disabled:opacity-40">{loading ? "分析中" : "继续复盘"}</button></div>
        {error && <p className="mt-3 rounded-lg bg-[#e98972]/10 px-3 py-2 text-xs leading-5 text-[#f6a08b]">{error}</p>}
        <p className="mt-3 text-[10px] leading-5 text-[#756d6b]">只根据这次页面里的对话分析，不是心理诊断。你可以随时关闭。</p>
      </>}
    </section>
  );
}

export default function Home() {
  const [started, setStarted] = useState(false);
  const [scenarioId, setScenarioId] = useState<ScenarioId>("late-home");
  const [status, setStatus] = useState<Status>("idle");
  const [assistantTurnState, setAssistantTurnState] = useState<AssistantTurnState>("IDLE");
  const [assistantTurnTrace, setAssistantTurnTrace] = useState<AssistantTurnTrace | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME]);
  const [notice, setNotice] = useState("");
  const [interimText, setInterimText] = useState("");
  const [voiceInputSupported, setVoiceInputSupported] = useState(true);
  const [microphoneState, setMicrophoneState] = useState<MicrophoneState>("unknown");
  const [textDraft, setTextDraft] = useState("");
  const [conversationActive, setConversationActive] = useState(false);
  const [debugEnabled, setDebugEnabled] = useState(false);
  const [debugInfo, setDebugInfo] = useState<DebugInfo | null>(null);
  const [ttsDebug, setTtsDebug] = useState<TTSMetrics | null>(null);
  const [ttsPlaybackState, setTtsPlaybackState] = useState<TTSPlaybackState>("IDLE");
  const [selectedVoiceId, setSelectedVoiceId] = useState("");
  const [voiceOptions, setVoiceOptions] = useState<VoiceOption[]>([]);
  const [mode, setMode] = useState<"mock" | "deepseek" | "fallback" | "safety" | "">("");
  const [reviewOpen, setReviewOpen] = useState(false);
  const [review, setReview] = useState<EmotionReview | null>(null);
  const [reviewTurns, setReviewTurns] = useState<ReviewTurn[]>([]);
  const [reviewQuestion, setReviewQuestion] = useState("");
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewError, setReviewError] = useState("");
  const [archives, setArchives] = useState<ChatArchive[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [selectedArchiveId, setSelectedArchiveId] = useState<string | null>(null);
  const [realtimeState, setRealtimeState] = useState<RealtimeConversationState>("IDLE");
  const [, setListeningReady] = useState(false);
  const [micHealth, setMicHealth] = useState<MicHealth>({ permissionGranted: false, trackState: "none", trackMuted: false, audioContextState: "unknown", vadAlive: false, asrAlive: false, lastVoiceActivityAt: null, lastAsrResultAt: null, noiseFloor: 0, vadThreshold: 0 });
  const [endOfTurnConfidence, setEndOfTurnConfidence] = useState(0);
  const [asrRestartCount, setAsrRestartCount] = useState(0);
  const [asrSessionInfo, setAsrSessionInfo] = useState<ASRSessionEvent | null>(null);
  const [latestSpokenText, setLatestSpokenText] = useState("");
  const historyRef = useRef<ChatMessage[]>([WELCOME]);
  const archiveIdRef = useRef(`conversation-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`);
  const sectionIdRef = useRef(newSectionId());
  const conversationActiveRef = useRef(false);
  const asrRef = useRef(new BrowserSpeechRecognitionProvider());
  const ttsProviderRef = useRef(new DoubaoTTSProvider());
  const voicePipelineRef = useRef(new VoiceDeliveryPipeline(ttsProviderRef.current));
  const assistantTurnCoordinatorRef = useRef(new AssistantTurnCoordinator(voicePipelineRef.current));
  const microphoneRef = useRef(new MicrophonePermissionManager());
  const audioSessionRef = useRef(new AudioSessionManager());
  const streamRef = useRef<MediaStream | null>(null);
  const vadRef = useRef(new AdaptiveVadMonitor());
  const accumulatorRef = useRef(new TranscriptAccumulator());
  const endTimerRef = useRef<number | null>(null);
  const utteranceStartRef = useRef<number | null>(null);
  const lastVoiceAtRef = useRef<number | null>(null);
  const lastAsrResultAtRef = useRef<number | null>(null);
  const lastFinalAtRef = useRef<number | null>(null);
  const asrSpeechActiveRef = useRef(false);
  const asrReadyTimerRef = useRef<number | null>(null);
  const listeningReadyRef = useRef(false);
  const asrGenerationRef = useRef(0);
  const asrStallTimerRef = useRef<number | null>(null);
  const asrRecoveryTimerRef = useRef<number | null>(null);
  const resumeListeningTimerRef = useRef<number | null>(null);
  const listeningGenerationRef = useRef(0);
  const finalizeGenerationRef = useRef(0);
  const interruptModeRef = useRef(false);
  const generationRef = useRef(0);
  const processedTurnIdsRef = useRef(new Set<string>());
  const spokenTextRef = useRef("");
  const vadStreamRef = useRef<MediaStream | null>(null);
  const voiceSessionEnabledRef = useRef(false);
  const assistantTurnStateRef = useRef<AssistantTurnState>("IDLE");
  const ttsPlaybackStateRef = useRef<TTSPlaybackState>("IDLE");

  const markListeningReady = (value: boolean) => {
    listeningReadyRef.current = value;
    setListeningReady(value);
  };

  const clearAsrReadyWatchdog = (reason: string) => {
    if (asrReadyTimerRef.current === null) return;
    window.clearTimeout(asrReadyTimerRef.current);
    asrReadyTimerRef.current = null;
    console.debug(`[VOICE] ASR_WATCHDOG_CLEARED reason=${reason}`);
  };

  const markTtsPlaybackState = (state: TTSPlaybackState) => {
    ttsPlaybackStateRef.current = state;
    setTtsPlaybackState(state);
  };

  const clearResumeListeningTimer = (reason: string) => {
    if (resumeListeningTimerRef.current === null) return;
    window.clearTimeout(resumeListeningTimerRef.current);
    resumeListeningTimerRef.current = null;
    console.debug(`[VOICE] RESUME_LISTENING_TIMER_CLEAR reason=${reason}`);
  };

  const clearNormalListeningWatchdogs = (reason: string) => {
    clearAsrReadyWatchdog(reason);
    clearResumeListeningTimer(reason);
    if (asrRecoveryTimerRef.current !== null) { window.clearTimeout(asrRecoveryTimerRef.current); asrRecoveryTimerRef.current = null; }
    if (asrStallTimerRef.current !== null) { window.clearInterval(asrStallTimerRef.current); asrStallTimerRef.current = null; }
  };

  const playbackIsActive = () => {
    const assistantState = assistantTurnStateRef.current;
    const ttsState = ttsPlaybackStateRef.current;
    return Boolean(voicePipelineRef.current.getActiveJob()) || assistantState === "TTS_GENERATING" || assistantState === "TTS_READY" || assistantState === "PLAYBACK_STARTING" || assistantState === "PLAYING" || ttsState === "REQUESTING" || ttsState === "BUFFERING" || ttsState === "READY" || ttsState === "PLAYING";
  };

  const scenario = useMemo(() => SCENARIOS.find((item) => item.id === scenarioId) || SCENARIOS[0], [scenarioId]);
  const selectedVoice = voiceOptions.find((voice) => voice.id === selectedVoiceId);
  const characterGender: CharacterGender = selectedVoice?.gender === "male" ? "male" : "female";
  const characterName = "Ta";
  const listeningReady = listeningReadyRef.current;
  const visibleMessages = messages.slice(-8);
  const hasUserTurn = messages.some((message) => message.role === "user");

  useEffect(() => {
    mobileBootTrace.mark("REACT_BOOTSTRAP_START");
    setDebugEnabled(new URLSearchParams(window.location.search).get("debug") === "true");
    setVoiceInputSupported(asrRef.current.isSupported());
    mobileBootTrace.mark("REACT_MOUNTED");
    mobileBootTrace.mark("HYDRATION_COMPLETE");
    mobileBootTrace.mark("CORE_UI_READY");
    mobileBootTrace.mark("APP_READY");
    const loadVoiceConfig = () => {
      void fetchWithTimeout(apiUrl("/api/tts/config"), {}, 6000).then((response) => response.json()).then((data: { voices?: VoiceOption[] }) => {
        const nextVoices = data.voices || [];
        const storedVoice = window.localStorage.getItem(TTS_VOICE_STORAGE_KEY);
        setVoiceOptions(nextVoices);
        setSelectedVoiceId(storedVoice && nextVoices.some((voice) => voice.id === storedVoice) ? storedVoice : nextVoices[0]?.id || "");
      }).catch(() => undefined);
    };
    const idle = window.setTimeout(loadVoiceConfig, 1200);
    const stopMicWatch = microphoneRef.current.watchDeviceChanges(() => {
      const track = streamRef.current?.getAudioTracks()[0];
      if (!track || track.readyState !== "live") setNotice("麦克风设备发生变化，请重新点击开始语音。");
      else setMicHealth((current) => ({ ...current, trackState: track.readyState, trackMuted: track.muted }));
    });
    return () => {
      stopMicWatch();
      window.clearTimeout(idle);
      asrRef.current.stop();
      voicePipelineRef.current.stop("SESSION_END");
      assistantTurnCoordinatorRef.current.stop("SESSION_END");
      vadRef.current.stop();
      vadStreamRef.current = null;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      if (asrStallTimerRef.current !== null) window.clearInterval(asrStallTimerRef.current);
      clearNormalListeningWatchdogs("CLEANUP");
      asrGenerationRef.current += 1;
    };
  }, []);

  useEffect(() => {
    setArchives(readChatArchives());
  }, []);

  const selectVoice = (voiceId: string) => {
    setSelectedVoiceId(voiceId);
    window.localStorage.setItem(TTS_VOICE_STORAGE_KEY, voiceId);
  };

  const updateMessages = (next: ChatMessage[]) => {
    historyRef.current = next;
    setMessages(next);
  };

  const bindTrackHealth = (track: MediaStreamTrack | undefined, permissionApiState: MicHealth["permissionApiState"] = "unavailable") => {
    if (!track) return;
    const update = (extra: Partial<MicHealth> = {}) => setMicHealth((current) => ({ ...current, permissionGranted: track.readyState === "live", streamAcquired: true, trackState: track.readyState, trackMuted: track.muted, permissionApiState, ...extra }));
    track.onended = () => update({ streamAcquired: false, errorCode: "TRACK_ENDED" });
    track.onmute = () => update();
    track.onunmute = () => update();
  };

  const begin = async () => {
    setNotice("");
    // Unlock audio during the actual user gesture before any async request.
    voicePipelineRef.current.unlockAudio();
    mobileBootTrace.mark("MIC_INIT_START");
    setMicrophoneState("requesting");
    const micResult = await microphoneRef.current.request({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    const nextMicrophoneState: MicrophoneState = micResult.status;
    if (micResult.stream) {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = micResult.stream;
      const track = micResult.stream.getAudioTracks()[0];
      bindTrackHealth(track, micResult.permissionApiState);
      setMicHealth((current) => ({ ...current, permissionGranted: true, secureContext: micResult.secureContext, mediaDevicesAvailable: Boolean(navigator.mediaDevices), getUserMediaAvailable: Boolean(navigator.mediaDevices?.getUserMedia), permissionApiState: micResult.permissionApiState, streamAcquired: true, trackState: track?.readyState || "live", trackMuted: track?.muted || false, errorCode: undefined }));
    } else {
      setMicHealth((current) => ({ ...current, permissionGranted: false, secureContext: micResult.secureContext, mediaDevicesAvailable: Boolean(navigator.mediaDevices), getUserMediaAvailable: Boolean(navigator.mediaDevices?.getUserMedia), permissionApiState: micResult.permissionApiState, streamAcquired: false, trackState: nextMicrophoneState === "denied" ? "denied" : "unavailable", trackMuted: false, errorCode: micResult.errorCode }));
    }
    setMicrophoneState(nextMicrophoneState);
    if (!asrRef.current.isSupported()) {
      setVoiceInputSupported(false);
      setStarted(true);
      setConversationActive(false);
      voiceSessionEnabledRef.current = false;
      setStatus("idle");
      setNotice(nextMicrophoneState === "granted" ? "麦克风已授权，但当前浏览器没有语音识别能力，已切换为文字对话。" : `${micResult.message || "当前浏览器不支持网页语音识别"} 已切换为文字对话。`);
      return;
    }
    setVoiceInputSupported(true);
    if (nextMicrophoneState !== "granted") {
      voiceSessionEnabledRef.current = false;
      setNotice(`${micResult.message || "麦克风暂时不可用"} 也可以先用文字对话。`);
      return;
    }
    setStarted(true);
    mobileBootTrace.mark("VOICE_RUNTIME_READY");
    voiceSessionEnabledRef.current = true;
    startVoiceConversation();
  };

  const resetConversation = () => {
    conversationActiveRef.current = false;
    setConversationActive(false);
    asrRef.current.stop();
    voicePipelineRef.current.stop("SESSION_END");
    assistantTurnCoordinatorRef.current.stop("SESSION_END");
    vadRef.current.stop();
    vadStreamRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (endTimerRef.current !== null) window.clearTimeout(endTimerRef.current);
    finalizeGenerationRef.current += 1;
    if (asrStallTimerRef.current !== null) { window.clearInterval(asrStallTimerRef.current); asrStallTimerRef.current = null; }
    accumulatorRef.current.reset();
    asrRef.current.stop();
    utteranceStartRef.current = null;
    lastVoiceAtRef.current = null;
    lastAsrResultAtRef.current = null;
    lastFinalAtRef.current = null;
    asrSpeechActiveRef.current = false;
    clearNormalListeningWatchdogs("SESSION_RESET");
    asrGenerationRef.current += 1;
    listeningGenerationRef.current += 1;
    setRealtimeState("IDLE");
    markListeningReady(false);
    setStatus("idle");
    setNotice("");
    setInterimText("");
    setMode("");
    setDebugInfo(null);
    setTtsDebug(null);
    markTtsPlaybackState("IDLE");
    assistantTurnStateRef.current = "IDLE";
    setAssistantTurnState("IDLE");
    setAssistantTurnTrace(null);
    setAsrSessionInfo(null);
    voiceSessionEnabledRef.current = false;
    setReviewOpen(false);
    setReview(null);
    setReviewTurns([]);
    setReviewQuestion("");
    setReviewError("");
    archiveIdRef.current = `conversation-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    sectionIdRef.current = newSectionId();
    updateMessages([WELCOME]);
  };

  const saveRound = (userText: string, reply: string) => {
    const now = new Date().toISOString();
    const current = readChatArchives().find((archive) => archive.id === archiveIdRef.current);
    const roundMessages: ChatMessage[] = [
      ...(current?.messages || []),
      { role: "user", content: userText },
      { role: "assistant", content: reply },
    ];
    const firstUserMessage = roundMessages.find((message) => message.role === "user")?.content.trim() || "这一轮对话";
    const nextArchive: ChatArchive = {
      id: archiveIdRef.current,
      title: firstUserMessage.length > 36 ? `${firstUserMessage.slice(0, 36)}…` : firstUserMessage,
      createdAt: current?.createdAt || now,
      updatedAt: now,
      messages: roundMessages,
    };
    setArchives(upsertChatArchive(nextArchive));
  };

  const trimInterruptedAssistant = (spokenText: string) => {
    const currentMessages = historyRef.current;
    const last = currentMessages.at(-1);
    if (last?.role !== "assistant") return;
    const nextMessages = spokenText.trim()
      ? [...currentMessages.slice(0, -1), { role: "assistant", content: spokenText.trim() } satisfies ChatMessage]
      : currentMessages.slice(0, -1);
    updateMessages(nextMessages);
    const archive = readChatArchives().find((item) => item.id === archiveIdRef.current);
    if (!archive || archive.messages.at(-1)?.role !== "assistant") return;
    const archiveMessages = spokenText.trim()
      ? [...archive.messages.slice(0, -1), { role: "assistant", content: spokenText.trim() } satisfies ChatMessage]
      : archive.messages.slice(0, -1);
    setArchives(upsertChatArchive({ ...archive, messages: archiveMessages, updatedAt: new Date().toISOString() }));
  };

  const requestReview = async (question?: string) => {
    setReviewLoading(true);
    setReviewError("");
    try {
      const response = await fetchWithTimeout(apiUrl("/api/review"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ history: historyRef.current.slice(-12), scenarioContext: scenario.context, question: question?.trim() || undefined }),
      }, 20000);
      const data = await response.json() as { review?: EmotionReview; answer?: string; error?: string };
      if (!response.ok) throw new Error(data.error || "复盘暂时没有完成");
      if (question?.trim() && data.answer) {
        setReviewTurns((current) => [...current, { role: "user", content: question.trim() }, { role: "assistant", content: data.answer || "" }]);
        setReviewQuestion("");
      } else if (data.review) {
        setReview(data.review);
      }
    } catch (error) {
      setReviewError(error instanceof Error ? error.message : "复盘暂时没有完成，再试一次？");
    } finally {
      setReviewLoading(false);
    }
  };

  const openReview = () => {
    setReviewOpen(true);
    if (!review && !reviewLoading) void requestReview();
  };

  const releaseMicrophoneForPlayback = () => {
    vadRef.current.stop();
    vadStreamRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setMicHealth((current) => ({ ...current, permissionGranted: false, streamAcquired: false, trackState: "stopped-for-playback", trackMuted: false, vadAlive: false, asrAlive: false }));
  };

  const acquireMicrophoneForListening = async () => {
    const existingTrack = streamRef.current?.getAudioTracks()[0];
    if (existingTrack?.readyState === "live") return true;
    const result = await microphoneRef.current.request({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    if (!result.stream) {
      setMicHealth((current) => ({ ...current, permissionGranted: false, secureContext: result.secureContext, mediaDevicesAvailable: Boolean(navigator.mediaDevices), getUserMediaAvailable: Boolean(navigator.mediaDevices?.getUserMedia), permissionApiState: result.permissionApiState, streamAcquired: false, trackState: result.status === "denied" ? "denied" : "unavailable", trackMuted: false, errorCode: result.errorCode }));
      setNotice(result.message || "麦克风暂时不可用，已停止自动收音。");
      return false;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = result.stream;
    const track = result.stream.getAudioTracks()[0];
    bindTrackHealth(track, result.permissionApiState);
    setMicrophoneState(result.status);
    setMicHealth((current) => ({ ...current, permissionGranted: true, secureContext: result.secureContext, mediaDevicesAvailable: Boolean(navigator.mediaDevices), getUserMediaAvailable: Boolean(navigator.mediaDevices?.getUserMedia), permissionApiState: result.permissionApiState, streamAcquired: true, trackState: track?.readyState || "live", trackMuted: track?.muted || false, errorCode: undefined }));
    mobileBootTrace.mark("MIC_READY");
    return true;
  };

  const startVadMonitoring = () => {
    if (!VOICE_FEATURES.advancedVad) {
      vadRef.current.stop();
      vadStreamRef.current = null;
      setMicHealth((current) => ({ ...current, vadAlive: false }));
      return;
    }
    const stream = streamRef.current;
    if (!stream || vadStreamRef.current === stream) return;
    vadStreamRef.current = stream;
    void vadRef.current.start(stream, (update) => {
      const now = Date.now();
      if (update.active) {
        lastVoiceAtRef.current = now;
        if (utteranceStartRef.current == null) utteranceStartRef.current = now;
        if (!interruptModeRef.current) setRealtimeState((current) => current === "LISTENING" || current === "POSSIBLE_END" ? "USER_SPEAKING" : current);
      }
      setMicHealth((current) => ({ ...current, trackState: streamRef.current?.getAudioTracks()[0]?.readyState || "ended", trackMuted: streamRef.current?.getAudioTracks()[0]?.muted || false, audioContextState: "running", vadAlive: true, audioLevelDetected: update.rms > update.threshold, lastAudioLevelAt: update.rms > update.threshold ? now : current.lastAudioLevelAt, lastVoiceActivityAt: update.active ? now : current.lastVoiceActivityAt, noiseFloor: Number(update.noiseFloor.toFixed(4)), vadThreshold: Number(update.threshold.toFixed(4)) }));
    }).then((context) => { if (context) setMicHealth((current) => ({ ...current, audioContextState: context.state })); });
  };

  const postTurnRecovery = async (reason: RecoveryReason) => {
    if (!conversationActiveRef.current) return;
    clearNormalListeningWatchdogs(`POST_TURN_RECOVERY:${reason}`);
    if (voicePipelineRef.current.getActiveJob()) {
      console.debug(`[VOICE] POST_TURN_RECOVERY_BLOCKED reason=${reason} activeVoiceJob=true`);
      return;
    }
    if (reason === "PLAYBACK_ENDED" || reason === "PLAYBACK_FAILED" || reason === "PLAYBACK_INTERRUPTED") {
      const terminalStates: AssistantTurnState[] = ["COMPLETED", "COMPLETED_WITH_AUDIO_FAILURE", "INTERRUPTED"];
      if (!terminalStates.includes(assistantTurnStateRef.current)) {
        console.debug(`[VOICE] POST_TURN_RECOVERY_BLOCKED reason=${reason} assistantState=${assistantTurnStateRef.current}`);
        return;
      }
    }
    console.debug(`[VOICE] POST_TURN_RECOVERY reason=${reason}`);
    await resumeListening({ reason });
  };

  const requestReply = async (userText: string, baseHistory: ChatMessage[], turnId = `turn-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, asrMeta?: { rawAsrText?: string; confidence?: number; alternatives?: string[]; asrSessionCount?: number; speechDurationMs?: number }) => {
    const generationId = ++generationRef.current;
    if (processedTurnIdsRef.current.has(turnId)) return;
    processedTurnIdsRef.current.add(turnId);
    const voiceModeAtRequest = voiceSessionEnabledRef.current;
    const turnCallbacks = {
      onStateChange: (state: AssistantTurnState, trace: AssistantTurnTrace) => {
        assistantTurnStateRef.current = state;
        setAssistantTurnState(state);
        setAssistantTurnTrace(trace);
        if (state === "TTS_GENERATING") markTtsPlaybackState("REQUESTING");
        if (state === "TTS_READY") markTtsPlaybackState("READY");
        if (state === "PLAYBACK_STARTING") { clearResumeListeningTimer("PLAYBACK_STARTING"); markTtsPlaybackState("READY"); }
        if (state === "PLAYING") { clearResumeListeningTimer("PLAYING"); markTtsPlaybackState("PLAYING"); }
        if (state === "COMPLETED") markTtsPlaybackState("COMPLETED");
        if (state === "COMPLETED_WITH_AUDIO_FAILURE" || state === "FAILED") markTtsPlaybackState("FAILED");
        if (state === "GENERATING_TEXT" || state === "TEXT_STREAMING") { setStatus("thinking"); setRealtimeState("AI_GENERATING"); }
        else if (state === "TEXT_READY" || state === "TTS_PENDING" || state === "TTS_GENERATING" || state === "TTS_READY" || state === "PLAYBACK_STARTING") { setStatus("preparing"); setRealtimeState("AI_SPEAKING"); }
        else if (state === "PLAYING") { audioSessionRef.current.markAiSpeaking(); setStatus("speaking"); setRealtimeState("AI_SPEAKING"); }
      },
      onTrace: (trace: AssistantTurnTrace) => setAssistantTurnTrace(trace),
      onVoiceJobCreated: (job: VoiceJob) => setAssistantTurnTrace((current) => current ? { ...current, voiceJobId: job.voiceJobId } : current),
      onTtsMetrics: (metrics: TTSMetrics) => setTtsDebug(metrics),
      onAudioError: (message: string) => setNotice(message),
      onPlaybackEnded: (trace: AssistantTurnTrace) => {
        if (!trace.voiceMode) return;
        interruptModeRef.current = false;
        void postTurnRecovery("PLAYBACK_ENDED");
      },
      onPlaybackFailed: ({ error, trace }: { error: string; trace: AssistantTurnTrace }) => {
        if (!trace.voiceMode) return;
        interruptModeRef.current = false;
        setNotice("这次语音没有正常播放，正在恢复对话。 ");
        void postTurnRecovery("PLAYBACK_FAILED");
        console.debug(`[VOICE] PLAYBACK_FAILED error=${error}`);
      },
      onPlaybackInterrupted: ({ reason, trace }: { reason: string; trace: AssistantTurnTrace }) => {
        if (!trace.voiceMode) return;
        interruptModeRef.current = false;
        console.debug(`[VOICE] PLAYBACK_INTERRUPTED reason=${reason}`);
      },
      onTurnFailed: ({ error, trace }: { error: string; trace: AssistantTurnTrace }) => {
        if (!trace.voiceMode) return;
        interruptModeRef.current = false;
        void postTurnRecovery("TEXT_FAILED");
        console.debug(`[VOICE] TURN_FAILED error=${error}`);
      },
    };
    assistantTurnCoordinatorRef.current.beginTextGeneration({ assistantTurnId: turnId, generationId, sessionId: archiveIdRef.current, voiceMode: voiceModeAtRequest, callbacks: turnCallbacks });
    try {
      const response = await fetchWithTimeout(apiUrl("/api/chat"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ history: baseHistory.slice(-20), userMessage: userText, rawAsrText: asrMeta?.rawAsrText, asrConfidence: asrMeta?.confidence, asrAlternatives: asrMeta?.alternatives, asrSessionCount: asrMeta?.asrSessionCount, speechDurationMs: asrMeta?.speechDurationMs, sceneContext: scenario.context, scenarioId: scenario.id, characterGender, voiceId: selectedVoiceId || undefined, sessionId: archiveIdRef.current, sectionId: sectionIdRef.current, continuePreviousScene: false, debug: debugEnabled, userTurnId: turnId, generationId }),
      }, 30000);
      const data = await response.json() as { text?: string; reply?: string; mode?: "mock" | "deepseek" | "fallback" | "safety"; error?: string; debug?: DebugInfo; voice?: { emotion?: TTSRequest["emotion"]; primaryEmotion?: string; emotionScale?: number; intensity?: number; speed?: number; volume?: number; sectionId?: string; contextText?: string; speechRate?: number; loudnessRate?: number; fallbackUsed?: boolean } };
      const reply = data.text || data.reply;
      if (!response.ok || !reply) throw new Error(data.error || "reply failed");
      if (generationId !== generationRef.current) return;
      setMode(data.mode || "");
      if (data.debug) setDebugInfo(data.debug);
      const ttsRequest: TTSRequest = { text: reply, emotion: VOICE_FEATURES.advancedEmotion ? data.voice?.emotion : undefined, primaryEmotion: VOICE_FEATURES.advancedEmotion ? data.voice?.primaryEmotion : undefined, emotionScale: VOICE_FEATURES.advancedEmotion ? data.voice?.emotionScale : undefined, intensity: VOICE_FEATURES.advancedEmotion ? data.voice?.intensity : undefined, speed: VOICE_FEATURES.advancedEmotion ? data.voice?.speed : undefined, volume: VOICE_FEATURES.advancedEmotion ? data.voice?.volume : undefined, speechRate: VOICE_FEATURES.advancedEmotion ? data.voice?.speechRate : undefined, loudnessRate: VOICE_FEATURES.advancedEmotion ? data.voice?.loudnessRate : undefined, streaming: VOICE_FEATURES.streamingTts, sectionId: data.voice?.sectionId || sectionIdRef.current, contextText: VOICE_FEATURES.advancedEmotion ? data.voice?.contextText : undefined, fallbackUsed: data.voice?.fallbackUsed, voiceId: selectedVoiceId || undefined };
      assistantTurnCoordinatorRef.current.commitAssistantMessage({
        text: reply,
        voiceMode: voiceSessionEnabledRef.current,
        ttsRequest,
        commitMessage: () => {
          const next = [...baseHistory, { role: "assistant", content: reply } satisfies ChatMessage];
          updateMessages(next);
          saveRound(userText, reply);
          setReviewOpen(false);
          setReview(null);
          setReviewTurns([]);
          setReviewQuestion("");
          setReviewError("");
          setLatestSpokenText("");
          spokenTextRef.current = "";
        },
        preparePlayback: () => {
          clearNormalListeningWatchdogs("PLAYBACK_STARTING");
          listeningGenerationRef.current += 1;
          interruptModeRef.current = true;
          asrRef.current.stop();
          audioSessionRef.current.prepareForPlayback(releaseMicrophoneForPlayback);
          if (audioSessionRef.current.usesSmartHalfDuplex()) ttsProviderRef.current.setAudioSessionType("playback");
        },
      });
    } catch (error) {
      assistantTurnCoordinatorRef.current.failText(error instanceof Error ? error.message : "reply failed");
      setNotice("连接出了点问题，重新试试？");
      if (!conversationActiveRef.current) setStatus("idle");
    }
  };

  const submitText = (value: string) => {
    const text = value.trim();
    const turnBusy = ["GENERATING_TEXT", "TEXT_STREAMING", "TEXT_READY", "TTS_PENDING", "TTS_GENERATING", "TTS_READY", "PLAYBACK_STARTING", "PLAYING"].includes(assistantTurnState);
    if (!text || turnBusy || status === "thinking" || status === "speaking" || status === "preparing") return;
    const baseHistory = [...historyRef.current, { role: "user", content: text } satisfies ChatMessage];
    updateMessages(baseHistory);
    setTextDraft("");
    void requestReply(text, baseHistory);
  };

  const finalizeCurrentTurn = (expectedGeneration = finalizeGenerationRef.current) => {
    if (expectedGeneration !== finalizeGenerationRef.current) return;
    if (!conversationActiveRef.current || realtimeState === "FINALIZING_USER_TURN" || realtimeState === "AI_GENERATING") return;
    const text = accumulatorRef.current.finalText();
    if (!text) {
      accumulatorRef.current.reset();
      setInterimText("");
      setNotice("刚刚没听清，再说一次？");
      setRealtimeState("RECOVERING_ASR");
      void resumeListening({ reason: "ASR_RECOVERY" });
      return;
    }
    if (endTimerRef.current !== null) window.clearTimeout(endTimerRef.current);
    finalizeGenerationRef.current += 1;
    clearNormalListeningWatchdogs("USER_TURN_FINAL");
    asrRef.current.stop();
    accumulatorRef.current.reset();
    setInterimText("");
    utteranceStartRef.current = null;
    lastVoiceAtRef.current = null;
    lastAsrResultAtRef.current = null;
    lastFinalAtRef.current = null;
    setRealtimeState("FINALIZING_USER_TURN");
    const turnId = `turn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const baseHistory = [...historyRef.current, { role: "user", content: text } satisfies ChatMessage];
    updateMessages(baseHistory);
    void requestReply(text, baseHistory, turnId);
  };

  const scheduleEndOfTurn = () => {
    if (endTimerRef.current !== null) window.clearTimeout(endTimerRef.current);
    const expectedGeneration = finalizeGenerationRef.current;
    const check = () => {
      if (expectedGeneration !== finalizeGenerationRef.current) return;
      const snapshot = accumulatorRef.current.snapshot();
      const now = Date.now();
      const currentText = [snapshot.committedTranscript, snapshot.interimTranscript].filter(Boolean).join("");
      const lastAsrResult = lastAsrResultAtRef.current || lastFinalAtRef.current || now;
      const asrResultFresh = lastAsrResultAtRef.current !== null && now - lastAsrResultAtRef.current < 700;
      const lastVoice = asrResultFresh ? Math.max(lastAsrResult, lastVoiceAtRef.current || 0) : lastAsrResult;
      const vadStillActive = asrResultFresh && now - lastVoice < 180 && asrSpeechActiveRef.current;
      const decision = detectEndOfTurn({ silenceDuration: now - lastVoice, vadActive: vadStillActive, interimTranscript: currentText, hasInterimTranscript: Boolean(snapshot.interimTranscript), lastFinalSegmentTime: lastFinalAtRef.current, semanticCompleteness: semanticCompleteness(currentText), utteranceDuration: now - (utteranceStartRef.current || lastFinalAtRef.current || now), now });
      setEndOfTurnConfidence(decision.confidence);
      if (decision.shouldFinalize) finalizeCurrentTurn(expectedGeneration);
      else if (conversationActiveRef.current) endTimerRef.current = window.setTimeout(check, 180);
    };
    endTimerRef.current = window.setTimeout(check, 180);
  };

  const startListening = (interruptOnly = false) => {
    if (!conversationActiveRef.current) return;
    if (!interruptOnly && playbackIsActive()) {
      console.debug(`[VOICE] ILLEGAL_START_LISTENING_DURING_PLAYBACK assistantState=${assistantTurnStateRef.current} ttsState=${ttsPlaybackStateRef.current}`);
      return;
    }
    clearAsrReadyWatchdog("NEW_ASR");
    const generation = ++asrGenerationRef.current;
    console.debug(`[VOICE] ASR_INIT generation=${generation}`);
    mobileBootTrace.mark("ASR_INIT_START");
    setNotice("");
    if (!interruptOnly) { setInterimText(""); markListeningReady(false); setRealtimeState("PREPARING_MIC"); }
    if (!asrRef.current.isSupported()) {
      conversationActiveRef.current = false;
      setConversationActive(false);
      setVoiceInputSupported(false);
      setStatus("idle");
      setNotice("当前浏览器不支持网页语音识别，已切换为文字对话。微信内置浏览器请用文字发送，或在系统浏览器打开。");
      return;
    }
    if (!interruptOnly) {
      interruptModeRef.current = false;
      setStatus("listening");
    }
    asrReadyTimerRef.current = window.setTimeout(() => {
      const isCurrentGeneration = generation === asrGenerationRef.current;
      if (isCurrentGeneration) asrReadyTimerRef.current = null;
      console.debug(`[VOICE] ASR_WATCHDOG_FIRED watchdogGeneration=${generation} currentGeneration=${asrGenerationRef.current} listeningReadyRef.current=${listeningReadyRef.current}`);
      if (!isCurrentGeneration || listeningReadyRef.current || !conversationActiveRef.current || interruptOnly) return;
      asrRef.current.stop();
      setRealtimeState("RECOVERING_ASR");
      setNotice("语音识别还没准备好，正在重新连接……");
      if (asrRecoveryTimerRef.current !== null) window.clearTimeout(asrRecoveryTimerRef.current);
      asrRecoveryTimerRef.current = window.setTimeout(() => { asrRecoveryTimerRef.current = null; if (conversationActiveRef.current && !playbackIsActive()) startListening(false); }, 250);
    }, 2800);
    console.debug(`[VOICE] ASR_WATCHDOG_ARMED generation=${generation}`);
    asrRef.current.start((text, isFinal) => {
      const resultAt = Date.now();
      finalizeGenerationRef.current += 1;
      lastVoiceAtRef.current = resultAt;
      lastAsrResultAtRef.current = resultAt;
      setMicHealth((current) => ({ ...current, asrAlive: true, lastAsrResultAt: Date.now() }));
      asrSpeechActiveRef.current = !isFinal;
      if (interruptOnly) return;
      if (realtimeState === "FINALIZING_USER_TURN" || realtimeState === "AI_GENERATING") return;
      const snapshot = accumulatorRef.current.accept(text, isFinal);
      setInterimText([snapshot.committedTranscript, snapshot.interimTranscript].filter(Boolean).join(""));
      if ((snapshot.committedTranscript || snapshot.interimTranscript) && utteranceStartRef.current == null) utteranceStartRef.current = resultAt;
      if (isFinal) lastFinalAtRef.current = Date.now();
      setRealtimeState(isFinal ? "POSSIBLE_END" : "USER_SPEAKING");
      scheduleEndOfTurn();
    }, (message) => {
      if (/权限|麦克风/.test(message)) {
        setVoiceInputSupported(false);
        setNotice("麦克风已授权，但此浏览器的语音识别服务没有启动，已切换为文字输入。");
        setRealtimeState("ERROR");
        setStatus("idle");
      } else {
        setRealtimeState("RECOVERING_ASR");
        setNotice("语音识别暂时中断，正在自动恢复……");
        if (asrRecoveryTimerRef.current !== null) window.clearTimeout(asrRecoveryTimerRef.current);
        asrRecoveryTimerRef.current = window.setTimeout(() => { asrRecoveryTimerRef.current = null; if (conversationActiveRef.current && !playbackIsActive()) void resumeListening({ reason: "ASR_RECOVERY" }); }, 260);
      }
      setInterimText("");
    }, () => {
      asrSpeechActiveRef.current = false;
      setMicHealth((current) => ({ ...current, asrAlive: false }));
      if (!conversationActiveRef.current) setStatus((current) => current === "listening" ? "idle" : current);
    }, { onReady: () => {
      console.debug(`[VOICE] ASR_NATIVE_ONSTART generation=${generation}`);
      console.debug(`[VOICE] ASR_PROVIDER_ONREADY generation=${generation}`);
      if (generation !== asrGenerationRef.current) return;
      mobileBootTrace.mark("ASR_READY");
      clearAsrReadyWatchdog("ON_READY");
      markListeningReady(true);
      setRealtimeState(interruptOnly ? "AI_SPEAKING" : "LISTENING");
      setMicHealth((current) => ({ ...current, asrAlive: true }));
    }, onActivity: (event) => {
      setMicHealth((current) => ({ ...current, lastAsrResultAt: Date.now() }));
      if (event === "speechstart") asrSpeechActiveRef.current = true;
      if (event === "speechend") asrSpeechActiveRef.current = false;
      if (event === "end") setAsrRestartCount((count) => count + 1);
    }, onSessionEvent: (event) => {
      setAsrSessionInfo(event);
      if (event.type === "restart") setAsrRestartCount(event.restartCount);
    } });
    if (asrStallTimerRef.current === null) {
      asrStallTimerRef.current = window.setInterval(() => {
        if (!conversationActiveRef.current || interruptModeRef.current || realtimeState === "AI_GENERATING" || realtimeState === "FINALIZING_USER_TURN") return;
        const voiceAt = lastVoiceAtRef.current;
        const asrAt = lastAsrResultAtRef.current;
        if (voiceAt == null || asrAt == null || voiceAt <= asrAt) return;
        if (Date.now() - voiceAt < 900 || Date.now() - asrAt < 1400) return;
        asrRef.current.stop();
        setNotice("检测到麦克风仍有声音，但识别通道没有回传，正在无损重连……");
        setRealtimeState("RECOVERING_ASR");
        lastAsrResultAtRef.current = Date.now();
        if (asrRecoveryTimerRef.current !== null) window.clearTimeout(asrRecoveryTimerRef.current);
        asrRecoveryTimerRef.current = window.setTimeout(() => { asrRecoveryTimerRef.current = null; if (conversationActiveRef.current && !interruptModeRef.current && !playbackIsActive()) startListening(false); }, 120);
      }, 700);
    }
  };

  const resumeListening = async ({ reason }: { reason: RecoveryReason }) => {
    if (!conversationActiveRef.current) return;
    if (playbackIsActive()) {
      console.debug(`[VOICE] ILLEGAL_RESUME_LISTENING_DURING_PLAYBACK reason=${reason} assistantState=${assistantTurnStateRef.current} ttsState=${ttsPlaybackStateRef.current}`);
      return;
    }
    if ((reason === "PLAYBACK_ENDED" || reason === "PLAYBACK_FAILED" || reason === "PLAYBACK_INTERRUPTED") && !["COMPLETED", "COMPLETED_WITH_AUDIO_FAILURE", "INTERRUPTED"].includes(assistantTurnStateRef.current)) return;
    clearResumeListeningTimer(`SCHEDULE:${reason}`);
    const listeningGeneration = ++listeningGenerationRef.current;
    interruptModeRef.current = false;
    setRealtimeState("PREPARING_MIC");
    setStatus("listening");
    const ready = await audioSessionRef.current.prepareForListening(acquireMicrophoneForListening);
    if (!ready || !conversationActiveRef.current || listeningGeneration !== listeningGenerationRef.current || playbackIsActive()) {
      setStatus("idle");
      return;
    }
    if (audioSessionRef.current.usesSmartHalfDuplex()) ttsProviderRef.current.setAudioSessionType("play-and-record");
    startVadMonitoring();
    console.debug(`[VOICE] RESUME_LISTENING_SCHEDULED reason=${reason} generation=${listeningGeneration}`);
    resumeListeningTimerRef.current = window.setTimeout(() => {
      resumeListeningTimerRef.current = null;
      console.debug(`[VOICE] RESUME_LISTENING_TIMER_FIRE reason=${reason} generation=${listeningGeneration}`);
      if (listeningGeneration !== listeningGenerationRef.current || !conversationActiveRef.current || playbackIsActive()) return;
      startListening();
    }, 160);
  };

  const startVoiceConversation = () => {
    conversationActiveRef.current = true;
    setConversationActive(true);
    voiceSessionEnabledRef.current = true;
    setRealtimeState("PREPARING_MIC");
    void resumeListening({ reason: "MANUAL_RETRY" });
  };

  const endVoiceConversation = () => {
    conversationActiveRef.current = false;
    setConversationActive(false);
    voiceSessionEnabledRef.current = false;
    asrRef.current.stop();
    voicePipelineRef.current.stop("SESSION_END");
    assistantTurnCoordinatorRef.current.stop("SESSION_END");
    finalizeGenerationRef.current += 1;
    if (endTimerRef.current !== null) window.clearTimeout(endTimerRef.current);
    clearNormalListeningWatchdogs("SESSION_END");
    listeningGenerationRef.current += 1;
    vadRef.current.stop();
    vadStreamRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    asrGenerationRef.current += 1;
    setRealtimeState("IDLE");
    markListeningReady(false);
    assistantTurnStateRef.current = "IDLE";
    setAssistantTurnState("IDLE");
    markTtsPlaybackState("IDLE");
    setInterimText("");
    setStatus("idle");
  };

  const handleMic = () => {
    if (!voiceInputSupported) {
      setNotice("当前浏览器不能调用网页语音识别，请直接输入文字，或改用系统浏览器。");
      return;
    }
    if (conversationActiveRef.current) endVoiceConversation();
    else startVoiceConversation();
  };

  if (!started) {
    return (
      <main className="min-h-[100dvh] bg-[#141313] px-5 py-6 text-[#f4efeb] sm:px-8">
        <div className="mx-auto flex min-h-[calc(100dvh-3rem)] max-w-5xl flex-col">
          <header className="flex items-center justify-between border-b border-white/10 pb-5">
            <div className="flex items-center gap-3"><Avatar small gender={characterGender} /><div><p className="text-sm font-medium">{characterName}</p><p className="text-xs text-[#9f9795]">你的伴侣</p></div></div>
            <button type="button" onClick={() => { setSelectedArchiveId(null); setHistoryOpen(true); }} className="text-xs text-[#9f9795] transition hover:text-[#f4efeb]">历史记录</button>
          </header>
          <section className="grid flex-1 items-center gap-12 py-14 lg:grid-cols-[.85fr_1.15fr] lg:gap-24">
            <div className="relative flex justify-center lg:justify-start"><div className="absolute top-10 h-64 w-64 rounded-full bg-[#e98972]/10 blur-3xl" /><div className="relative"><Avatar gender={characterGender} /></div></div>
            <div className="max-w-xl">
              <p className="mb-5 text-sm tracking-[0.16em] text-[#e98972]">一场只用声音发生的关系</p>
              <h1 className="max-w-lg text-4xl font-medium leading-[1.08] tracking-[-0.045em] sm:text-6xl">有些话，面对面反而说不出来。</h1>
              <p className="mt-7 max-w-md text-base leading-7 text-[#b7adab]">{characterName}会听你说，也会把刚刚发生的事放在心上。选择一个今晚的开场。</p>
              <div className="mt-9 grid gap-2 sm:grid-cols-2">
                {SCENARIOS.map((item) => <button key={item.id} type="button" onClick={() => setScenarioId(item.id)} className={`rounded-2xl border px-4 py-3 text-left text-sm transition ${scenarioId === item.id ? "border-[#e98972] bg-[#e98972]/10 text-[#f4efeb]" : "border-white/10 text-[#a9a09e] hover:border-white/25"}`}><span className="block font-medium">{item.shortTitle}</span><span className="mt-1 block text-xs text-[#857d7b]">{item.title}</span></button>)}
              </div>
              <VoiceSelector voices={voiceOptions} selectedVoiceId={selectedVoiceId} onChange={selectVoice} />
              <button type="button" onClick={() => void begin()} className="mt-6 flex w-full items-center justify-center rounded-full bg-[#e98972] px-6 py-4 text-sm font-semibold text-[#241615] transition hover:bg-[#f6a08b] active:scale-[.98] sm:w-auto sm:min-w-48">开始对话<span className="ml-2" aria-hidden="true">→</span></button>
              {notice && <p role="alert" className="mt-4 text-sm text-[#f6a08b]">{notice}</p>}
            </div>
          </section>
          <p className="border-t border-white/10 pt-4 text-xs leading-5 text-[#746c6a]">当前版本建议使用 Chrome 浏览器 · 对话记录只保存在本机浏览器</p>
        </div>
        {historyOpen && <ChatHistoryPanel archives={archives} selectedArchiveId={selectedArchiveId} onSelect={setSelectedArchiveId} onBack={() => setSelectedArchiveId(null)} onClose={() => setHistoryOpen(false)} gender={characterGender} />}
      </main>
    );
  }

  return (
    <main className="min-h-[100dvh] bg-[#141313] text-[#f4efeb]">
      <div className="mx-auto flex min-h-[100dvh] max-w-3xl flex-col px-5 pb-6 pt-5 sm:px-8">
        <header className="flex items-center justify-between border-b border-white/10 pb-4">
          <div className="flex items-center gap-3"><Avatar small gender={characterGender} /><div><p className="text-sm font-medium">{characterName}</p><p className="text-xs text-[#9f9795]">你的伴侣</p></div></div>
          <div className="flex items-center gap-4"><button type="button" onClick={() => { setSelectedArchiveId(null); setHistoryOpen(true); }} className="text-xs text-[#9f9795] transition hover:text-[#f4efeb]">历史记录</button><button type="button" onClick={resetConversation} className="text-xs text-[#9f9795] transition hover:text-[#f4efeb]">重新开始</button></div>
        </header>
        <section className="flex flex-1 flex-col items-center pt-11 sm:pt-14">
          <div className="flex flex-col items-center"><div className={`relative rounded-full ${status === "listening" && listeningReady ? "breathing" : ""}`}><Avatar gender={characterGender} /></div><p className="mt-6 text-sm text-[#d1c7c4]">{realtimeState === "PREPARING_MIC" ? "正在准备麦克风……" : realtimeState === "RECOVERING_ASR" ? "刚刚没听清，正在恢复……" : STATUS_COPY[status].replace("小满", characterName)}</p><p className="mt-2 text-[11px] text-[#756d6b]">麦克风：{microphoneState === "granted" ? "已授权" : microphoneState === "requesting" ? "请求中" : microphoneState === "denied" ? "未授权" : microphoneState === "error" ? "暂时不可用" : "检测中"}{micHealth.trackMuted ? "（设备静音）" : ""}</p>{status === "listening" && interimText && <p className="mt-3 max-w-xs text-center text-xs leading-5 text-[#a9a09e]">“{interimText}”</p>}<div className="mt-3 h-8">{status === "speaking" ? <Wave /> : status === "thinking" ? <div className="flex h-8 items-center gap-1"><i className="h-1.5 w-1.5 rounded-full bg-[#e98972] motion-safe:animate-bounce" /><i className="h-1.5 w-1.5 rounded-full bg-[#e98972] motion-safe:animate-bounce [animation-delay:120ms]" /><i className="h-1.5 w-1.5 rounded-full bg-[#e98972] motion-safe:animate-bounce [animation-delay:240ms]" /></div> : <span className="text-xs text-[#756d6b]">{scenario.shortTitle}</span>}</div></div>
          <div className="mt-10 w-full max-w-xl space-y-4" aria-live="polite">
            {visibleMessages.map((message, index) => <div key={`${message.role}-${index}-${message.content.slice(0, 8)}`} className={`flex items-start gap-3 ${message.role === "user" ? "justify-end" : "justify-start"}`}>{message.role === "assistant" && <Avatar small gender={characterGender} />}<div className={`max-w-[78%] rounded-2xl px-4 py-3 text-sm leading-6 ${message.role === "user" ? "rounded-br-md bg-[#e98972] text-[#241615]" : "rounded-bl-md bg-[#211e1d] text-[#ded4d1]"}`}><span className="mb-1 block text-[10px] tracking-[0.12em] opacity-50">{message.role === "user" ? "我" : characterName}</span>{message.content}</div></div>)}
          </div>
          {hasUserTurn && status !== "thinking" && <div className="mt-7 w-full max-w-xl"><button type="button" onClick={openReview} aria-expanded={reviewOpen} className="flex w-full items-center justify-between rounded-2xl border border-white/10 bg-[#1b1818] px-4 py-3 text-left transition hover:border-[#e98972]/40 hover:bg-[#211e1d] active:scale-[.99]"><span><span className="block text-sm text-[#f4efeb]">情绪复盘</span><span className="mt-1 block text-xs text-[#817876]">看看刚刚真正发生了什么</span></span><span className="text-lg text-[#e98972]">{reviewOpen ? "⌃" : "→"}</span></button>{reviewOpen && <EmotionReviewPanel review={review} turns={reviewTurns} question={reviewQuestion} loading={reviewLoading} error={reviewError} onQuestionChange={setReviewQuestion} onContinue={() => void requestReview(reviewQuestion)} onRetry={() => void requestReview()} onClose={() => setReviewOpen(false)} />}</div>}
        </section>
          {debugEnabled && <RepairDebug debugInfo={debugInfo} />}
          {debugEnabled && <PerformanceDebug plan={debugInfo?.emotionPerformance || null} />}
          {debugEnabled && <details open className="mt-4 w-full max-w-xl rounded-2xl border border-white/10 bg-[#1b1818] p-4 text-xs text-[#b7adab]"><summary className="cursor-pointer text-[#e98972]">Realtime Voice Debug</summary><div className="mt-3 grid gap-2 sm:grid-cols-2"><p>REALTIME STATE：{realtimeState}</p><p>LISTENING READY：{listeningReady ? "yes" : "no"}</p><p>MIC TRACK：{micHealth.trackState}{micHealth.trackMuted ? " / muted" : ""}</p><p>MIC PERMISSION API：{micHealth.permissionApiState || "-"}</p><p>SECURE CONTEXT：{micHealth.secureContext == null ? "-" : micHealth.secureContext ? "yes" : "no"}</p><p>STREAM：{micHealth.streamAcquired ? "acquired" : "-"}</p><p>AUDIO CONTEXT：{micHealth.audioContextState}</p><p>VAD：{micHealth.vadAlive ? "active" : "off"}</p><p>ASR：{micHealth.asrAlive ? "active" : "off"}</p><p>AudioSession：{audioSessionRef.current.getState()}</p><p>Platform Strategy：{audioSessionRef.current.getStrategy()}</p><p>ASR SESSION：{asrSessionInfo?.sessionId || "-"}</p><p>ASR SESSION COUNT：{asrSessionInfo?.sessionCount ?? "-"}</p><p>VOICE ACTIVITY：{micHealth.lastVoiceActivityAt ? new Date(micHealth.lastVoiceActivityAt).toLocaleTimeString() : "-"}</p><p>VAD THRESHOLD：{micHealth.vadThreshold || "-"}</p><p className="sm:col-span-2">COMMITTED：{interimText || "-"}</p><p>END CONFIDENCE：{endOfTurnConfidence.toFixed(2)}</p><p>ASR RESTART：{asrRestartCount}</p><p className="sm:col-span-2">ACTUALLY SPOKEN：{latestSpokenText || "-"}</p></div></details>}
          {debugEnabled && debugInfo?.realtime && <details open className="mt-4 w-full max-w-xl rounded-2xl border border-white/10 bg-[#1b1818] p-4 text-xs text-[#b7adab]"><summary className="cursor-pointer text-[#e98972]">Semantic / Novelty Debug</summary><div className="mt-3 grid gap-2 sm:grid-cols-2"><p className="sm:col-span-2">LATEST USER DELTA：{debugInfo.realtime.latestUserDelta}</p><p>EXPLICIT：{debugInfo.realtime.explicitIntents.join(", ") || "none"}</p><p>INFERRED：{debugInfo.realtime.inferredIntents.join(", ") || "none"}</p><p>NEGATED：{debugInfo.realtime.negatedIntents.join(", ") || "none"}</p><p>APOLOGY EVIDENCE：{debugInfo.realtime.apologyEvidence ? "yes" : "no"}</p><p>DIALOGUE ACT：{debugInfo.realtime.dialogueAct}</p><p>DUPLICATE SCORE：{debugInfo.realtime.semanticDuplicateScore}</p><p>NOVELTY SCORE：{debugInfo.realtime.responseNoveltyScore}</p><p>ADDRESSES LATEST：{debugInfo.realtime.addressesLatestDelta ? "yes" : "no"}</p></div></details>}
          {debugEnabled && debugInfo?.transcript && <details open className="mt-4 w-full max-w-xl rounded-2xl border border-white/10 bg-[#1b1818] p-4 text-xs text-[#b7adab]"><summary className="cursor-pointer text-[#e98972]">ASR / Semantic Grounding V7</summary><div className="mt-3 grid gap-2 sm:grid-cols-2"><p className="sm:col-span-2">RAW ASR：{debugInfo.transcript.rawAsrText}</p><p className="sm:col-span-2">CORRECTED：{debugInfo.transcript.correctedText}</p><p className="sm:col-span-2">FINAL USER TEXT：{debugInfo.transcript.finalUserText}</p><p>QUALITY：{debugInfo.transcript.quality.level} / {debugInfo.transcript.quality.score.toFixed(2)}</p><p>CONFIDENCE：{debugInfo.transcript.confidence}</p><p>SESSION COUNT：{debugInfo.transcript.quality.sessionCount}</p><p>CRITICAL AMBIGUITY：{debugInfo.transcript.quality.semanticCriticalAmbiguity ? "YES" : "NO"}</p><p className="sm:col-span-2">CORRECTIONS：{debugInfo.transcript.corrections.map((item) => `${item.original}→${item.corrected}`).join("；") || "none"}</p><p className="sm:col-span-2">UNCERTAIN：{debugInfo.transcript.uncertainSpans.map((item) => `${item.text}(${item.reason})`).join("；") || "none"}</p>{debugInfo.semanticGrounding && <><p>APOLOGY：{debugInfo.semanticGrounding.apologyEvidence.type}</p><p>OWNERSHIP：{debugInfo.semanticGrounding.ownershipEvidence ? "yes" : "no"}</p><p className="sm:col-span-2">AMBIGUOUS：{debugInfo.semanticGrounding.ambiguousIntents.join(", ") || "none"}</p><p className="sm:col-span-2">NOT EXPRESSED：{debugInfo.semanticGrounding.notExpressed.join(", ") || "none"}</p></>}{debugInfo.claimValidation && <><p>CLAIM VALID：{debugInfo.claimValidation.valid ? "yes" : "no"}</p><p>REGENERATIONS：{debugInfo.claimValidation.regenerationCount}</p><p className="sm:col-span-2">CLAIM ISSUES：{debugInfo.claimValidation.issues.join(", ") || "none"}</p></>}</div></details>}
        <footer className="mt-8 flex flex-col items-center">
          {voiceInputSupported ? <>
            <button type="button" onClick={handleMic} aria-label={conversationActive ? "结束持续语音对话" : "开始持续语音对话"} className={`relative flex h-20 w-20 items-center justify-center rounded-full text-[#241615] shadow-2xl shadow-black/20 transition active:scale-[.96] ${conversationActive ? "breathing bg-[#f6a08b]" : "bg-[#e98972] hover:bg-[#f6a08b]"}`}><span className="mic-glyph" /></button>
            <p className="mt-5 text-xs text-[#817876]">{conversationActive ? `持续对话中 · ${characterName}说完会继续听` : "点击开始持续语音对话"}</p>
          </> : <form onSubmit={(event) => { event.preventDefault(); submitText(textDraft); }} className="w-full max-w-xl rounded-2xl border border-white/10 bg-[#1b1818] p-3">
            <div className="flex gap-2">
              <input value={textDraft} onChange={(event) => setTextDraft(event.target.value)} placeholder={`先输入一句，和${characterName}聊聊……`} className="min-w-0 flex-1 rounded-xl border border-white/10 bg-[#141313] px-3 py-3 text-sm text-[#f4efeb] outline-none placeholder:text-[#756d6b] focus:border-[#e98972]/60" aria-label={`输入给${characterName}的话`} />
              <button type="submit" disabled={!textDraft.trim() || status === "thinking" || status === "speaking"} className="rounded-xl bg-[#e98972] px-4 py-2 text-sm font-medium text-[#241615] transition hover:bg-[#f6a08b] disabled:cursor-not-allowed disabled:opacity-40">发送</button>
            </div>
            <p className="mt-2 px-1 text-[11px] leading-5 text-[#817876]">当前浏览器不能把麦克风转成文字，文字对话仍然可用。</p>
          </form>}
          {notice && <div className="mt-4 flex items-center gap-3 rounded-full border border-[#e98972]/30 bg-[#e98972]/10 px-4 py-2 text-xs text-[#f6a08b]" role="alert">{notice}<button type="button" onClick={() => setNotice("")} className="text-[#f4efeb]">×</button></div>}
          {mode && <p className="mt-3 text-[10px] text-[#5f5856]">{mode === "deepseek" ? "DeepSeek 已连接" : mode === "safety" ? "Safety Override 已接管" : "当前为本地演示回复"}</p>}
          {debugEnabled && <p className="mt-2 text-[10px] text-[#756d6b]">TTS 状态：{ttsPlaybackState}</p>}
          {debugEnabled && ttsDebug && <details open className="mt-4 w-full max-w-xl rounded-2xl border border-white/10 bg-[#1b1818] p-4 text-xs text-[#b7adab]"><summary className="cursor-pointer text-[#e98972]">TTS Debug</summary><div className="mt-3 grid gap-2 sm:grid-cols-2"><p>Provider：{ttsDebug.provider === "volcengine" ? "Doubao / 火山引擎" : "Browser SpeechSynthesis fallback"}</p><p>Voice：{ttsDebug.voice}</p><p>Emotion：{ttsDebug.emotion || "neutral"}</p><p>Intensity：{ttsDebug.intensity ?? "-"}</p><p>Streaming：{ttsDebug.streaming ? "yes" : "no"}</p><p>首包延迟：{ttsDebug.firstByteLatencyMs == null ? "-" : `${ttsDebug.firstByteLatencyMs} ms`}</p><p>总耗时：{ttsDebug.totalLatencyMs == null ? "播放中" : `${ttsDebug.totalLatencyMs} ms`}</p><p>Source RMS：{ttsDebug.sourceRms ?? "-"}</p><p>Source Peak：{ttsDebug.sourcePeak ?? "-"}</p><p>Client Gain：{ttsDebug.clientGain ?? "-"}</p><p>AudioContext：{ttsDebug.audioContextState ?? "-"}</p><p>AudioSession：{ttsDebug.audioSessionType ?? "-"}</p>{ttsDebug.fallbackReason && <p className="sm:col-span-2 text-[#f6a08b]">Fallback：{ttsDebug.fallbackReason}</p>}</div></details>}
          {debugEnabled && assistantTurnTrace && <details open className="mt-4 w-full max-w-xl rounded-2xl border border-white/10 bg-[#1b1818] p-4 text-xs text-[#b7adab]"><summary className="cursor-pointer text-[#e98972]">Assistant Turn Trace</summary><div className="mt-3 grid gap-2 sm:grid-cols-2"><p>Assistant Turn ID：{assistantTurnTrace.assistantTurnId}</p><p>Generation ID：{assistantTurnTrace.generationId}</p><p>Session ID：{assistantTurnTrace.sessionId}</p><p>TURN STATE：{assistantTurnTrace.state}</p><p>VOICE MODE：{assistantTurnTrace.voiceMode ? "enabled" : "disabled"}</p><p>VOICE JOB ID：{assistantTurnTrace.voiceJobId || "NONE"}</p><p>Audio Bytes：{assistantTurnTrace.audioBytes ?? "-"}</p><p>Playback Current Time：{assistantTurnTrace.playbackCurrentTime ?? "-"}</p><p className="sm:col-span-2">Events：{assistantTurnTrace.events.join(" → ")}</p>{assistantTurnTrace.error && <p className="sm:col-span-2 text-[#f6a08b]">Error：{assistantTurnTrace.error}</p>}</div></details>}
          {debugEnabled && debugInfo && <details open className="mt-4 w-full max-w-xl rounded-2xl border border-white/10 bg-[#1b1818] p-4 text-xs text-[#b7adab]"><summary className="cursor-pointer text-[#e98972]">Conflict Engine Debug</summary><div className="mt-3 grid gap-2 sm:grid-cols-2"><p>User Strategy：{debugInfo.userStrategy.join(" + ")}</p><p>Confidence：{debugInfo.confidence}</p><p>Intensity：{debugInfo.emotion.conflictIntensity}/5</p><p>Selected：{debugInfo.selectedStrategy.primary}{debugInfo.selectedStrategy.secondary.length ? ` + ${debugInfo.selectedStrategy.secondary.join(" + ")}` : ""}</p><p className="sm:col-span-2">Emotion：anger {debugInfo.emotion.anger} · hurt {debugInfo.emotion.hurt} · trust {debugInfo.emotion.trust} · connection {debugInfo.emotion.connection}</p><p className="sm:col-span-2">Retrieved：{debugInfo.retrievedEpisodeIds.join(", ")}</p><p className="sm:col-span-2">Validator：{debugInfo.validator.valid ? "通过" : debugInfo.validator.issues.join(", ")}</p>{debugInfo.topic && <><p className="sm:col-span-2">Topic：{debugInfo.topic.topic}</p><p>Topic Status：{debugInfo.topic.status}</p><p>Agreement：{debugInfo.topic.agreement || "—"}</p><p>Action Owner：{debugInfo.topic.actionOwner || "—"}</p><p>Action Deadline：{debugInfo.topic.actionDeadline || "—"}</p><p>New Evidence：{debugInfo.topic.newEvidence ? "yes" : "no"}</p><p>Topic Repetition：{debugInfo.topic.repetitionCount}</p><p>Topic Exhaustion：{debugInfo.topic.topicExhaustionScore}</p><p>Stuck Topic：{debugInfo.topic.stuckTopic ? "yes" : "no"}</p><p>Reopen Allowed：{debugInfo.topic.reopenAllowed ? "yes" : "no"}</p><p>Letting Go Readiness：{debugInfo.topic.lettingGoReadiness}</p><p>Topic Shift Probability：{Math.round(debugInfo.topic.topicShiftProbability * 100)}%</p><p>Daily Reentry：{debugInfo.topic.dailyLifeReentryStrategy || "—"}</p><p className="sm:col-span-2">Topic Gate：{debugInfo.topic.reason}</p></>}{debugInfo.relationship && <><p>Relationship State：{debugInfo.relationship.currentState}</p><p>Previous State：{debugInfo.relationship.previousState}</p><p>Transition Confidence：{debugInfo.relationship.stateConfidence}</p><p>State Duration：{debugInfo.relationship.stateDuration}</p><p>Conflict Locked：{debugInfo.relationship.conflictLocked ? "yes" : "no"}</p><p className="sm:col-span-2">Transition：{debugInfo.relationship.transitionReason}</p></>}{debugInfo.reflection && <><p>Reflection Depth：{debugInfo.reflection.insightDepth}/3</p><p>Mutual Understanding：{debugInfo.reflection.mutualUnderstanding}</p><p>Surface Conflict：{debugInfo.reflection.surfaceConflict || "—"}</p><p>Trigger：{debugInfo.reflection.triggerIdentified || "—"}</p><p>Underlying Need：{debugInfo.reflection.underlyingNeed || "—"}</p><p>User Contribution：{debugInfo.reflection.userContribution || "—"}</p><p>Character Contribution：{debugInfo.reflection.characterContribution || "—"}</p><p className="sm:col-span-2">Interaction Pattern：{debugInfo.reflection.interactionPattern || "—"}</p></>}{debugInfo.safety && <><p>Safety Active：{debugInfo.safety.active ? "yes" : "no"}</p><p>Risk Level：{debugInfo.safety.riskLevel}</p><p>Safety Confidence：{debugInfo.safety.confidence}</p><p className="sm:col-span-2">Safety Signals：{debugInfo.safety.signals.join(", ") || "none"}</p></>}{debugInfo.userState && <><p className="sm:col-span-2">User State：hurt {debugInfo.userState.hurt} · anger {debugInfo.userState.anger} · sadness {debugInfo.userState.sadness} · aggression {debugInfo.userState.aggression} · withdrawal {debugInfo.userState.withdrawal} · openness {debugInfo.userState.openness}</p><p className="sm:col-span-2">Intent：{debugInfo.userState.intent.join(" + ")} · Trend：{debugInfo.userState.trend}</p><p>Voice Emotion：{debugInfo.userState.voiceSignals}</p><p>Visual Emotion：{debugInfo.userState.visualSignals}</p></>}</div></details>}
        {debugEnabled && debugInfo?.memory && <details open className="mt-4 w-full max-w-xl rounded-2xl border border-white/10 bg-[#1b1818] p-4 text-xs text-[#b7adab]"><summary className="cursor-pointer text-[#e98972]">Memory Grounding Debug</summary><div className="mt-3 grid gap-2 sm:grid-cols-2"><p>Session：{debugInfo.memory.sessionId}</p><p>Session Type：{debugInfo.memory.sessionType}</p><p>Continue Previous Scene：{debugInfo.memory.continuePreviousScene ? "TRUE" : "FALSE"}</p><p>Active Topic：{debugInfo.memory.activeTopic}</p><p>Memory Claim：{debugInfo.memory.memoryClaimDetected ? "yes" : "no"}</p><p>Evidence ID：{debugInfo.memory.evidenceId || "NONE"}</p><p>Evidence Source：{debugInfo.memory.evidenceSource || "NONE"}</p><p>Evidence Confidence：{debugInfo.memory.evidenceConfidence}</p><p>Exact Quote Match：{debugInfo.memory.exactQuoteMatch ? "yes" : "no"}</p><p>Inference Used：{debugInfo.memory.inferenceUsed ? "yes" : "no"}</p><p>User Correction：{debugInfo.memory.userCorrection ? "yes" : "no"}</p><p>Reference Data Used as Fact：FALSE</p><p className="sm:col-span-2">Memory Guard：{debugInfo.memory.issues.join(", ") || "通过"}</p></div></details>}
        </footer>
        {historyOpen && <ChatHistoryPanel archives={archives} selectedArchiveId={selectedArchiveId} onSelect={setSelectedArchiveId} onBack={() => setSelectedArchiveId(null)} onClose={() => setHistoryOpen(false)} gender={characterGender} />}
      </div>
    </main>
  );
}

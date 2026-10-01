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
  type TTSRequest,
} from "@/lib/providers";
import { apiUrl, sitePath } from "@/lib/api";

type Status = "idle" | "listening" | "thinking" | "speaking";
type MicrophoneState = "unknown" | "granted" | "denied" | "unavailable";
type CharacterGender = "female" | "male";

type DebugInfo = {
  userStrategy: string[];
  confidence: number;
  emotion: { anger: number; hurt: number; disappointment: number; anxiety: number; contempt: number; trust: number; resentment: number; connection: number; conflictIntensity: number };
  selectedStrategy: { primary: string; secondary: string[]; rationale: string };
  retrievedEpisodeIds: string[];
  validator: { valid: boolean; issues: string[] };
  relationship?: { currentState: string; previousState: string; stateConfidence: number; stateDuration: number; conflictLocked: boolean; transitionReason: string };
  reflection?: { insightDepth: 0 | 1 | 2 | 3; mutualUnderstanding: number; surfaceConflict?: string; triggerIdentified?: string; underlyingNeed?: string; userContribution?: string; characterContribution?: string; interactionPattern?: string };
  safety?: { active: boolean; riskLevel: string; signals: string[]; confidence: number };
  userState?: { anger: number; hurt: number; sadness: number; anxiety: number; aggression: number; withdrawal: number; openness: number; distress: number; intent: string[]; trend: string; voiceSignals: string; visualSignals: string };
};

type VoiceOption = { id: string; name: string; gender?: "female" | "male" };
type ReviewEmotion = { label: string; level: number; evidence: string };
type EmotionReview = { title: string; summary: string; emotions: ReviewEmotion[]; needs: string[]; suggestions: string[]; nextPrompt: string };
type ReviewTurn = { role: "user" | "assistant"; content: string };

const STATUS_COPY: Record<Status, string> = {
  idle: "准备好了",
  listening: "正在听你说……",
  thinking: "小满正在想……",
  speaking: "小满正在说……",
};

const WELCOME: ChatMessage = {
  role: "assistant",
  content: "你来了。今天想跟我说什么？",
};

function Avatar({ small = false, gender = "female" }: { small?: boolean; gender?: CharacterGender }) {
  const male = gender === "male";
  return (
    <div className={`relative shrink-0 overflow-hidden rounded-full ${male ? "bg-[#b9a9b0]" : "bg-[#d7b9aa]"} ${small ? "h-11 w-11" : "h-44 w-44 sm:h-52 sm:w-52"}`} aria-label={`${male ? "男性" : "女性"}角色头像`}>
      <div className={`absolute left-[18%] top-[9%] h-[48%] w-[64%] rounded-[48%_48%_42%_42%] ${male ? "bg-[#211c27]" : "bg-[#372828]"}`} />
      <div className={`absolute left-[24%] top-[20%] h-[48%] w-[52%] rounded-[47%_47%_42%_42%] ${male ? "bg-[#d7ac94]" : "bg-[#f1c2a7]"}`} />
      {male && <div className="absolute left-[31%] top-[56%] h-[12%] w-[38%] rounded-b-[45%] bg-[#6d4e4c]/60" />}
      <div className={`absolute left-[32%] top-[38%] h-[3px] w-[9px] rotate-[10deg] rounded-full ${male ? "bg-[#291f2a]" : "bg-[#382526]"}`} />
      <div className={`absolute right-[32%] top-[38%] h-[3px] w-[9px] -rotate-[10deg] rounded-full ${male ? "bg-[#291f2a]" : "bg-[#382526]"}`} />
      <div className={`absolute left-1/2 top-[51%] h-[7px] w-[26px] -translate-x-1/2 rounded-[0_0_12px_12px] border-b-2 ${male ? "border-[#744448]" : "border-[#9c5f5a]"}`} />
      <div className={`absolute bottom-[-5%] left-[15%] h-[34%] w-[70%] rounded-[45%_45%_0_0] ${male ? "bg-[#76546b]" : "bg-[#eb8e75]"}`} />
      <div className={`absolute bottom-[8%] left-[37%] h-[8px] w-[26%] rounded-full ${male ? "bg-[#bc8da0]/60" : "bg-[#f5b09b]/60"}`} />
    </div>
  );
}

function Wave() {
  return <div className="wave flex h-8 items-center justify-center gap-1" aria-hidden="true"><span /><span /><span /><span /><span /></div>;
}

function VoiceSelector({ voices, selectedVoiceId, onChange }: { voices: VoiceOption[]; selectedVoiceId: string; onChange: (voiceId: string) => void }) {
  const selectedVoice = voices.find((voice) => voice.id === selectedVoiceId) || voices[0];
  if (!selectedVoice) return null;
  const characterName = selectedVoice.gender === "male" ? "死鬼" : "臭娘们";
  return (
    <div className="mt-5 rounded-2xl border border-white/10 bg-[#1b1818] p-4 text-left">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><p className="text-xs tracking-[0.12em] text-[#9f9795]">角色声音 · {selectedVoice.gender === "male" ? "男版" : "女版"}</p><p className="mt-1 text-sm text-[#f4efeb]">{characterName} · {selectedVoice.name}</p></div>
        <a href={sitePath("/voice-lab")} className="text-xs text-[#f6a08b] underline decoration-[#f6a08b]/30 underline-offset-4">试听更多音色</a>
      </div>
      <select value={selectedVoiceId || selectedVoice.id} onChange={(event) => onChange(event.target.value)} className="mt-3 w-full rounded-xl border border-white/10 bg-[#141313] px-3 py-3 text-sm text-[#f4efeb] outline-none transition focus:border-[#e98972]">
        {voices.map((voice) => <option key={voice.id} value={voice.id}>{voice.gender === "male" ? "男声 · " : "女声 · "}{voice.name}</option>)}
      </select>
      <p className="mt-2 text-[11px] leading-5 text-[#746c6a]">切换后，头像、昵称和下一次回复会同步使用这个角色。</p>
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
  const [selectedVoiceId, setSelectedVoiceId] = useState("");
  const [voiceOptions, setVoiceOptions] = useState<VoiceOption[]>([]);
  const [mode, setMode] = useState<"mock" | "deepseek" | "fallback" | "safety" | "">("");
  const [reviewOpen, setReviewOpen] = useState(false);
  const [review, setReview] = useState<EmotionReview | null>(null);
  const [reviewTurns, setReviewTurns] = useState<ReviewTurn[]>([]);
  const [reviewQuestion, setReviewQuestion] = useState("");
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewError, setReviewError] = useState("");
  const historyRef = useRef<ChatMessage[]>([WELCOME]);
  const conversationActiveRef = useRef(false);
  const asrRef = useRef(new BrowserSpeechRecognitionProvider());
  const ttsRef = useRef(new DoubaoTTSProvider());

  const scenario = useMemo(() => SCENARIOS.find((item) => item.id === scenarioId) || SCENARIOS[0], [scenarioId]);
  const selectedVoice = voiceOptions.find((voice) => voice.id === selectedVoiceId);
  const characterGender: CharacterGender = selectedVoice?.gender === "male" ? "male" : "female";
  const characterName = characterGender === "male" ? "死鬼" : "臭娘们";
  const visibleMessages = messages.slice(-8);
  const hasUserTurn = messages.some((message) => message.role === "user");

  useEffect(() => {
    setDebugEnabled(new URLSearchParams(window.location.search).get("debug") === "true");
    setVoiceInputSupported(asrRef.current.isSupported());
    void fetch(apiUrl("/api/tts/config")).then((response) => response.json()).then((data: { voices?: VoiceOption[] }) => {
      const nextVoices = data.voices || [];
      const storedVoice = window.localStorage.getItem(TTS_VOICE_STORAGE_KEY);
      setVoiceOptions(nextVoices);
      setSelectedVoiceId(storedVoice && nextVoices.some((voice) => voice.id === storedVoice) ? storedVoice : nextVoices[0]?.id || "");
    }).catch(() => undefined);
    return () => {
      asrRef.current.stop();
      ttsRef.current.stop();
    };
  }, []);

  const selectVoice = (voiceId: string) => {
    setSelectedVoiceId(voiceId);
    window.localStorage.setItem(TTS_VOICE_STORAGE_KEY, voiceId);
  };

  const updateMessages = (next: ChatMessage[]) => {
    historyRef.current = next;
    setMessages(next);
  };

  const begin = async () => {
    setNotice("");
    // 必须在用户点击触发的同步阶段先解锁音频，移动 Safari/部分 WebView
    // 才允许异步请求完成后播放 AI 语音。
    ttsRef.current.unlockAudio();
    let nextMicrophoneState: MicrophoneState = "unavailable";
    if (navigator.mediaDevices?.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((track) => track.stop());
        nextMicrophoneState = "granted";
      } catch {
        nextMicrophoneState = "denied";
      }
    }
    setMicrophoneState(nextMicrophoneState);
    if (!asrRef.current.isSupported()) {
      setVoiceInputSupported(false);
      setStarted(true);
      setConversationActive(false);
      setStatus("idle");
      setNotice(nextMicrophoneState === "granted" ? "麦克风已授权，但当前浏览器没有语音识别能力，已切换为文字对话。" : "当前浏览器不支持网页语音识别，已切换为文字对话。想用麦克风，请用系统浏览器打开。");
      return;
    }
    setVoiceInputSupported(true);
    if (nextMicrophoneState === "denied") {
      setNotice("麦克风权限没有打开，请在浏览器设置里允许；也可以先用文字对话。");
      return;
    }
    setStarted(true);
    startVoiceConversation();
  };

  const resetConversation = () => {
    conversationActiveRef.current = false;
    setConversationActive(false);
    asrRef.current.stop();
    ttsRef.current.stop();
    setStatus("idle");
    setNotice("");
    setInterimText("");
    setMode("");
    setDebugInfo(null);
    setTtsDebug(null);
    setReviewOpen(false);
    setReview(null);
    setReviewTurns([]);
    setReviewQuestion("");
    setReviewError("");
    updateMessages([WELCOME]);
  };

  const requestReview = async (question?: string) => {
    setReviewLoading(true);
    setReviewError("");
    try {
      const response = await fetch(apiUrl("/api/review"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ history: historyRef.current.slice(-12), scenarioContext: scenario.context, question: question?.trim() || undefined }),
      });
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

  const requestReply = async (userText: string, baseHistory: ChatMessage[]) => {
    setStatus("thinking");
    try {
      const response = await fetch(apiUrl("/api/chat"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ history: baseHistory.slice(-20), userMessage: userText, sceneContext: scenario.context, scenarioId: scenario.id, characterGender, debug: debugEnabled }),
      });
      const data = await response.json() as { text?: string; reply?: string; mode?: "mock" | "deepseek" | "fallback" | "safety"; error?: string; debug?: DebugInfo; voice?: { emotion?: TTSRequest["emotion"]; intensity?: number; speed?: number; volume?: number } };
      const reply = data.text || data.reply;
      if (!response.ok || !reply) throw new Error(data.error || "reply failed");
      setMode(data.mode || "");
      if (data.debug) setDebugInfo(data.debug);
      const next = [...baseHistory, { role: "assistant", content: reply } satisfies ChatMessage];
      updateMessages(next);
      setReviewOpen(false);
      setReview(null);
      setReviewTurns([]);
      setReviewQuestion("");
      setReviewError("");
      setStatus("speaking");
      ttsRef.current.speak({ text: reply, emotion: data.voice?.emotion, intensity: data.voice?.intensity, speed: data.voice?.speed, volume: data.voice?.volume, voiceId: selectedVoiceId || undefined }, {
        onEnd: () => resumeListening(),
        onError: (message) => {
          setNotice(message);
          resumeListening();
        },
        onMetrics: (metrics) => setTtsDebug(metrics),
      });
    } catch {
      setNotice("连接出了点问题，重新试试？");
      if (conversationActiveRef.current) resumeListening();
      else setStatus("idle");
    }
  };

  const submitText = (value: string) => {
    const text = value.trim();
    if (!text || status === "thinking" || status === "speaking") return;
    const baseHistory = [...historyRef.current, { role: "user", content: text } satisfies ChatMessage];
    updateMessages(baseHistory);
    setTextDraft("");
    void requestReply(text, baseHistory);
  };

  const startListening = () => {
    if (!conversationActiveRef.current) return;
    setNotice("");
    setInterimText("");
    if (!asrRef.current.isSupported()) {
      conversationActiveRef.current = false;
      setConversationActive(false);
      setVoiceInputSupported(false);
      setStatus("idle");
      setNotice("当前浏览器不支持网页语音识别，已切换为文字对话。微信内置浏览器请用文字发送，或在系统浏览器打开。");
      return;
    }
    setStatus("listening");
    asrRef.current.start((text, isFinal) => {
      setInterimText(text);
      if (!isFinal) return;
      asrRef.current.stop();
      setInterimText("");
      if (!text) { setNotice("刚刚没听清，再说一次？"); resumeListening(); return; }
      const baseHistory = [...historyRef.current, { role: "user", content: text } satisfies ChatMessage];
      updateMessages(baseHistory);
      void requestReply(text, baseHistory);
    }, (message) => {
      conversationActiveRef.current = false;
      setConversationActive(false);
      setNotice(message);
      setStatus("idle");
      setInterimText("");
    }, () => {
      if (!conversationActiveRef.current) setStatus((current) => current === "listening" ? "idle" : current);
    });
  };

  const resumeListening = () => {
    if (!conversationActiveRef.current) return;
    setStatus("listening");
    window.setTimeout(() => {
      if (conversationActiveRef.current) startListening();
    }, 160);
  };

  const startVoiceConversation = () => {
    conversationActiveRef.current = true;
    setConversationActive(true);
    resumeListening();
  };

  const endVoiceConversation = () => {
    conversationActiveRef.current = false;
    setConversationActive(false);
    asrRef.current.stop();
    ttsRef.current.stop();
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
            <span className="text-xs tracking-[0.18em] text-[#9f9795]">VOICE / 01</span>
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
          <p className="border-t border-white/10 pt-4 text-xs leading-5 text-[#746c6a]">当前版本建议使用 Chrome 浏览器 · 对话只保存在本次页面会话中</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-[100dvh] bg-[#141313] text-[#f4efeb]">
      <div className="mx-auto flex min-h-[100dvh] max-w-3xl flex-col px-5 pb-6 pt-5 sm:px-8">
        <header className="flex items-center justify-between border-b border-white/10 pb-4">
          <div className="flex items-center gap-3"><Avatar small gender={characterGender} /><div><p className="text-sm font-medium">{characterName}</p><p className="text-xs text-[#9f9795]">你的伴侣</p></div></div>
          <button type="button" onClick={resetConversation} className="text-xs text-[#9f9795] transition hover:text-[#f4efeb]">重新开始</button>
        </header>
        <section className="flex flex-1 flex-col items-center pt-11 sm:pt-14">
          <div className="flex flex-col items-center"><div className={`relative rounded-full ${status === "listening" ? "breathing" : ""}`}><Avatar gender={characterGender} /></div><p className="mt-6 text-sm text-[#d1c7c4]">{STATUS_COPY[status].replace("小满", characterName)}</p>{status === "listening" && interimText && <p className="mt-3 max-w-xs text-center text-xs leading-5 text-[#a9a09e]">“{interimText}”</p>}<div className="mt-3 h-8">{status === "speaking" ? <Wave /> : status === "thinking" ? <div className="flex h-8 items-center gap-1"><i className="h-1.5 w-1.5 rounded-full bg-[#e98972] motion-safe:animate-bounce" /><i className="h-1.5 w-1.5 rounded-full bg-[#e98972] motion-safe:animate-bounce [animation-delay:120ms]" /><i className="h-1.5 w-1.5 rounded-full bg-[#e98972] motion-safe:animate-bounce [animation-delay:240ms]" /></div> : <span className="text-xs text-[#756d6b]">{scenario.shortTitle}</span>}</div></div>
          <div className="mt-10 w-full max-w-xl space-y-4" aria-live="polite">
            {visibleMessages.map((message, index) => <div key={`${message.role}-${index}-${message.content.slice(0, 8)}`} className={`flex items-start gap-3 ${message.role === "user" ? "justify-end" : "justify-start"}`}>{message.role === "assistant" && <Avatar small gender={characterGender} />}<div className={`max-w-[78%] rounded-2xl px-4 py-3 text-sm leading-6 ${message.role === "user" ? "rounded-br-md bg-[#e98972] text-[#241615]" : "rounded-bl-md bg-[#211e1d] text-[#ded4d1]"}`}><span className="mb-1 block text-[10px] tracking-[0.12em] opacity-50">{message.role === "user" ? "我" : characterName}</span>{message.content}</div></div>)}
          </div>
          {hasUserTurn && status !== "thinking" && <div className="mt-7 w-full max-w-xl"><button type="button" onClick={openReview} aria-expanded={reviewOpen} className="flex w-full items-center justify-between rounded-2xl border border-white/10 bg-[#1b1818] px-4 py-3 text-left transition hover:border-[#e98972]/40 hover:bg-[#211e1d] active:scale-[.99]"><span><span className="block text-sm text-[#f4efeb]">情绪复盘</span><span className="mt-1 block text-xs text-[#817876]">看看刚刚真正发生了什么</span></span><span className="text-lg text-[#e98972]">{reviewOpen ? "⌃" : "→"}</span></button>{reviewOpen && <EmotionReviewPanel review={review} turns={reviewTurns} question={reviewQuestion} loading={reviewLoading} error={reviewError} onQuestionChange={setReviewQuestion} onContinue={() => void requestReview(reviewQuestion)} onRetry={() => void requestReview()} onClose={() => setReviewOpen(false)} />}</div>}
        </section>
        <footer className="mt-8 flex flex-col items-center">
          {voiceInputSupported ? <>
            <button type="button" onClick={handleMic} aria-label={conversationActive ? "结束持续语音对话" : "开始持续语音对话"} className={`relative flex h-20 w-20 items-center justify-center rounded-full text-[#241615] shadow-2xl shadow-black/20 transition active:scale-[.96] ${conversationActive ? "breathing bg-[#f6a08b]" : "bg-[#e98972] hover:bg-[#f6a08b]"}`}><span className="mic-glyph" /></button>
            <p className="mt-5 text-xs text-[#817876]">{conversationActive ? `持续对话中 · ${characterName}说完会继续听` : "点击开始持续语音对话"}</p>
          </> : <form onSubmit={(event) => { event.preventDefault(); submitText(textDraft); }} className="w-full max-w-xl rounded-2xl border border-white/10 bg-[#1b1818] p-3">
            <div className="flex gap-2">
              <input value={textDraft} onChange={(event) => setTextDraft(event.target.value)} placeholder={`先输入一句，和${characterName}聊聊……`} className="min-w-0 flex-1 rounded-xl border border-white/10 bg-[#141313] px-3 py-3 text-sm text-[#f4efeb] outline-none placeholder:text-[#756d6b] focus:border-[#e98972]/60" aria-label={`输入给${characterName}的话`} />
              <button type="submit" disabled={!textDraft.trim() || status === "thinking" || status === "speaking"} className="rounded-xl bg-[#e98972] px-4 py-2 text-sm font-medium text-[#241615] transition hover:bg-[#f6a08b] disabled:cursor-not-allowed disabled:opacity-40">发送</button>
            </div>
            <p className="mt-2 px-1 text-[11px] leading-5 text-[#817876]">麦克风：{microphoneState === "granted" ? "已授权" : microphoneState === "denied" ? "未授权" : "未检测到"}。当前浏览器不能把麦克风转成文字，文字对话仍然可用。</p>
          </form>}
          {notice && <div className="mt-4 flex items-center gap-3 rounded-full border border-[#e98972]/30 bg-[#e98972]/10 px-4 py-2 text-xs text-[#f6a08b]" role="alert">{notice}<button type="button" onClick={() => setNotice("")} className="text-[#f4efeb]">×</button></div>}
          {mode && <p className="mt-3 text-[10px] text-[#5f5856]">{mode === "deepseek" ? "DeepSeek 已连接" : mode === "safety" ? "Safety Override 已接管" : "当前为本地演示回复"}</p>}
          {debugEnabled && ttsDebug && <details open className="mt-4 w-full max-w-xl rounded-2xl border border-white/10 bg-[#1b1818] p-4 text-xs text-[#b7adab]"><summary className="cursor-pointer text-[#e98972]">TTS Debug</summary><div className="mt-3 grid gap-2 sm:grid-cols-2"><p>Provider：{ttsDebug.provider === "volcengine" ? "Doubao / 火山引擎" : "Browser SpeechSynthesis fallback"}</p><p>Voice：{ttsDebug.voice}</p><p>Emotion：{ttsDebug.emotion || "neutral"}</p><p>Intensity：{ttsDebug.intensity ?? "-"}</p><p>Streaming：{ttsDebug.streaming ? "yes" : "no"}</p><p>首包延迟：{ttsDebug.firstByteLatencyMs == null ? "-" : `${ttsDebug.firstByteLatencyMs} ms`}</p><p>总耗时：{ttsDebug.totalLatencyMs == null ? "播放中" : `${ttsDebug.totalLatencyMs} ms`}</p>{ttsDebug.fallbackReason && <p className="sm:col-span-2 text-[#f6a08b]">Fallback：{ttsDebug.fallbackReason}</p>}</div></details>}
          {debugEnabled && debugInfo && <details open className="mt-4 w-full max-w-xl rounded-2xl border border-white/10 bg-[#1b1818] p-4 text-xs text-[#b7adab]"><summary className="cursor-pointer text-[#e98972]">Conflict Engine Debug</summary><div className="mt-3 grid gap-2 sm:grid-cols-2"><p>User Strategy：{debugInfo.userStrategy.join(" + ")}</p><p>Confidence：{debugInfo.confidence}</p><p>Intensity：{debugInfo.emotion.conflictIntensity}/5</p><p>Selected：{debugInfo.selectedStrategy.primary}{debugInfo.selectedStrategy.secondary.length ? ` + ${debugInfo.selectedStrategy.secondary.join(" + ")}` : ""}</p><p className="sm:col-span-2">Emotion：anger {debugInfo.emotion.anger} · hurt {debugInfo.emotion.hurt} · trust {debugInfo.emotion.trust} · connection {debugInfo.emotion.connection}</p><p className="sm:col-span-2">Retrieved：{debugInfo.retrievedEpisodeIds.join(", ")}</p><p className="sm:col-span-2">Validator：{debugInfo.validator.valid ? "通过" : debugInfo.validator.issues.join(", ")}</p>{debugInfo.relationship && <><p>Relationship State：{debugInfo.relationship.currentState}</p><p>Previous State：{debugInfo.relationship.previousState}</p><p>Transition Confidence：{debugInfo.relationship.stateConfidence}</p><p>State Duration：{debugInfo.relationship.stateDuration}</p><p>Conflict Locked：{debugInfo.relationship.conflictLocked ? "yes" : "no"}</p><p className="sm:col-span-2">Transition：{debugInfo.relationship.transitionReason}</p></>}{debugInfo.reflection && <><p>Reflection Depth：{debugInfo.reflection.insightDepth}/3</p><p>Mutual Understanding：{debugInfo.reflection.mutualUnderstanding}</p><p>Surface Conflict：{debugInfo.reflection.surfaceConflict || "—"}</p><p>Trigger：{debugInfo.reflection.triggerIdentified || "—"}</p><p>Underlying Need：{debugInfo.reflection.underlyingNeed || "—"}</p><p>User Contribution：{debugInfo.reflection.userContribution || "—"}</p><p>Character Contribution：{debugInfo.reflection.characterContribution || "—"}</p><p className="sm:col-span-2">Interaction Pattern：{debugInfo.reflection.interactionPattern || "—"}</p></>}{debugInfo.safety && <><p>Safety Active：{debugInfo.safety.active ? "yes" : "no"}</p><p>Risk Level：{debugInfo.safety.riskLevel}</p><p>Safety Confidence：{debugInfo.safety.confidence}</p><p className="sm:col-span-2">Safety Signals：{debugInfo.safety.signals.join(", ") || "none"}</p></>}{debugInfo.userState && <><p className="sm:col-span-2">User State：hurt {debugInfo.userState.hurt} · anger {debugInfo.userState.anger} · sadness {debugInfo.userState.sadness} · aggression {debugInfo.userState.aggression} · withdrawal {debugInfo.userState.withdrawal} · openness {debugInfo.userState.openness}</p><p className="sm:col-span-2">Intent：{debugInfo.userState.intent.join(" + ")} · Trend：{debugInfo.userState.trend}</p><p>Voice Emotion：{debugInfo.userState.voiceSignals}</p><p>Visual Emotion：{debugInfo.userState.visualSignals}</p></>}</div></details>}
        </footer>
      </div>
    </main>
  );
}

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

type DebugInfo = {
  userStrategy: string[];
  confidence: number;
  emotion: { anger: number; hurt: number; disappointment: number; anxiety: number; contempt: number; trust: number; resentment: number; connection: number; conflictIntensity: number };
  selectedStrategy: { primary: string; secondary: string[]; rationale: string };
  retrievedEpisodeIds: string[];
  validator: { valid: boolean; issues: string[] };
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

function Avatar({ small = false }: { small?: boolean }) {
  return (
    <div className={`relative shrink-0 overflow-hidden rounded-full bg-[#d7b9aa] ${small ? "h-11 w-11" : "h-44 w-44 sm:h-52 sm:w-52"}`} aria-label="小满的头像">
      <div className="absolute left-[18%] top-[9%] h-[48%] w-[64%] rounded-[48%_48%_42%_42%] bg-[#372828]" />
      <div className="absolute left-[24%] top-[20%] h-[48%] w-[52%] rounded-[47%_47%_42%_42%] bg-[#f1c2a7]" />
      <div className="absolute left-[34%] top-[40%] h-[3px] w-[7px] rounded-full bg-[#382526]" />
      <div className="absolute right-[34%] top-[40%] h-[3px] w-[7px] rounded-full bg-[#382526]" />
      <div className="absolute left-1/2 top-[49%] h-[8px] w-[25px] -translate-x-1/2 rounded-[0_0_12px_12px] border-b-2 border-[#9c5f5a]" />
      <div className="absolute bottom-[-5%] left-[15%] h-[34%] w-[70%] rounded-[45%_45%_0_0] bg-[#eb8e75]" />
      <div className="absolute bottom-[8%] left-[37%] h-[8px] w-[26%] rounded-full bg-[#f5b09b]/60" />
    </div>
  );
}

function Wave() {
  return <div className="wave flex h-8 items-center justify-center gap-1" aria-hidden="true"><span /><span /><span /><span /><span /></div>;
}

function VoiceSelector({ voices, selectedVoiceId, onChange }: { voices: VoiceOption[]; selectedVoiceId: string; onChange: (voiceId: string) => void }) {
  const selectedVoice = voices.find((voice) => voice.id === selectedVoiceId) || voices[0];
  if (!selectedVoice) return null;
  return (
    <div className="mt-5 rounded-2xl border border-white/10 bg-[#1b1818] p-4 text-left">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><p className="text-xs tracking-[0.12em] text-[#9f9795]">小满的声音</p><p className="mt-1 text-sm text-[#f4efeb]">{selectedVoice.name}</p></div>
        <a href={sitePath("/voice-lab")} className="text-xs text-[#f6a08b] underline decoration-[#f6a08b]/30 underline-offset-4">试听更多音色</a>
      </div>
      <select value={selectedVoiceId || selectedVoice.id} onChange={(event) => onChange(event.target.value)} className="mt-3 w-full rounded-xl border border-white/10 bg-[#141313] px-3 py-3 text-sm text-[#f4efeb] outline-none transition focus:border-[#e98972]">
        {voices.map((voice) => <option key={voice.id} value={voice.id}>{voice.gender === "male" ? "男声 · " : "女声 · "}{voice.name}</option>)}
      </select>
      <p className="mt-2 text-[11px] leading-5 text-[#746c6a]">切换后，下一次小满回复会使用这个声音。</p>
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
  const [conversationActive, setConversationActive] = useState(false);
  const [debugEnabled, setDebugEnabled] = useState(false);
  const [debugInfo, setDebugInfo] = useState<DebugInfo | null>(null);
  const [ttsDebug, setTtsDebug] = useState<TTSMetrics | null>(null);
  const [selectedVoiceId, setSelectedVoiceId] = useState("");
  const [voiceOptions, setVoiceOptions] = useState<VoiceOption[]>([]);
  const [mode, setMode] = useState<"mock" | "deepseek" | "fallback" | "">("");
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
  const visibleMessages = messages.slice(-8);
  const hasUserTurn = messages.some((message) => message.role === "user");

  useEffect(() => {
    setDebugEnabled(new URLSearchParams(window.location.search).get("debug") === "true");
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
    if (navigator.mediaDevices?.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((track) => track.stop());
      } catch {
        setNotice("需要麦克风权限，才能和小满说话。");
        return;
      }
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
        body: JSON.stringify({ history: baseHistory.slice(-20), userMessage: userText, sceneContext: scenario.context, scenarioId: scenario.id, debug: debugEnabled }),
      });
      const data = await response.json() as { text?: string; reply?: string; mode?: "mock" | "deepseek" | "fallback"; error?: string; debug?: DebugInfo; voice?: { emotion?: TTSRequest["emotion"]; intensity?: number } };
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
      ttsRef.current.speak({ text: reply, emotion: data.voice?.emotion, intensity: data.voice?.intensity, voiceId: selectedVoiceId || undefined }, {
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

  const startListening = () => {
    if (!conversationActiveRef.current) return;
    setNotice("");
    setInterimText("");
    if (!asrRef.current.isSupported()) {
      setNotice("当前浏览器不支持语音识别，建议使用 Chrome 浏览器。");
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
    if (conversationActiveRef.current) endVoiceConversation();
    else startVoiceConversation();
  };

  if (!started) {
    return (
      <main className="min-h-[100dvh] bg-[#141313] px-5 py-6 text-[#f4efeb] sm:px-8">
        <div className="mx-auto flex min-h-[calc(100dvh-3rem)] max-w-5xl flex-col">
          <header className="flex items-center justify-between border-b border-white/10 pb-5">
            <div className="flex items-center gap-3"><Avatar small /><div><p className="text-sm font-medium">小满</p><p className="text-xs text-[#9f9795]">你的伴侣</p></div></div>
            <span className="text-xs tracking-[0.18em] text-[#9f9795]">VOICE / 01</span>
          </header>
          <section className="grid flex-1 items-center gap-12 py-14 lg:grid-cols-[.85fr_1.15fr] lg:gap-24">
            <div className="relative flex justify-center lg:justify-start"><div className="absolute top-10 h-64 w-64 rounded-full bg-[#e98972]/10 blur-3xl" /><div className="relative"><Avatar /></div></div>
            <div className="max-w-xl">
              <p className="mb-5 text-sm tracking-[0.16em] text-[#e98972]">一场只用声音发生的关系</p>
              <h1 className="max-w-lg text-4xl font-medium leading-[1.08] tracking-[-0.045em] sm:text-6xl">有些话，面对面反而说不出来。</h1>
              <p className="mt-7 max-w-md text-base leading-7 text-[#b7adab]">小满会听你说，也会把刚刚发生的事放在心上。选择一个今晚的开场。</p>
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
          <div className="flex items-center gap-3"><Avatar small /><div><p className="text-sm font-medium">小满</p><p className="text-xs text-[#9f9795]">你的伴侣</p></div></div>
          <button type="button" onClick={resetConversation} className="text-xs text-[#9f9795] transition hover:text-[#f4efeb]">重新开始</button>
        </header>
        <section className="flex flex-1 flex-col items-center pt-11 sm:pt-14">
          <div className="flex flex-col items-center"><div className={`relative rounded-full ${status === "listening" ? "breathing" : ""}`}><Avatar /></div><p className="mt-6 text-sm text-[#d1c7c4]">{STATUS_COPY[status]}</p>{status === "listening" && interimText && <p className="mt-3 max-w-xs text-center text-xs leading-5 text-[#a9a09e]">“{interimText}”</p>}<div className="mt-3 h-8">{status === "speaking" ? <Wave /> : status === "thinking" ? <div className="flex h-8 items-center gap-1"><i className="h-1.5 w-1.5 rounded-full bg-[#e98972] motion-safe:animate-bounce" /><i className="h-1.5 w-1.5 rounded-full bg-[#e98972] motion-safe:animate-bounce [animation-delay:120ms]" /><i className="h-1.5 w-1.5 rounded-full bg-[#e98972] motion-safe:animate-bounce [animation-delay:240ms]" /></div> : <span className="text-xs text-[#756d6b]">{scenario.shortTitle}</span>}</div></div>
          <div className="mt-10 w-full max-w-xl space-y-4" aria-live="polite">
            {visibleMessages.map((message, index) => <div key={`${message.role}-${index}-${message.content.slice(0, 8)}`} className={`flex items-start gap-3 ${message.role === "user" ? "justify-end" : "justify-start"}`}>{message.role === "assistant" && <Avatar small />}<div className={`max-w-[78%] rounded-2xl px-4 py-3 text-sm leading-6 ${message.role === "user" ? "rounded-br-md bg-[#e98972] text-[#241615]" : "rounded-bl-md bg-[#211e1d] text-[#ded4d1]"}`}><span className="mb-1 block text-[10px] tracking-[0.12em] opacity-50">{message.role === "user" ? "我" : "小满"}</span>{message.content}</div></div>)}
          </div>
          {hasUserTurn && status !== "thinking" && <div className="mt-7 w-full max-w-xl"><button type="button" onClick={openReview} aria-expanded={reviewOpen} className="flex w-full items-center justify-between rounded-2xl border border-white/10 bg-[#1b1818] px-4 py-3 text-left transition hover:border-[#e98972]/40 hover:bg-[#211e1d] active:scale-[.99]"><span><span className="block text-sm text-[#f4efeb]">情绪复盘</span><span className="mt-1 block text-xs text-[#817876]">看看刚刚真正发生了什么</span></span><span className="text-lg text-[#e98972]">{reviewOpen ? "⌃" : "→"}</span></button>{reviewOpen && <EmotionReviewPanel review={review} turns={reviewTurns} question={reviewQuestion} loading={reviewLoading} error={reviewError} onQuestionChange={setReviewQuestion} onContinue={() => void requestReview(reviewQuestion)} onRetry={() => void requestReview()} onClose={() => setReviewOpen(false)} />}</div>}
        </section>
        <footer className="mt-8 flex flex-col items-center">
          <button type="button" onClick={handleMic} aria-label={conversationActive ? "结束持续语音对话" : "开始持续语音对话"} className={`relative flex h-20 w-20 items-center justify-center rounded-full text-[#241615] shadow-2xl shadow-black/20 transition active:scale-[.96] ${conversationActive ? "breathing bg-[#f6a08b]" : "bg-[#e98972] hover:bg-[#f6a08b]"}`}><span className="mic-glyph" /></button>
          <p className="mt-5 text-xs text-[#817876]">{conversationActive ? "持续对话中 · 小满说完会继续听" : "点击开始持续语音对话"}</p>
          {notice && <div className="mt-4 flex items-center gap-3 rounded-full border border-[#e98972]/30 bg-[#e98972]/10 px-4 py-2 text-xs text-[#f6a08b]" role="alert">{notice}<button type="button" onClick={() => setNotice("")} className="text-[#f4efeb]">×</button></div>}
          {mode && <p className="mt-3 text-[10px] text-[#5f5856]">{mode === "deepseek" ? "DeepSeek 已连接" : "当前为本地演示回复"}</p>}
          {debugEnabled && ttsDebug && <details open className="mt-4 w-full max-w-xl rounded-2xl border border-white/10 bg-[#1b1818] p-4 text-xs text-[#b7adab]"><summary className="cursor-pointer text-[#e98972]">TTS Debug</summary><div className="mt-3 grid gap-2 sm:grid-cols-2"><p>Provider：{ttsDebug.provider === "volcengine" ? "Doubao / 火山引擎" : "Browser SpeechSynthesis fallback"}</p><p>Voice：{ttsDebug.voice}</p><p>Emotion：{ttsDebug.emotion || "neutral"}</p><p>Intensity：{ttsDebug.intensity ?? "-"}</p><p>Streaming：{ttsDebug.streaming ? "yes" : "no"}</p><p>首包延迟：{ttsDebug.firstByteLatencyMs == null ? "-" : `${ttsDebug.firstByteLatencyMs} ms`}</p><p>总耗时：{ttsDebug.totalLatencyMs == null ? "播放中" : `${ttsDebug.totalLatencyMs} ms`}</p>{ttsDebug.fallbackReason && <p className="sm:col-span-2 text-[#f6a08b]">Fallback：{ttsDebug.fallbackReason}</p>}</div></details>}
          {debugEnabled && debugInfo && <details open className="mt-4 w-full max-w-xl rounded-2xl border border-white/10 bg-[#1b1818] p-4 text-xs text-[#b7adab]"><summary className="cursor-pointer text-[#e98972]">Conflict Engine Debug</summary><div className="mt-3 grid gap-2 sm:grid-cols-2"><p>User Strategy：{debugInfo.userStrategy.join(" + ")}</p><p>Confidence：{debugInfo.confidence}</p><p>Intensity：{debugInfo.emotion.conflictIntensity}/5</p><p>Selected：{debugInfo.selectedStrategy.primary}{debugInfo.selectedStrategy.secondary.length ? ` + ${debugInfo.selectedStrategy.secondary.join(" + ")}` : ""}</p><p className="sm:col-span-2">Emotion：anger {debugInfo.emotion.anger} · hurt {debugInfo.emotion.hurt} · trust {debugInfo.emotion.trust} · connection {debugInfo.emotion.connection}</p><p className="sm:col-span-2">Retrieved：{debugInfo.retrievedEpisodeIds.join(", ")}</p><p className="sm:col-span-2">Validator：{debugInfo.validator.valid ? "通过" : debugInfo.validator.issues.join(", ")}</p></div></details>}
        </footer>
      </div>
    </main>
  );
}

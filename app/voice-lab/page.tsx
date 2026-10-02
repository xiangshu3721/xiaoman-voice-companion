"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { DoubaoTTSProvider, TTS_VOICE_STORAGE_KEY, type TTSMetrics } from "@/lib/providers";
import { apiUrl, sitePath } from "@/lib/api";
import type { SpeakerCapability } from "@/src/tts/types";

const SAMPLE_TEXT = "行，你忙，你最忙。";
const EMOTIONS = ["neutral", "angry", "sad", "happy", "sarcastic", "softening", "hurt_anger", "cold_anger"];
const EMOTION_LABELS: Record<string, string> = {
  neutral: "自然",
  angry: "愤怒",
  sad: "受伤 / 难过",
  happy: "开心",
  sarcastic: "冷讽（映射）",
  softening: "软化（映射）",
  hurt_anger: "委屈愤怒（映射）",
  cold_anger: "心冷（映射）",
};
const PRESETS = [
  ["A", "轻微不爽", "你又来了。", "annoyed"],
  ["B", "冷讽", "哦，你现在知道回消息了？", "sarcastic_anger"],
  ["C", "阴阳", "对对对，你最忙。", "sarcastic_anger"],
  ["D", "爆发", "你到底有没有听我说话？！", "explosive_anger"],
  ["E", "委屈愤怒", "我等你那么久，你回来就跟我说这个？", "hurt_anger"],
  ["F", "心冷", "行，随便你。", "cold_anger"],
  ["G", "难以置信", "不是……你认真的？", "disbelief"],
  ["H", "爆粗", "你他妈能不能先让我把话说完？", "explosive_anger"],
  ["I", "软化", "……行了，我知道了，我还气一点。", "softening"],
  ["J", "撒娇式修复", "行吧，给我买点好吃的，我考虑原谅你。", "playful"],
] as const;

type FilterGender = "all" | "female" | "male";

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function newSectionId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `voice-lab-${Date.now()}`;
}

export default function VoiceLab() {
  const providerRef = useRef(new DoubaoTTSProvider());
  const [speakers, setSpeakers] = useState<SpeakerCapability[]>([]);
  const [configured, setConfigured] = useState(false);
  const [selectedVoice, setSelectedVoice] = useState("");
  const [gender, setGender] = useState<FilterGender>("all");
  const [emotionOnly, setEmotionOnly] = useState(true);
  const [emotion, setEmotion] = useState("neutral");
  const [scale, setScale] = useState(3);
  const [speechRate, setSpeechRate] = useState(0);
  const [loudnessRate, setLoudnessRate] = useState(0);
  const [contextText, setContextText] = useState("这是情侣正在争吵中的一句话。表面平静但字里带刺，关键词咬重，尾音略往下压，像熟悉的伴侣在说话，不要播音腔。");
  const [useSectionContext, setUseSectionContext] = useState(true);
  const [text, setText] = useState(SAMPLE_TEXT);
  const [playing, setPlaying] = useState("");
  const [metrics, setMetrics] = useState<TTSMetrics | null>(null);
  const [notice, setNotice] = useState("");
  const [probing, setProbing] = useState("");

  useEffect(() => {
    void fetch(apiUrl("/api/tts/config"))
      .then((response) => response.json())
      .then((data: { configured?: boolean; speakers?: SpeakerCapability[] }) => {
        const nextSpeakers = data.speakers || [];
        setConfigured(Boolean(data.configured));
        setSpeakers(nextSpeakers);
        const storedVoice = window.localStorage.getItem(TTS_VOICE_STORAGE_KEY);
        setSelectedVoice(storedVoice && nextSpeakers.some((speaker) => speaker.speakerId === storedVoice) ? storedVoice : nextSpeakers[0]?.speakerId || "");
      })
      .catch(() => setNotice("音色能力读取失败，请刷新页面。"));
    return () => providerRef.current.stop();
  }, []);

  const selectedSpeaker = speakers.find((speaker) => speaker.speakerId === selectedVoice);
  const visibleSpeakers = useMemo(() => speakers.filter((speaker) => {
    if (gender !== "all" && speaker.gender !== gender) return false;
    if (emotionOnly && !speaker.supportsEmotion) return false;
    return true;
  }), [emotionOnly, gender, speakers]);

  useEffect(() => {
    if (selectedSpeaker && (!emotionOnly || selectedSpeaker.supportsEmotion)) return;
    const next = visibleSpeakers[0] || speakers.find((speaker) => speaker.gender === gender) || speakers[0];
    if (next) setSelectedVoice(next.speakerId);
  }, [emotionOnly, gender, selectedSpeaker, speakers, visibleSpeakers]);

  const chooseVoice = (voiceId: string) => {
    providerRef.current.stop();
    setPlaying("");
    setNotice("");
    setSelectedVoice(voiceId);
    window.localStorage.setItem(TTS_VOICE_STORAGE_KEY, voiceId);
  };

  const play = (nextEmotion = emotion, voiceId = selectedVoice, nextText = text) => {
    if (!voiceId || !nextText.trim()) return;
    providerRef.current.stop();
    setNotice("");
    setPlaying(`${voiceId}:${nextEmotion}`);
    providerRef.current.unlockAudio();
    const speaker = speakers.find((item) => item.speakerId === voiceId);
    const apiEmotion = speaker?.supportedEmotions.includes(nextEmotion) ? nextEmotion : undefined;
    providerRef.current.speak({
      text: nextText,
      voiceId,
      emotion: apiEmotion as "neutral" | "angry" | "sad" | "happy" | undefined,
      primaryEmotion: nextEmotion,
      intensity: scale / 5,
      emotionScale: scale,
      speechRate: clamp(speechRate, -50, 100),
      loudnessRate: clamp(loudnessRate, -50, 100),
      contextText,
      useSectionContext,
      sectionId: useSectionContext ? newSectionId() : undefined,
    }, {
      onEnd: () => setPlaying(""),
      onError: (message) => { setNotice(message); setPlaying(""); },
      onMetrics: setMetrics,
    });
  };

  const probe = async (speakerId: string) => {
    setProbing(speakerId);
    setNotice("");
    try {
      const response = await fetch(apiUrl("/api/tts/probe"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ speakerId, emotions: ["angry", "sad", "happy"] }) });
      const data = await response.json() as { error?: string; results?: Array<{ emotion: string; success: boolean }>; speaker?: SpeakerCapability };
      if (!response.ok) throw new Error(data.error || "Runtime Probe 失败");
      if (data.speaker) setSpeakers((current) => current.map((item) => item.speakerId === speakerId ? data.speaker as SpeakerCapability : item));
      setNotice(`已完成 ${speakerId} 的 Runtime Probe：${(data.results || []).filter((item) => item.success).map((item) => item.emotion).join("、") || "没有确认成功的 Emotion"}`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Runtime Probe 失败");
    } finally {
      setProbing("");
    }
  };

  return (
    <main className="min-h-[100dvh] bg-[#141313] px-5 py-6 text-[#f4efeb] sm:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-5">
          <div><p className="text-xs tracking-[0.18em] text-[#e98972]">VOICE LAB / SEED-TTS 2.0</p><h1 className="mt-2 text-2xl font-medium">小满的声音与情绪试听</h1><p className="mt-2 text-sm text-[#9f9795]">只显示服务端 Registry 已登记的候选音色；未验证能力不会被伪装成支持。</p></div>
          <div className="flex items-center gap-4"><span className={`rounded-full px-3 py-1 text-xs ${configured ? "bg-emerald-400/10 text-emerald-300" : "bg-[#e98972]/10 text-[#f6a08b]"}`}>{configured ? "火山凭证已配置" : "未配置 · 将 fallback"}</span><a href={sitePath("/")} className="text-xs text-[#9f9795] transition hover:text-[#f4efeb]">返回对话</a></div>
        </header>

        <section className="mt-6 rounded-3xl border border-white/10 bg-[#1b1818] p-5 sm:p-7">
          <div className="flex flex-wrap items-center justify-between gap-4"><div><p className="text-xs tracking-[0.14em] text-[#9f9795]">音色筛选</p><h2 className="mt-2 text-xl">先选声，再调情绪</h2></div><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={emotionOnly} onChange={(event) => setEmotionOnly(event.target.checked)} /> 仅显示支持 Emotion</label></div>
          <div className="mt-5 flex flex-wrap gap-2">{(["all", "female", "male"] as FilterGender[]).map((item) => <button key={item} type="button" onClick={() => setGender(item)} className={`rounded-full border px-4 py-2 text-xs ${gender === item ? "border-[#e98972] bg-[#e98972]/15 text-[#f6a08b]" : "border-white/10 text-[#9f9795]"}`}>{item === "all" ? "全部" : item === "female" ? "女声" : "男声"}</button>)}</div>
          <div className="mt-5 grid gap-3 md:grid-cols-2">{visibleSpeakers.map((speaker) => <div key={speaker.speakerId} className={`rounded-2xl border p-4 ${selectedVoice === speaker.speakerId ? "border-[#e98972] bg-[#e98972]/10" : "border-white/10"}`}><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><p className="font-medium">{speaker.displayName}</p><span className="rounded-full bg-white/5 px-2 py-1 text-[10px] text-[#b7adab]">{speaker.gender === "female" ? "女" : "男"}</span><span className={`rounded-full px-2 py-1 text-[10px] ${speaker.verificationStatus === "verified" ? "bg-emerald-400/10 text-emerald-300" : "bg-white/5 text-[#9f9795]"}`}>{speaker.verificationStatus === "verified" ? "Runtime 已验证" : "UNVERIFIED"}</span></div><p className="mt-1 break-all text-xs text-[#817876]">{speaker.speakerId}</p><p className="mt-2 text-xs leading-5 text-[#9f9795]">Emotion：{speaker.supportsEmotion ? speaker.supportedEmotions.join(" / ") : "未确认"}</p><p className="mt-1 text-[11px] text-[#746c6a]">来源：{speaker.source} · {speaker.verifiedAt ? new Date(speaker.verifiedAt).toLocaleDateString("zh-CN") : "等待探测"}</p></div><div className="flex gap-2"><button type="button" onClick={() => chooseVoice(speaker.speakerId)} className="rounded-full border border-white/15 px-3 py-2 text-xs transition hover:border-[#e98972]">{selectedVoice === speaker.speakerId ? "已选" : "选这个"}</button><button type="button" onClick={() => probe(speaker.speakerId)} disabled={Boolean(probing)} className="rounded-full border border-white/15 px-3 py-2 text-xs disabled:opacity-50">{probing === speaker.speakerId ? "探测中…" : "Probe"}</button><button type="button" onClick={() => play("neutral", speaker.speakerId, SAMPLE_TEXT)} className="rounded-full bg-[#e98972] px-3 py-2 text-xs font-medium text-[#241615]">试听</button></div></div></div>)}{!visibleSpeakers.length && <p className="rounded-2xl border border-dashed border-white/10 px-4 py-6 text-sm text-[#9f9795]">当前筛选没有候选。可以关闭“仅显示支持 Emotion”，查看未验证音色。</p>}</div>
        </section>

        <section className="mt-5 grid gap-5 lg:grid-cols-[1.1fr_.9fr]">
          <div className="rounded-3xl border border-white/10 bg-[#1b1818] p-5 sm:p-7"><p className="text-xs tracking-[0.14em] text-[#9f9795]">试听控制</p><h2 className="mt-2 text-xl">同一句话，分别听不同表达</h2><textarea value={text} onChange={(event) => setText(event.target.value)} className="mt-5 min-h-24 w-full resize-y rounded-2xl border border-white/10 bg-[#141313] p-4 text-base text-[#f4efeb] outline-none focus:border-[#e98972]" maxLength={500} /><div className="mt-4 grid gap-4 sm:grid-cols-2"><label className="text-xs text-[#9f9795]">Emotion<select value={emotion} onChange={(event) => setEmotion(event.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-[#141313] p-3 text-sm text-[#f4efeb]"><option value="neutral">自动 / neutral</option>{(selectedSpeaker?.supportedEmotions.length ? selectedSpeaker.supportedEmotions : EMOTIONS).map((item) => <option key={item} value={item}>{EMOTION_LABELS[item] || item}</option>)}</select></label><label className="text-xs text-[#9f9795]">Emotion Scale：{scale}<input type="range" min="1" max="5" value={scale} onChange={(event) => setScale(Number(event.target.value))} className="mt-3 w-full accent-[#e98972]" /></label><label className="text-xs text-[#9f9795]">Speech Rate：{speechRate}<input type="range" min="-50" max="100" value={speechRate} onChange={(event) => setSpeechRate(Number(event.target.value))} className="mt-3 w-full accent-[#e98972]" /></label><label className="text-xs text-[#9f9795]">Loudness Rate：{loudnessRate}<input type="range" min="-50" max="100" value={loudnessRate} onChange={(event) => setLoudnessRate(Number(event.target.value))} className="mt-3 w-full accent-[#e98972]" /></label></div><label className="mt-4 block text-xs text-[#9f9795]">Context Instruction<textarea value={contextText} onChange={(event) => setContextText(event.target.value)} className="mt-2 min-h-24 w-full rounded-xl border border-white/10 bg-[#141313] p-3 text-sm text-[#f4efeb] outline-none focus:border-[#e98972]" /></label><label className="mt-4 flex items-center gap-2 text-xs text-[#9f9795]"><input type="checkbox" checked={useSectionContext} onChange={(event) => setUseSectionContext(event.target.checked)} /> Section Context ON（同一场景复用 section_id）</label><button type="button" onClick={() => play()} className="mt-5 w-full rounded-2xl bg-[#e98972] px-4 py-4 text-sm font-medium text-[#241615] disabled:opacity-50" disabled={!selectedVoice || !text.trim()}>{playing ? "播放中…" : `试听 ${selectedSpeaker?.displayName || "当前音色"}`}</button></div>

          <div className="rounded-3xl border border-white/10 bg-[#1b1818] p-5 sm:p-7"><p className="text-xs tracking-[0.14em] text-[#9f9795]">预置场景 A—J</p><div className="mt-4 grid gap-2">{PRESETS.map(([key, label, presetText, presetEmotion]) => <button key={key} type="button" onClick={() => { setText(presetText); setEmotion(presetEmotion); setContextText(`这是情侣冲突中的一句${label}表达。保留真实停顿、短句和关键词重音，像熟悉的伴侣正在说话，不要播音腔。`); }} className="rounded-xl border border-white/10 px-3 py-3 text-left transition hover:border-[#e98972] hover:bg-[#e98972]/10"><span className="mr-2 text-[#f6a08b]">{key}</span><span className="text-sm">{label}</span><span className="ml-2 text-xs text-[#817876]">{presetText}</span></button>)}</div><p className="mt-5 text-xs leading-5 text-[#746c6a]">映射情绪不会伪装成供应商原生 emotion；最终请求是否传 emotion，以当前 speaker 的 Runtime Registry 为准。</p></div>
        </section>

        {metrics && <section className="mt-5 rounded-3xl border border-white/10 bg-[#1b1818] p-5 text-xs text-[#b7adab]"><p className="text-[#e98972]">最近一次试听 · Debug</p><div className="mt-3 grid gap-2 sm:grid-cols-2"><p>Provider：{metrics.provider === "volcengine" ? "Doubao / 火山引擎" : "Browser fallback"}</p><p>Voice：{metrics.voice}</p><p>Emotion：{metrics.emotion || "omitted"} · scale {metrics.emotionScale ?? "-"}</p><p>Internal：{metrics.primaryEmotion || "-"}</p><p>Rate：{metrics.speechRate ?? "-"} · Loudness：{metrics.loudnessRate ?? "-"}</p><p>Section：{metrics.sectionId || "-"}</p><p>首包：{metrics.firstByteLatencyMs == null ? "-" : `${metrics.firstByteLatencyMs} ms`}</p><p>总耗时：{metrics.totalLatencyMs == null ? "播放中" : `${metrics.totalLatencyMs} ms`}</p>{metrics.fallbackUsed && <p className="sm:col-span-2 text-[#f6a08b]">Emotion fallback：已通过 context / rate / loudness 继续合成</p>}{metrics.fallbackReason && <p className="sm:col-span-2 text-[#f6a08b]">Fallback：{metrics.fallbackReason}</p>}{metrics.contextText && <p className="sm:col-span-2 leading-5">Context：{metrics.contextText}</p>}</div></section>}
        {notice && <p role="alert" className="mt-5 rounded-2xl border border-[#e98972]/30 bg-[#e98972]/10 px-4 py-3 text-sm text-[#f6a08b]">{notice}</p>}
      </div>
    </main>
  );
}

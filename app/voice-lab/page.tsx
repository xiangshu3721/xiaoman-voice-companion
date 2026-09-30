"use client";

import { useEffect, useRef, useState } from "react";
import { DoubaoTTSProvider, TTS_VOICE_STORAGE_KEY, type TTSMetrics, type TTSRequest } from "@/lib/providers";
import { apiUrl, sitePath } from "@/lib/api";

const SAMPLE_TEXT = "行，你忙，你最忙。";
const EMOTIONS: Array<NonNullable<TTSRequest["emotion"]>> = ["neutral", "sarcastic", "annoyed", "angry", "hurt", "cold"];
const EMOTION_LABELS: Record<string, string> = {
  neutral: "neutral · 自然",
  sarcastic: "sarcastic · 讽刺",
  annoyed: "annoyed · 不耐烦",
  angry: "angry · 压着火",
  hurt: "hurt · 受伤",
  cold: "cold · 冷淡",
};

type Voice = { id: string; name: string; description: string; gender?: "female" | "male" };

export default function VoiceLab() {
  const providerRef = useRef(new DoubaoTTSProvider());
  const [voices, setVoices] = useState<Voice[]>([]);
  const [configured, setConfigured] = useState(false);
  const [selectedVoice, setSelectedVoice] = useState("");
  const [playing, setPlaying] = useState("");
  const [metrics, setMetrics] = useState<TTSMetrics | null>(null);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    void fetch(apiUrl("/api/tts/config")).then((response) => response.json()).then((data: { configured?: boolean; voices?: Voice[] }) => {
      const nextVoices = data.voices || [];
      setConfigured(Boolean(data.configured));
      setVoices(nextVoices);
      const storedVoice = window.localStorage.getItem(TTS_VOICE_STORAGE_KEY);
      setSelectedVoice(storedVoice && nextVoices.some((voice) => voice.id === storedVoice) ? storedVoice : nextVoices[0]?.id || "");
    }).catch(() => setNotice("音色配置读取失败，请刷新页面。"));
    return () => providerRef.current.stop();
  }, []);

  const selectVoice = (voiceId: string) => {
    setSelectedVoice(voiceId);
    window.localStorage.setItem(TTS_VOICE_STORAGE_KEY, voiceId);
  };

  const play = (emotion: NonNullable<TTSRequest["emotion"]>, voiceId = selectedVoice) => {
    setNotice("");
    setPlaying(`${voiceId}:${emotion}`);
    // 每次试听都是明确的用户手势；移动浏览器需要在这里重新解锁
    // Web Audio，否则切换音色后异步 fetch 完成时可能被静默拦截。
    providerRef.current.unlockAudio();
    providerRef.current.speak({ text: SAMPLE_TEXT, emotion, intensity: emotion === "neutral" ? 0.25 : 0.7, voiceId }, {
      onEnd: () => setPlaying(""),
      onError: (message) => { setNotice(message); setPlaying(""); },
      onMetrics: setMetrics,
    });
  };

  return (
    <main className="min-h-[100dvh] bg-[#141313] px-5 py-6 text-[#f4efeb] sm:px-8">
      <div className="mx-auto max-w-5xl">
        <header className="flex items-center justify-between border-b border-white/10 pb-5">
          <div><p className="text-xs tracking-[0.18em] text-[#e98972]">VOICE LAB / SEED-TTS 2.0</p><h1 className="mt-2 text-2xl font-medium">小满的声音与情绪试听</h1></div>
          <a href={sitePath("/")} className="text-xs text-[#9f9795] transition hover:text-[#f4efeb]">返回对话</a>
        </header>

        <section className="mt-8 rounded-3xl border border-white/10 bg-[#1b1818] p-5 sm:p-7">
          <p className="text-xs tracking-[0.14em] text-[#9f9795]">同一句话</p>
          <p className="mt-3 text-2xl leading-10 text-[#f6a08b]">“{SAMPLE_TEXT}”</p>
          <p className="mt-3 text-sm leading-6 text-[#9f9795]">每个按钮都通过同一条 DoubaoTTSProvider 链路试听；没有火山凭证时会自动落到浏览器语音。</p>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {EMOTIONS.map((emotion) => <button key={emotion} type="button" onClick={() => play(emotion)} className="rounded-2xl border border-white/10 px-4 py-4 text-left transition hover:border-[#e98972] hover:bg-[#e98972]/10"><span className="block text-sm font-medium">{EMOTION_LABELS[emotion]}</span><span className="mt-1 block text-xs text-[#817876]">{playing.endsWith(`:${emotion}`) ? "播放中…" : "点击试听"}</span></button>)}
          </div>
        </section>

        <section className="mt-5 rounded-3xl border border-white/10 bg-[#1b1818] p-5 sm:p-7">
          <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs tracking-[0.14em] text-[#9f9795]">官方预置音色</p><h2 className="mt-2 text-xl">选择小满的声音</h2></div><span className={`rounded-full px-3 py-1 text-xs ${configured ? "bg-emerald-400/10 text-emerald-300" : "bg-[#e98972]/10 text-[#f6a08b]"}`}>{configured ? "火山凭证已配置" : "未配置火山凭证 · 将 fallback"}</span></div>
          <div className="mt-5 grid gap-5 md:grid-cols-2">
            {["female", "male"].map((gender) => {
              const genderVoices = voices.filter((voice) => voice.gender === gender);
              return <div key={gender}>
                <div className="mb-3 flex items-center gap-2"><h3 className="text-sm font-medium">{gender === "female" ? "女性音色" : "男性音色"}</h3><span className="text-xs text-[#746c6a]">{genderVoices.length} 个候选</span></div>
                <div className="grid gap-3">
                  {genderVoices.map((voice) => <div key={voice.id} className={`rounded-2xl border p-4 ${selectedVoice === voice.id ? "border-[#e98972] bg-[#e98972]/10" : "border-white/10"}`}><div className="flex flex-wrap items-center justify-between gap-3"><div><div className="flex items-center gap-2"><p className="text-sm font-medium">{voice.name}</p>{voice.id === "zh_female_vv_uranus_bigtts" && <span className="rounded-full bg-[#e98972]/15 px-2 py-1 text-[10px] text-[#f6a08b]">当前默认</span>}</div><p className="mt-1 text-xs text-[#817876]">{voice.id}</p><p className="mt-2 text-xs leading-5 text-[#9f9795]">{voice.description}</p></div><div className="flex gap-2"><button type="button" onClick={() => selectVoice(voice.id)} className="rounded-full border border-white/15 px-3 py-2 text-xs transition hover:border-[#e98972]">{selectedVoice === voice.id ? "已选为小满" : "选这个"}</button><button type="button" onClick={() => play("neutral", voice.id)} className="rounded-full bg-[#e98972] px-3 py-2 text-xs font-medium text-[#241615] transition hover:bg-[#f6a08b]">试听</button></div></div></div>)}
                  {!genderVoices.length && <p className="rounded-2xl border border-dashed border-white/10 px-4 py-5 text-xs text-[#746c6a]">暂无该性别音色配置</p>}
                </div>
              </div>;
            })}
          </div>
          <p className="mt-4 text-xs leading-5 text-[#746c6a]">当前列表已按 seed-tts-2.0 实际请求筛选。音色 ID 来自服务端配置，不写死在前端；可用性仍以火山控制台为准。</p>
        </section>

        {metrics && <section className="mt-5 rounded-3xl border border-white/10 bg-[#1b1818] p-5 text-xs text-[#b7adab]"><p className="text-[#e98972]">最近一次试听</p><div className="mt-3 grid gap-2 sm:grid-cols-2"><p>Provider：{metrics.provider === "volcengine" ? "Doubao / 火山引擎" : "Browser fallback"}</p><p>Voice：{metrics.voice}</p><p>Emotion：{metrics.emotion || "neutral"} · {metrics.intensity ?? "-"}</p><p>Streaming：{metrics.streaming ? "yes" : "no"}</p><p>首包：{metrics.firstByteLatencyMs == null ? "-" : `${metrics.firstByteLatencyMs} ms`}</p><p>总耗时：{metrics.totalLatencyMs == null ? "播放中" : `${metrics.totalLatencyMs} ms`}</p>{metrics.fallbackReason && <p className="sm:col-span-2 text-[#f6a08b]">Fallback：{metrics.fallbackReason}</p>}</div></section>}
        {notice && <p role="alert" className="mt-5 rounded-2xl border border-[#e98972]/30 bg-[#e98972]/10 px-4 py-3 text-sm text-[#f6a08b]">{notice}</p>}
      </div>
    </main>
  );
}

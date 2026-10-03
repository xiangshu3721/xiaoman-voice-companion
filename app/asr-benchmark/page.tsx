"use client";

import { useEffect, useRef, useState } from "react";
import { BrowserSpeechRecognitionProvider, type ASRSessionEvent } from "@/lib/providers";
import { sitePath } from "@/lib/api";
import { TranscriptAccumulator } from "@/src/realtime/transcript-accumulator";
import { assessASRQuality, conservativelyCorrectTranscript, type ASRQuality, type UserTranscript } from "@/src/asr/transcript";
import { ASR_BENCHMARK_CASES } from "@/src/asr/benchmark-cases";

function Value({ children }: { children: React.ReactNode }) {
  return <span className="break-words text-[#d8ceca]">{children || "—"}</span>;
}

export default function ASRBenchmarkPage() {
  const providerRef = useRef(new BrowserSpeechRecognitionProvider());
  const accumulatorRef = useRef(new TranscriptAccumulator());
  const timerRef = useRef<number | null>(null);
  const [running, setRunning] = useState(false);
  const [interim, setInterim] = useState("");
  const [transcript, setTranscript] = useState<UserTranscript | null>(null);
  const [quality, setQuality] = useState<ASRQuality | null>(null);
  const [session, setSession] = useState<ASRSessionEvent | null>(null);
  const [error, setError] = useState("");

  const stop = () => {
    providerRef.current.stop();
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = null;
    setRunning(false);
  };

  const start = () => {
    if (!providerRef.current.isSupported()) {
      setError("当前浏览器没有 SpeechRecognition，无法做真实语音测试。");
      return;
    }
    accumulatorRef.current.reset();
    setTranscript(null);
    setQuality(null);
    setSession(null);
    setInterim("");
    setError("");
    setRunning(true);
    providerRef.current.start((text, isFinal) => {
      const snapshot = accumulatorRef.current.accept(text, isFinal);
      setInterim(snapshot.interimTranscript);
      const rawAsrText = accumulatorRef.current.fullText();
      const next = conservativelyCorrectTranscript({ rawAsrText, asrSessionCount: session?.sessionCount });
      setTranscript(next);
      setQuality(assessASRQuality(next));
    }, (message) => { setError(message); setRunning(false); }, () => setRunning(false), {
      onSessionEvent: (event) => {
        setSession(event);
        if (event.type === "result") {
          const rawAsrText = accumulatorRef.current.fullText();
          const next = conservativelyCorrectTranscript({ rawAsrText, asrSessionCount: event.sessionCount });
          setTranscript(next);
          setQuality(assessASRQuality(next));
        }
      },
    });
    timerRef.current = window.setTimeout(stop, 30000);
  };

  useEffect(() => () => stop(), []);

  return <main className="min-h-[100dvh] bg-[#141313] px-5 py-8 text-[#f4efeb] sm:px-8"><div className="mx-auto max-w-4xl"><header className="flex items-start justify-between gap-4 border-b border-white/10 pb-6"><div><p className="text-[10px] tracking-[0.16em] text-[#e98972]">ASR ACCURACY / SEMANTIC GROUNDING V7</p><h1 className="mt-2 text-3xl font-medium tracking-[-0.04em]">ASR 基准测试</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-[#a9a09e]">这里显示浏览器实际说出来、回传、拼接和纠正后的每一层文本。原始 ASR 永久保留，纠正只使用本地高置信规则，不让模型替你补话。</p></div><a href={sitePath("/")} className="text-sm text-[#f6a08b]">返回对话</a></header>
    <section className="mt-6 rounded-3xl border border-white/10 bg-[#1b1818] p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-base">真实语音输入</h2><p className="mt-2 text-xs text-[#817876]">请任选一句完整说出来；最多监听 30 秒。</p></div><button type="button" onClick={running ? stop : start} className="rounded-full bg-[#e98972] px-5 py-3 text-sm font-medium text-[#241615]">{running ? "停止测试" : "开始测试"}</button></div><div className="mt-4 grid gap-2 text-xs sm:grid-cols-2"><p>浏览器支持：<Value>{providerRef.current.isSupported() ? "yes" : "no"}</Value></p><p>会话次数：<Value>{session?.sessionCount}</Value></p><p>当前会话：<Value>{session?.sessionId}</Value></p><p>重启次数：<Value>{session?.restartCount}</Value></p><p className="sm:col-span-2">实时中间结果：<Value>{interim}</Value></p><p className="sm:col-span-2 text-[#f6a08b]">{error}</p></div></section>
    <section className="mt-4 rounded-3xl border border-white/10 bg-[#1b1818] p-5"><h2 className="text-base">四层结果</h2><div className="mt-4 grid gap-3 text-xs"><p><span className="mb-1 block text-[#817876]">RAW ASR · 真实回传</span><Value>{transcript?.rawAsrText}</Value></p><p><span className="mb-1 block text-[#817876]">CORRECTED · 保守纠正</span><Value>{transcript?.correctedText}</Value></p><p><span className="mb-1 block text-[#817876]">FINAL USER TEXT · 实际送入语义引擎</span><Value>{transcript?.finalUserText}</Value></p><p><span className="mb-1 block text-[#817876]">INTERIM · 尚未提交</span><Value>{interim}</Value></p></div></section>
    <section className="mt-4 rounded-3xl border border-white/10 bg-[#1b1818] p-5"><h2 className="text-base">质量与语义风险</h2><div className="mt-4 grid gap-2 text-xs sm:grid-cols-2"><p>质量：<Value>{quality ? `${quality.level} / ${quality.score.toFixed(2)}` : "—"}</Value></p><p>置信度：<Value>{quality?.confidence}</Value></p><p>分段数：<Value>{quality?.sessionCount}</Value></p><p>未解决片段：<Value>{quality?.unresolvedSpans}</Value></p><p>关键语义歧义：<Value>{quality?.semanticCriticalAmbiguity ? "YES" : "NO"}</Value></p><p>疑似丢字：<Value>{quality?.possibleDropout ? "YES" : "NO"}</Value></p><p className="sm:col-span-2">质量问题：<Value>{quality?.issues.join(", ")}</Value></p><p className="sm:col-span-2">纠正记录：<Value>{transcript?.corrections.map((item) => `${item.original}→${item.corrected}（${item.type}）`).join("；")}</Value></p><p className="sm:col-span-2">不确定片段：<Value>{transcript?.uncertainSpans?.map((item) => `${item.text}（${item.reason}）`).join("；")}</Value></p></div></section>
    <section className="mt-4 rounded-3xl border border-white/10 bg-[#1b1818] p-5"><h2 className="text-base">100 条中文关系语句</h2><p className="mt-2 text-xs leading-5 text-[#817876]">用于逐句口述测试，重点覆盖否定、道歉、承诺、分手、追问、回避、修复和日常收尾。它们是合成测试句，不是真人数据。</p><div className="mt-4 grid gap-2 sm:grid-cols-2">{ASR_BENCHMARK_CASES.map((item, index) => <button key={item} type="button" onClick={() => navigator.clipboard?.writeText(item)} className="rounded-xl border border-white/5 px-3 py-2 text-left text-xs text-[#b7adab] transition hover:border-[#e98972]/40 hover:text-[#f4efeb]"><span className="mr-2 text-[#e98972]">{index + 1}</span>{item}</button>)}</div></section>
  </div></main>;
}

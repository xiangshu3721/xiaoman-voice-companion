"use client";

import { useEffect, useRef, useState } from "react";
import { BrowserSpeechRecognitionProvider, DoubaoTTSProvider, type ASRSessionEvent, type TTSMetrics } from "@/lib/providers";
import { apiUrl, sitePath } from "@/lib/api";
import { fetchWithTimeout } from "@/src/network/fetch-with-timeout";
import { readNetworkDiagnostics, type NetworkDiagnostics } from "@/src/network/network-diagnostics";
import { detectAudioCapability, type AudioCapability } from "@/src/realtime/audio-capability";
import { MicrophonePermissionManager } from "@/src/realtime/microphone-permission";
import { TranscriptAccumulator } from "@/src/realtime/transcript-accumulator";
import { mobileBootTrace, type MobileBootEvent } from "@/src/boot/mobile-boot-trace";

const TEST_PHRASE = "我今天其实有点不开心，因为你昨天一直没有回我消息。";

function Result({ value }: { value: unknown }) {
  return <span className="text-[#c7bdb9]">{value == null || value === "" ? "-" : String(value)}</span>;
}

export default function MobileDiagnosticsPage() {
  const [capability, setCapability] = useState<AudioCapability | null>(null);
  const [network, setNetwork] = useState<NetworkDiagnostics | null>(null);
  const [bootEvents, setBootEvents] = useState<MobileBootEvent[]>([]);
  const [resources, setResources] = useState(mobileBootTrace.resources());
  const [networkTest, setNetworkTest] = useState<Record<string, string>>({});
  const [mic, setMic] = useState<Record<string, string>>({});
  const [meter, setMeter] = useState(0);
  const [asr, setAsr] = useState<Record<string, string>>({});
  const [asrSession, setAsrSession] = useState<ASRSessionEvent | null>(null);
  const [stitched, setStitched] = useState("");
  const [tts, setTts] = useState<TTSMetrics | null>(null);
  const [running, setRunning] = useState("");
  const micRef = useRef(new MicrophonePermissionManager());
  const asrRef = useRef(new BrowserSpeechRecognitionProvider());
  const ttsRef = useRef(new DoubaoTTSProvider());
  const streamRef = useRef<MediaStream | null>(null);
  const meterContextRef = useRef<AudioContext | null>(null);
  const meterTimerRef = useRef<number | null>(null);

  const refresh = () => { setNetwork(readNetworkDiagnostics()); setBootEvents(mobileBootTrace.snapshot()); setResources(mobileBootTrace.resources()); };

  useEffect(() => {
    setCapability(detectAudioCapability());
    refresh();
    const onNetwork = () => refresh();
    window.addEventListener("online", onNetwork);
    window.addEventListener("offline", onNetwork);
    return () => {
      window.removeEventListener("online", onNetwork);
      window.removeEventListener("offline", onNetwork);
      asrRef.current.stop();
      ttsRef.current.stop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      if (meterTimerRef.current !== null) window.clearInterval(meterTimerRef.current);
      void meterContextRef.current?.close();
    };
  }, []);

  const stopMic = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (meterTimerRef.current !== null) window.clearInterval(meterTimerRef.current);
    meterTimerRef.current = null;
    void meterContextRef.current?.close();
    meterContextRef.current = null;
    setMeter(0);
  };

  const testMic = async () => {
    setRunning("mic");
    stopMic();
    const result = await micRef.current.request({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    if (!result.stream) {
      setMic({ status: result.status, errorCode: result.errorCode || "-", message: result.message || "-", secureContext: String(result.secureContext), permissionApiState: result.permissionApiState });
      setRunning("");
      return;
    }
    streamRef.current = result.stream;
    const track = result.stream.getAudioTracks()[0];
    const Constructor = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (Constructor) {
      const context = new Constructor();
      meterContextRef.current = context;
      const analyser = context.createAnalyser();
      const source = context.createMediaStreamSource(result.stream);
      source.connect(analyser);
      const data = new Uint8Array(analyser.fftSize);
      meterTimerRef.current = window.setInterval(() => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (const value of data) { const sample = (value - 128) / 128; sum += sample * sample; }
        const rms = Math.sqrt(sum / data.length);
        if (rms > 0.025) setMeter(Math.min(100, Math.round(rms * 250)));
      }, 100);
    }
    setMic({ status: result.status, errorCode: "-", secureContext: String(result.secureContext), permissionApiState: result.permissionApiState, streamAcquired: "true", trackState: track?.readyState || "-", trackMuted: String(track?.muted || false), message: "请现在对着麦克风说话，观察输入电平" });
    setRunning("");
  };

  const testAsr = () => {
    setRunning("asr");
    const accumulator = new TranscriptAccumulator();
    setStitched("");
    if (!asrRef.current.isSupported()) { setAsr({ status: "当前浏览器不支持 SpeechRecognition" }); setRunning(""); return; }
    asrRef.current.start((text, isFinal) => { const snapshot = accumulator.accept(text, isFinal); setStitched(accumulator.fullText()); setAsr((current) => ({ ...current, result: `${isFinal ? "final" : "interim"}: ${text}`, committed: snapshot.committedTranscript, interim: snapshot.interimTranscript })); }, (message) => { setAsr((current) => ({ ...current, error: message })); setRunning(""); }, () => setRunning(""), { onReady: () => setAsr({ status: "已启动，请说：我今天其实有点不开心，因为你昨天一直没有回我消息。" }), onSessionEvent: (event) => setAsrSession(event) });
    window.setTimeout(() => { asrRef.current.stop(); setRunning(""); }, 15000);
  };

  const testNetwork = async () => {
    setRunning("network");
    const started = performance.now();
    const appResult = await fetchWithTimeout(location.href, { cache: "no-store" }, 8000).then((response) => `HTTP ${response.status} · ${Math.round(performance.now() - started)}ms`).catch((error) => `timeout/error · ${error instanceof Error ? error.message : "unknown"}`);
    const apiStarted = performance.now();
    const apiResult = await fetchWithTimeout(apiUrl("/api/tts/config"), { cache: "no-store" }, 8000).then((response) => `HTTP ${response.status} · ${Math.round(performance.now() - apiStarted)}ms`).catch((error) => `timeout/error · ${error instanceof Error ? error.message : "unknown"}`);
    setNetworkTest({ appOrigin: appResult, api: apiResult });
    setNetwork(readNetworkDiagnostics());
    setRunning("");
  };

  const testTts = async () => {
    setRunning("tts");
    ttsRef.current.unlockAudio();
    await new Promise<void>((resolve) => ttsRef.current.speak({ text: "这是移动端语音诊断。你能听到这句话吗？", emotion: "calm", intensity: 0.45 }, { onMetrics: setTts, onEnd: resolve, onError: (message) => { setTts({ provider: "browser", voice: "error", streaming: false, error: message }); resolve(); } }));
    setRunning("");
  };

  const testChain = async () => { await testMic(); await testTts(); };
  const reset = () => { stopMic(); asrRef.current.stop(); ttsRef.current.stop(); setMic({}); setAsr({}); setAsrSession(null); setStitched(""); setTts(null); refresh(); };

  return <main className="min-h-[100dvh] bg-[#141313] px-5 py-8 text-[#f4efeb] sm:px-8"><div className="mx-auto max-w-3xl"><header className="flex items-start justify-between gap-4 border-b border-white/10 pb-6"><div><p className="text-[10px] tracking-[0.16em] text-[#e98972]">ANDROID / RELIABILITY V6</p><h1 className="mt-2 text-3xl font-medium tracking-[-0.04em]">移动端诊断</h1><p className="mt-3 text-sm leading-6 text-[#a9a09e]">这页只记录浏览器实际暴露的能力和事件，不把权限提示、网络类型或声音听感猜成结论。</p></div><a href={sitePath("/")} className="text-sm text-[#f6a08b]">返回对话</a></header>
    <section className="mt-6 rounded-3xl border border-white/10 bg-[#1b1818] p-5"><div className="flex items-center justify-between"><h2 className="text-base">设备 / 安全上下文</h2><button type="button" onClick={refresh} className="text-xs text-[#f6a08b]">刷新</button></div><div className="mt-4 grid gap-2 text-xs sm:grid-cols-2">{capability && Object.entries(capability).filter(([key]) => key !== "userAgent").map(([key, value]) => <p key={key} className="flex justify-between gap-3 border-b border-white/5 py-2"><span className="text-[#817876]">{key}</span><Result value={value} /></p>)}</div></section>
    <section className="mt-4 rounded-3xl border border-white/10 bg-[#1b1818] p-5"><h2 className="text-base">网络</h2><div className="mt-4 grid gap-2 text-sm sm:grid-cols-2">{network && Object.entries(network).map(([key, value]) => <p key={key} className="flex justify-between gap-3 border-b border-white/5 py-2"><span className="text-[#817876]">{key}</span><Result value={value} /></p>)}</div><div className="mt-4 grid gap-2 text-xs sm:grid-cols-2">{Object.entries(networkTest).map(([key, value]) => <p key={key} className="flex justify-between gap-3 border-b border-white/5 py-2"><span className="text-[#817876]">{key}</span><Result value={value} /></p>)}</div><button type="button" onClick={() => void testNetwork()} disabled={Boolean(running)} className="mt-4 rounded-full border border-white/15 px-4 py-3 text-sm disabled:opacity-40">测试网络（页面 + API）</button></section>
    <section className="mt-4 rounded-3xl border border-white/10 bg-[#1b1818] p-5"><h2 className="text-base">启动时间线</h2><div className="mt-4 space-y-2 text-xs">{bootEvents.map((event) => <p key={`${event.name}-${event.at}`} className="flex justify-between gap-3 border-b border-white/5 py-2"><span>{event.name}</span><span className="text-[#9f9795]">{event.at}ms {event.error ? `· ${event.error}` : ""}</span></p>)}</div><h3 className="mt-5 text-sm text-[#9f9795]">最慢资源 Top 10</h3><div className="mt-2 space-y-2 text-[11px] text-[#817876]">{resources.map((resource) => <p key={`${resource.name}-${resource.durationMs}`} className="break-all">{resource.durationMs}ms · {resource.initiatorType} · {resource.name}</p>)}</div></section>
    <section className="mt-4 rounded-3xl border border-white/10 bg-[#1b1818] p-5"><h2 className="text-base">麦克风 / 动态电平</h2><div className="mt-4 h-3 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-[#e98972] transition-all" style={{ width: `${meter}%` }} /></div><p className="mt-2 text-xs text-[#817876]">当前输入电平：{meter}%。说话时应明显变化；没有变化不等于权限一定被拒绝，可能是设备、系统或 WebView 路由问题。</p><div className="mt-4 grid gap-2 text-xs sm:grid-cols-2">{Object.entries(mic).map(([key, value]) => <p key={key} className="flex justify-between gap-3 border-b border-white/5 py-2"><span className="text-[#817876]">{key}</span><Result value={value} /></p>)}</div><button type="button" onClick={() => void testMic()} disabled={Boolean(running)} className="mt-4 rounded-full bg-[#e98972] px-4 py-3 text-sm font-medium text-[#241615] disabled:opacity-40">测试麦克风</button></section>
    <section className="mt-4 rounded-3xl border border-white/10 bg-[#1b1818] p-5"><h2 className="text-base">ASR 会话拼接</h2><p className="mt-2 text-xs leading-5 text-[#9f9795]">请完整说：{TEST_PHRASE}</p><div className="mt-4 grid gap-2 text-xs sm:grid-cols-2"><p>当前会话：<Result value={asrSession?.sessionId} /></p><p>会话次数：<Result value={asrSession?.sessionCount} /></p><p>重启次数：<Result value={asrSession?.restartCount} /></p><p>最近事件：<Result value={asrSession?.type} /></p><p className="sm:col-span-2">最近回传：<Result value={asr.result} /></p><p className="sm:col-span-2">已拼接全文：<Result value={stitched} /></p><p className="sm:col-span-2 text-[#f6a08b]">{asr.error || ""}</p></div><button type="button" onClick={testAsr} disabled={Boolean(running)} className="mt-4 rounded-full border border-white/15 px-4 py-3 text-sm disabled:opacity-40">测试 ASR 15 秒</button></section>
    <section className="mt-4 rounded-3xl border border-white/10 bg-[#1b1818] p-5"><h2 className="text-base">TTS / 完整链路</h2><div className="mt-4 grid gap-2 text-xs sm:grid-cols-2"><p>Provider：<Result value={tts?.provider} /></p><p>Voice：<Result value={tts?.voice} /></p><p>生成成功：<Result value={tts?.generationSuccess} /></p><p>播放成功：<Result value={tts?.playbackSuccess} /></p><p>首包：<Result value={tts?.firstByteLatencyMs && `${tts.firstByteLatencyMs}ms`} /></p><p>错误：<Result value={tts?.error || tts?.fallbackReason} /></p></div><div className="mt-4 grid gap-2 sm:grid-cols-2"><button type="button" onClick={() => void testTts()} disabled={Boolean(running)} className="rounded-full border border-white/15 px-4 py-3 text-sm disabled:opacity-40">测试 AI 声音</button><button type="button" onClick={() => void testChain()} disabled={Boolean(running)} className="rounded-full border border-[#e98972]/40 px-4 py-3 text-sm text-[#f6a08b] disabled:opacity-40">测试完整链路</button></div><button type="button" onClick={reset} className="mt-4 text-xs text-[#817876] underline underline-offset-4">重置运行时</button></section>
    <p className="mt-6 text-xs leading-5 text-[#756d6b]">当前页面不会声称 DNS、IPv4/IPv6、蜂窝网络或真实物理输出路由已经通过测试；这些必须在实际 Android 设备和对应网络环境中观察。</p>
  </div></main>;
}

"use client";

import { useEffect, useRef, useState } from "react";
import { BrowserSpeechRecognitionProvider, DoubaoTTSProvider, type TTSMetrics, type TTSPlaybackState } from "@/lib/providers";
import { sitePath } from "@/lib/api";
import { detectAudioCapability, type AudioCapability } from "@/src/realtime/audio-capability";
import { MicrophonePermissionManager } from "@/src/realtime/microphone-permission";

type CheckMap = Record<string, string>;
type VolumeMode = "mic-off" | "mic-on" | "asr-stop" | "track-stop";

const REFERENCE_TEXT = "行，你忙，你最忙。现在请注意听这句声音。";
const DIAGNOSTIC_CACHE_KEY = "ios-volume-reference-v1";
const label: Record<TTSPlaybackState, string> = { IDLE: "空闲", REQUESTING: "请求中", BUFFERING: "缓冲中", READY: "已就绪", PLAYING: "播放中", COMPLETED: "已完成", INTERRUPTED: "已中断", FAILED: "失败", RECOVERING: "恢复中" };

function Result({ value }: { value?: string }) {
  if (!value) return <span className="text-[#756d6b]">未测试</span>;
  const good = /成功|已授权|支持|可用|播放中|已完成|live|running|正常/i.test(value) && !/UNAVAILABLE|失败|错误|拒绝|超时/i.test(value);
  return <span className={good ? "text-[#8ed49b]" : "text-[#f6a08b]"}>{value}</span>;
}

export default function AudioDiagnosticsPage() {
  const [capability, setCapability] = useState<AudioCapability | null>(null);
  const [checks, setChecks] = useState<CheckMap>({});
  const [ttsState, setTtsState] = useState<TTSPlaybackState>("IDLE");
  const [ttsMetrics, setTtsMetrics] = useState<TTSMetrics | null>(null);
  const [running, setRunning] = useState("");
  const [perceivedVolume, setPerceivedVolume] = useState("未评分");
  const [routeObservation, setRouteObservation] = useState("未判断");
  const ttsRef = useRef(new DoubaoTTSProvider());
  const micRef = useRef(new MicrophonePermissionManager());
  const asrRef = useRef(new BrowserSpeechRecognitionProvider());
  const micStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    setCapability(detectAudioCapability());
    const stopWatching = micRef.current.watchDeviceChanges(() => setChecks((current) => ({ ...current, "麦克风设备": "设备发生变化，请重新测试" })));
    return () => { stopWatching(); ttsRef.current.stop(); asrRef.current.stop(); micStreamRef.current?.getTracks().forEach((track) => track.stop()); };
  }, []);

  const setProviderDiagnostics = (metrics?: TTSMetrics) => {
    const diagnostics = ttsRef.current.getAudioDiagnostics();
    if (metrics) setTtsMetrics({ ...metrics, clientGain: metrics.clientGain ?? diagnostics.clientGain, sourceRms: metrics.sourceRms ?? (diagnostics.sourceRms === "UNAVAILABLE" ? undefined : diagnostics.sourceRms), sourcePeak: metrics.sourcePeak ?? (diagnostics.sourcePeak === "UNAVAILABLE" ? undefined : diagnostics.sourcePeak), audioContextState: metrics.audioContextState || diagnostics.audioContextState, audioSessionType: metrics.audioSessionType || diagnostics.audioSessionType });
    setChecks((current) => ({ ...current, "AUDIO CONTEXT": diagnostics.audioContextState, "AUDIO VOLUME": String(diagnostics.audioVolume), MUTED: String(diagnostics.audioMuted), "DEFAULT MUTED": String(diagnostics.audioDefaultMuted), "PLAYBACK RATE": String(diagnostics.playbackRate), "CLIENT GAIN": String(diagnostics.clientGain), "SOURCE RMS": String(diagnostics.sourceRms), "SOURCE PEAK": String(diagnostics.sourcePeak), "AUDIO SESSION": diagnostics.audioSessionType }));
  };

  const stopMic = () => { micStreamRef.current?.getTracks().forEach((track) => track.stop()); micStreamRef.current = null; };
  const keepMic = async () => {
    const result = await micRef.current.request({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    if (!result.stream) { setChecks((current) => ({ ...current, "GET USER MEDIA": result.message || result.status })); return false; }
    stopMic();
    micStreamRef.current = result.stream;
    const track = result.stream.getAudioTracks()[0];
    setChecks((current) => ({ ...current, "GET USER MEDIA": `已授权，track ${track?.readyState || "unknown"}`, "MIC PERMISSION API": result.permissionsState, "MIC TRACK": `${track?.readyState || "unknown"}${track?.muted ? " / muted" : ""}` }));
    return true;
  };

  const testMicrophone = async () => { setRunning("mic"); stopMic(); await keepMic(); stopMic(); setChecks((current) => ({ ...current, "SECURE CONTEXT": window.isSecureContext ? "可用" : "不可用" })); setRunning(""); };
  const testAsr = () => {
    setRunning("asr");
    if (!asrRef.current.isSupported()) { setChecks((current) => ({ ...current, ASR: "当前浏览器不支持 SpeechRecognition" })); setRunning(""); return; }
    asrRef.current.start((text, isFinal) => setChecks((current) => ({ ...current, ASR: `${isFinal ? "final" : "interim"}: ${text}` })), (message) => { setChecks((current) => ({ ...current, ASR: message })); setRunning(""); }, () => setRunning(""), { onReady: () => setChecks((current) => ({ ...current, ASR: "已启动，请现在说一句话" })) });
    window.setTimeout(() => { asrRef.current.stop(); setRunning(""); }, 10000);
  };

  const playReference = async (mode: VolumeMode, gain = 1) => {
    setRunning(mode); ttsRef.current.unlockAudio();
    if (mode === "mic-off" || mode === "track-stop") stopMic();
    if (mode === "mic-on" || mode === "asr-stop") { const ready = await keepMic(); if (!ready) { setRunning(""); return; } }
    if (mode === "asr-stop" || mode === "track-stop") asrRef.current.stop();
    if (mode === "track-stop") stopMic();
    ttsRef.current.setAudioSessionType(mode === "mic-on" || mode === "asr-stop" ? "play-and-record" : "playback");
    setChecks((current) => ({ ...current, "VOLUME TEST": `${mode} · gain ${gain.toFixed(1)} · 正在播放同一条诊断语音`, "OUTPUT ROUTE": "浏览器无法读取物理输出路由，请人工判断" }));
    await new Promise<void>((resolve) => {
      let settled = false;
      const timeout = window.setTimeout(() => { if (!settled) { settled = true; setChecks((current) => ({ ...current, "VOLUME TEST": `${mode} · 超过15秒未结束` })); resolve(); } }, 15000);
      const finish = () => { if (settled) return; settled = true; window.clearTimeout(timeout); resolve(); };
      ttsRef.current.speak({ text: REFERENCE_TEXT, emotion: "calm", intensity: 0.45, clientGain: gain, diagnosticCacheKey: DIAGNOSTIC_CACHE_KEY }, { onStart: () => setChecks((current) => ({ ...current, "VOLUME TEST": `${mode} · gain ${gain.toFixed(1)} · 已开始播放` })), onEnd: finish, onError: (message) => { setChecks((current) => ({ ...current, "VOLUME TEST": `${mode} · ${message}` })); finish(); }, onStateChange: setTtsState, onMetrics: (metrics) => { setProviderDiagnostics(metrics); if (metrics.playbackSuccess) setChecks((current) => ({ ...current, "VOLUME TEST": `${mode} · gain ${gain.toFixed(1)} · 播放完成` })); } });
    });
    setProviderDiagnostics(); setRunning("");
  };

  const testTts = async () => {
    setRunning("tts"); ttsRef.current.unlockAudio(); let passed = 0;
    for (let index = 0; index < 5; index += 1) {
      const ok = await new Promise<boolean>((resolve) => {
        let settled = false;
        const timeout = window.setTimeout(() => { setChecks((current) => ({ ...current, "TTS PLAYBACK": `第${index + 1}/5次超过15秒未结束，可能被浏览器阻止` })); settled = true; resolve(false); }, 15000);
        const finish = (success: boolean) => { if (settled) return; settled = true; window.clearTimeout(timeout); resolve(success); };
        ttsRef.current.speak({ text: `这是手机音频诊断，第${index + 1}次。你能听见这句话吗？`, emotion: "calm", intensity: 0.45 }, { onStart: () => setChecks((current) => ({ ...current, "TTS PLAYBACK": `第${index + 1}/5次播放已开始` })), onEnd: () => finish(true), onError: (message) => { setChecks((current) => ({ ...current, "TTS PLAYBACK": message })); finish(false); }, onStateChange: setTtsState, onMetrics: setProviderDiagnostics });
      });
      if (!ok) break; passed += 1;
    }
    setChecks((current) => ({ ...current, "TTS PLAYBACK": `${passed}/5 次播放完成` })); setProviderDiagnostics(); setRunning("");
  };

  const testFull = async () => { await testMicrophone(); await testTts(); };
  const reset = () => { ttsRef.current.stop(); asrRef.current.stop(); stopMic(); setTtsState("IDLE"); setTtsMetrics(null); setChecks({}); setPerceivedVolume("未评分"); setRouteObservation("未判断"); };

  return <main className="min-h-[100dvh] bg-[#141313] px-5 py-8 text-[#f4efeb] sm:px-8"><div className="mx-auto max-w-3xl"><header className="flex items-start justify-between gap-4 border-b border-white/10 pb-6"><div><p className="text-[10px] tracking-[0.16em] text-[#e98972]">MOBILE VOICE / DIAGNOSTICS</p><h1 className="mt-2 text-3xl font-medium tracking-[-0.04em]">音频诊断</h1><p className="mt-3 text-sm leading-6 text-[#a9a09e]">先用同一条 TTS 音频做 A/B 测试，再决定 iPhone 的麦克风策略和增益。程序不会伪装知道你实际听到的声压或物理输出路由。</p></div><a href={sitePath("/")} className="text-sm text-[#f6a08b]">返回对话</a></header>
    <section className="mt-6 rounded-3xl border border-white/10 bg-[#1b1818] p-5"><h2 className="text-base">设备与浏览器</h2><div className="mt-4 grid gap-2 text-sm sm:grid-cols-2">{capability && Object.entries(capability).map(([key, value]) => <p key={key} className="flex justify-between gap-3 border-b border-white/5 py-2"><span className="text-[#817876]">{key}</span><Result value={String(value)} /></p>)}</div></section>
    <section className="mt-4 rounded-3xl border border-white/10 bg-[#1b1818] p-5"><h2 className="text-base">基础检查</h2><div className="mt-4 grid gap-2 text-sm">{["MIC PERMISSION API", "GET USER MEDIA", "麦克风设备", "ASR", "TTS PLAYBACK", "SECURE CONTEXT"].map((key) => <p key={key} className="flex justify-between gap-3 border-b border-white/5 py-2"><span className="text-[#817876]">{key}</span><Result value={checks[key]} /></p>)}</div><div className="mt-4 grid gap-2 sm:grid-cols-2"><button type="button" onClick={() => void testMicrophone()} disabled={Boolean(running)} className="rounded-full bg-[#e98972] px-4 py-3 text-sm font-medium text-[#241615] disabled:opacity-40">测试麦克风</button><button type="button" onClick={testAsr} disabled={Boolean(running)} className="rounded-full border border-white/15 px-4 py-3 text-sm disabled:opacity-40">测试 ASR</button><button type="button" onClick={() => void testTts()} disabled={Boolean(running)} className="rounded-full border border-white/15 px-4 py-3 text-sm disabled:opacity-40">测试 AI 声音（5次）</button><button type="button" onClick={() => void testFull()} disabled={Boolean(running)} className="rounded-full border border-[#e98972]/40 px-4 py-3 text-sm text-[#f6a08b] disabled:opacity-40">测试完整语音链路</button></div><button type="button" onClick={reset} className="mt-3 text-xs text-[#817876] underline underline-offset-4">重新初始化音频</button></section>
    <section className="mt-4 rounded-3xl border border-[#e98972]/25 bg-[#1b1818] p-5"><h2 className="text-base">iOS Volume Test · 同一条音频</h2><p className="mt-2 text-xs leading-5 text-[#9f9795]">建议在 iPhone 上按顺序点击：不开麦 → 开麦 → ASR stop → Mic track stop。每次播放结束后，人工选择听感；Gain 只测试 1.0 / 1.2 / 1.4，不代表程序会默认放大。</p><div className="mt-4 grid gap-2 sm:grid-cols-2"><button type="button" onClick={() => void playReference("mic-off")} disabled={Boolean(running)} className="rounded-xl border border-white/15 px-3 py-3 text-left text-sm disabled:opacity-40">1. 不开麦播放</button><button type="button" onClick={() => void playReference("mic-on")} disabled={Boolean(running)} className="rounded-xl border border-white/15 px-3 py-3 text-left text-sm disabled:opacity-40">2. 开麦播放</button><button type="button" onClick={() => void playReference("asr-stop")} disabled={Boolean(running)} className="rounded-xl border border-white/15 px-3 py-3 text-left text-sm disabled:opacity-40">3. ASR stop 后播放</button><button type="button" onClick={() => void playReference("track-stop")} disabled={Boolean(running)} className="rounded-xl border border-white/15 px-3 py-3 text-left text-sm disabled:opacity-40">4. Mic track stop 后播放</button><button type="button" onClick={() => void playReference("mic-off", 1)} disabled={Boolean(running)} className="rounded-xl border border-white/15 px-3 py-3 text-left text-sm disabled:opacity-40">5. Gain 1.0</button><button type="button" onClick={() => void playReference("mic-off", 1.2)} disabled={Boolean(running)} className="rounded-xl border border-white/15 px-3 py-3 text-left text-sm disabled:opacity-40">6. Gain 1.2</button><button type="button" onClick={() => void playReference("mic-off", 1.4)} disabled={Boolean(running)} className="rounded-xl border border-white/15 px-3 py-3 text-left text-sm disabled:opacity-40">7. Gain 1.4</button></div><div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="text-xs text-[#9f9795]">人工听感<select value={perceivedVolume} onChange={(event) => setPerceivedVolume(event.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-[#141313] px-3 py-3 text-sm text-[#f4efeb]"><option>未评分</option><option>很小</option><option>偏小</option><option>正常</option><option>偏大</option><option>爆音</option></select></label><label className="text-xs text-[#9f9795]">你听到的输出位置<select value={routeObservation} onChange={(event) => setRouteObservation(event.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-[#141313] px-3 py-3 text-sm text-[#f4efeb]"><option>未判断</option><option>顶部听筒</option><option>底部扬声器</option><option>AirPods/蓝牙耳机</option><option>有线耳机</option><option>其他/不确定</option></select></label></div><p className="mt-3 text-xs text-[#756d6b]">当前记录：听感 {perceivedVolume} · 输出位置 {routeObservation}</p></section>
    <section className="mt-4 rounded-3xl border border-white/10 bg-[#1b1818] p-5 text-sm"><h2 className="text-base">播放与源音频状态</h2><p className="mt-3 text-[#f6a08b]">{label[ttsState]}</p><div className="mt-4 grid gap-2 text-xs text-[#b7adab] sm:grid-cols-2">{["AUDIO CONTEXT", "AUDIO SESSION", "AUDIO VOLUME", "MUTED", "DEFAULT MUTED", "PLAYBACK RATE", "CLIENT GAIN", "SOURCE RMS", "SOURCE PEAK", "VOLUME TEST", "OUTPUT ROUTE"].map((key) => <p key={key} className="flex justify-between gap-3 border-b border-white/5 py-2"><span className="text-[#817876]">{key}</span><Result value={checks[key]} /></p>)}</div>{ttsMetrics && <div className="mt-4 grid gap-2 text-xs text-[#b7adab] sm:grid-cols-2"><p>Provider：{ttsMetrics.provider}</p><p>Voice：{ttsMetrics.voice}</p><p>情绪：{ttsMetrics.emotion || "neutral"}</p><p>loudness_rate：{ttsMetrics.loudnessRate ?? "-"}</p><p>生成成功：{ttsMetrics.generationSuccess ? "是" : "未确认"}</p><p>播放成功：{ttsMetrics.playbackSuccess ? "是" : "未确认"}</p><p>首包：{ttsMetrics.firstByteLatencyMs ?? "-"} ms</p><p>总耗时：{ttsMetrics.totalLatencyMs ?? "-"} ms</p><p>源 RMS：{ttsMetrics.sourceRms ?? "-"}</p><p>源 Peak：{ttsMetrics.sourcePeak ?? "-"}</p><p className="sm:col-span-2">Fallback：{ttsMetrics.fallbackReason || "无"}</p></div>}</section>
    <p className="mt-6 text-xs leading-5 text-[#756d6b]">真机验收请在 iPhone Safari/Chrome、Android Chrome 和微信内置浏览器分别打开此页。浏览器无法可靠读取系统媒体音量、顶部听筒/底部扬声器和耳机的物理路由；这里的听感和输出位置必须由你实际记录，不能用代码推断。</p>
  </div></main>;
}

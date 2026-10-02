"use client";

import { useEffect, useRef, useState } from "react";
import { BrowserSpeechRecognitionProvider, DoubaoTTSProvider, type TTSMetrics, type TTSPlaybackState } from "@/lib/providers";
import { sitePath } from "@/lib/api";
import { detectAudioCapability, type AudioCapability } from "@/src/realtime/audio-capability";
import { MicrophonePermissionManager } from "@/src/realtime/microphone-permission";

type CheckMap = Record<string, string>;

const label: Record<TTSPlaybackState, string> = {
  IDLE: "空闲", REQUESTING: "请求中", BUFFERING: "缓冲中", READY: "已就绪", PLAYING: "播放中", COMPLETED: "已完成", INTERRUPTED: "已中断", FAILED: "失败", RECOVERING: "恢复中",
};

function Result({ value }: { value?: string }) {
  if (!value) return <span className="text-[#756d6b]">未测试</span>;
  const good = /成功|已授权|支持|可用|播放中|已完成|live|running/i.test(value);
  return <span className={good ? "text-[#8ed49b]" : "text-[#f6a08b]"}>{value}</span>;
}

export default function AudioDiagnosticsPage() {
  const [capability, setCapability] = useState<AudioCapability | null>(null);
  const [checks, setChecks] = useState<CheckMap>({});
  const [ttsState, setTtsState] = useState<TTSPlaybackState>("IDLE");
  const [ttsMetrics, setTtsMetrics] = useState<TTSMetrics | null>(null);
  const [running, setRunning] = useState("");
  const ttsRef = useRef(new DoubaoTTSProvider());
  const micRef = useRef(new MicrophonePermissionManager());
  const asrRef = useRef(new BrowserSpeechRecognitionProvider());

  useEffect(() => {
    setCapability(detectAudioCapability());
    const stopWatching = micRef.current.watchDeviceChanges(() => setChecks((current) => ({ ...current, "麦克风设备": "设备发生变化，请重新测试" })));
    return () => { stopWatching(); ttsRef.current.stop(); asrRef.current.stop(); };
  }, []);

  const testMicrophone = async () => {
    setRunning("mic");
    const result = await micRef.current.request({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    result.stream?.getTracks().forEach((track) => track.stop());
    setChecks((current) => ({ ...current, "GET USER MEDIA": result.message || (result.status === "granted" ? "已授权，track live" : result.status), "MIC PERMISSION API": result.permissionsState, "SECURE CONTEXT": result.secureContext ? "可用" : "不可用" }));
    setRunning("");
  };

  const testAsr = () => {
    setRunning("asr");
    if (!asrRef.current.isSupported()) {
      setChecks((current) => ({ ...current, ASR: "当前浏览器不支持 SpeechRecognition" }));
      setRunning("");
      return;
    }
    asrRef.current.start((text, isFinal) => setChecks((current) => ({ ...current, ASR: `${isFinal ? "final" : "interim"}: ${text}` })), (message) => { setChecks((current) => ({ ...current, ASR: message })); setRunning(""); }, () => setRunning(""), { onReady: () => setChecks((current) => ({ ...current, ASR: "已启动，请现在说一句话" })) });
    window.setTimeout(() => { asrRef.current.stop(); setRunning(""); }, 10000);
  };

  const testTts = async () => {
    setRunning("tts");
    let passed = 0;
    for (let index = 0; index < 5; index += 1) {
      setTtsState("REQUESTING");
      const ok = await new Promise<boolean>((resolve) => {
        let settled = false;
        const timeout = window.setTimeout(() => { setChecks((current) => ({ ...current, "TTS PLAYBACK": `第${index + 1}/5次超过15秒未结束，可能被浏览器阻止` })); settled = true; resolve(false); }, 15000);
        const finish = (success: boolean) => { if (settled) return; settled = true; window.clearTimeout(timeout); resolve(success); };
        ttsRef.current.speak({ text: `这是手机音频诊断，第${index + 1}次。你能听见这句话吗？`, emotion: "calm", intensity: 0.45 }, { onStart: () => setChecks((current) => ({ ...current, "TTS PLAYBACK": `第${index + 1}/5次播放已开始` })), onEnd: () => finish(true), onError: (message) => { setChecks((current) => ({ ...current, "TTS PLAYBACK": message })); finish(false); }, onStateChange: setTtsState, onMetrics: (metrics) => setTtsMetrics(metrics) });
      });
      if (!ok) break;
      passed += 1;
    }
    setChecks((current) => ({ ...current, "TTS PLAYBACK": `${passed}/5 次播放完成` }));
    setRunning("");
  };

  const testFull = async () => { await testMicrophone(); await testTts(); };
  const reset = () => { ttsRef.current.stop(); asrRef.current.stop(); setTtsState("IDLE"); setTtsMetrics(null); setChecks({}); };

  return <main className="min-h-[100dvh] bg-[#141313] px-5 py-8 text-[#f4efeb] sm:px-8"><div className="mx-auto max-w-3xl"><header className="flex items-start justify-between gap-4 border-b border-white/10 pb-6"><div><p className="text-[10px] tracking-[0.16em] text-[#e98972]">MOBILE VOICE / DIAGNOSTICS</p><h1 className="mt-2 text-3xl font-medium tracking-[-0.04em]">音频诊断</h1><p className="mt-3 text-sm leading-6 text-[#a9a09e]">这个页面不会把权限 API 当作硬门槛，以 getUserMedia 和真实播放结果为准。</p></div><a href={sitePath("/")} className="text-sm text-[#f6a08b]">返回对话</a></header>
    <section className="mt-6 rounded-3xl border border-white/10 bg-[#1b1818] p-5"><h2 className="text-base">设备与浏览器</h2><div className="mt-4 grid gap-2 text-sm sm:grid-cols-2">{capability && Object.entries(capability).map(([key, value]) => <p key={key} className="flex justify-between gap-3 border-b border-white/5 py-2"><span className="text-[#817876]">{key}</span><Result value={String(value)} /></p>)}</div></section>
    <section className="mt-4 rounded-3xl border border-white/10 bg-[#1b1818] p-5"><h2 className="text-base">实时检查</h2><div className="mt-4 grid gap-2 text-sm">{["MIC PERMISSION API", "GET USER MEDIA", "麦克风设备", "ASR", "TTS PLAYBACK", "SECURE CONTEXT"].map((key) => <p key={key} className="flex justify-between gap-3 border-b border-white/5 py-2"><span className="text-[#817876]">{key}</span><Result value={checks[key]} /></p>)}</div><div className="mt-4 grid gap-2 sm:grid-cols-2"><button type="button" onClick={() => void testMicrophone()} disabled={Boolean(running)} className="rounded-full bg-[#e98972] px-4 py-3 text-sm font-medium text-[#241615] disabled:opacity-40">测试麦克风</button><button type="button" onClick={testAsr} disabled={Boolean(running)} className="rounded-full border border-white/15 px-4 py-3 text-sm disabled:opacity-40">测试 ASR</button><button type="button" onClick={() => void testTts()} disabled={Boolean(running)} className="rounded-full border border-white/15 px-4 py-3 text-sm disabled:opacity-40">测试 AI 声音</button><button type="button" onClick={() => void testFull()} disabled={Boolean(running)} className="rounded-full border border-[#e98972]/40 px-4 py-3 text-sm text-[#f6a08b] disabled:opacity-40">测试完整语音链路</button></div><button type="button" onClick={reset} className="mt-3 text-xs text-[#817876] underline underline-offset-4">重新初始化音频</button></section>
    <section className="mt-4 rounded-3xl border border-white/10 bg-[#1b1818] p-5 text-sm"><h2 className="text-base">TTS 播放状态</h2><p className="mt-3 text-[#f6a08b]">{label[ttsState]}</p>{ttsMetrics && <div className="mt-3 grid gap-2 text-xs text-[#b7adab] sm:grid-cols-2"><p>Provider：{ttsMetrics.provider}</p><p>Voice：{ttsMetrics.voice}</p><p>生成成功：{ttsMetrics.generationSuccess ? "是" : "未确认"}</p><p>播放成功：{ttsMetrics.playbackSuccess ? "是" : "未确认"}</p><p>首包：{ttsMetrics.firstByteLatencyMs ?? "-"} ms</p><p>总耗时：{ttsMetrics.totalLatencyMs ?? "-"} ms</p><p className="sm:col-span-2">Fallback：{ttsMetrics.fallbackReason || "无"}</p></div>}</section>
    <p className="mt-6 text-xs leading-5 text-[#756d6b]">真机验收请分别在 iPhone Safari、iPhone Chrome、Android Chrome 和微信内置浏览器打开此页。当前开发环境不能替你物理操作手机，因此真机结果必须以这里的实际测试为准。</p>
  </div></main>;
}

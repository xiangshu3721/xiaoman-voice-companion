"use client";

import { useEffect, useRef, useState } from "react";
import { apiUrl, sitePath } from "@/lib/api";
import { BrowserSpeechRecognitionProvider, DoubaoTTSProvider, type ASRSessionEvent, type ChatMessage, type TTSMetrics, type TTSPlaybackSignal } from "@/lib/providers";
import { VOICE_FEATURES } from "@/src/voice/feature-flags";

const TEST_TEXT = "你好，现在正在测试AI语音。";
const TEST_PHRASE = "你好，这是一次语音测试。";

type LogEntry = { at: string; label: string; value: string };

function now() {
  return new Date().toLocaleTimeString();
}

function Result({ value }: { value: unknown }) {
  return <span className="text-[#d6cbc8]">{value == null || value === "" ? "-" : String(value)}</span>;
}

export default function VoiceSmokeTestPage() {
  const [mic, setMic] = useState({ status: "NOT_RUN", track: "-", level: 0, error: "" });
  const [asr, setAsr] = useState({ status: "NOT_RUN", partial: "", final: "", error: "", event: "-" });
  const [tts, setTts] = useState({ request: "NOT_RUN", bytes: "-", load: "-", play: "-", started: "-", provider: "-", voice: "-", error: "" });
  const [running, setRunning] = useState("");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const meterContextRef = useRef<AudioContext | null>(null);
  const meterTimerRef = useRef<number | null>(null);
  const asrRef = useRef(new BrowserSpeechRecognitionProvider());
  const ttsRef = useRef(new DoubaoTTSProvider());

  const log = (label: string, value: unknown) => setLogs((current) => [{ at: now(), label, value: String(value ?? "-") }, ...current].slice(0, 80));

  const stopMic = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (meterTimerRef.current !== null) window.clearInterval(meterTimerRef.current);
    meterTimerRef.current = null;
    void meterContextRef.current?.close();
    meterContextRef.current = null;
    setMic((current) => ({ ...current, track: "ENDED", level: 0 }));
  };

  const testMic = async () => {
    setRunning("mic");
    stopMic();
    setMic({ status: "REQUESTING", track: "-", level: 0, error: "" });
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("getUserMedia unavailable");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const track = stream.getAudioTracks()[0];
      if (!track || track.readyState !== "live") throw new Error("audio track is not live");
      setMic({ status: "PASS", track: track.readyState.toUpperCase(), level: 0, error: "" });
      log("GET_USER_MEDIA", "PASS");
      log("TRACK", track.readyState.toUpperCase());
      const AudioContextConstructor = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AudioContextConstructor) {
        const context = new AudioContextConstructor();
        const source = context.createMediaStreamSource(stream);
        const analyser = context.createAnalyser();
        analyser.fftSize = 512;
        source.connect(analyser);
        meterContextRef.current = context;
        const data = new Uint8Array(analyser.fftSize);
        meterTimerRef.current = window.setInterval(() => {
          analyser.getByteTimeDomainData(data);
          let sum = 0;
          for (const sample of data) { const normalized = (sample - 128) / 128; sum += normalized * normalized; }
          const level = Math.min(1, Math.sqrt(sum / data.length) * 5);
          setMic((current) => ({ ...current, level }));
        }, 100);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setMic({ status: "FAIL", track: "-", level: 0, error: message });
      log("GET_USER_MEDIA", `FAIL · ${message}`);
    } finally {
      setRunning("");
    }
  };

  const testAsr = () => {
    setRunning("asr");
    setAsr({ status: "STARTING", partial: "", final: "", error: "", event: "start called" });
    log("ASR start()", "CALLED");
    asrRef.current.start((text, isFinal) => {
      setAsr((current) => ({ ...current, status: isFinal ? "PASS" : "LISTENING", partial: isFinal ? current.partial : text, final: isFinal ? text : current.final, event: isFinal ? "onresult / final" : "onresult / partial" }));
      log("ASR onresult", `${isFinal ? "FINAL" : "PARTIAL"}: ${text}`);
    }, (message) => {
      setAsr((current) => ({ ...current, status: "FAIL", error: message, event: "onerror" }));
      log("ASR onerror", message);
      setRunning("");
    }, () => {
      setAsr((current) => ({ ...current, event: "onend" }));
      log("ASR onend", "FIRED");
      setRunning("");
    }, { onReady: () => { setAsr((current) => ({ ...current, status: "LISTENING", event: "onstart" })); log("ASR onstart", "FIRED"); }, onActivity: (event) => { setAsr((current) => ({ ...current, event: `on${event}` })); log(`ASR on${event}`, "FIRED"); }, onSessionEvent: (event: ASRSessionEvent) => { setAsr((current) => ({ ...current, event: `${event.type} · ${event.error || ""}` })); log(`ASR session ${event.type}`, event.error || `${event.sessionId} · ${event.sessionCount}`); } });
  };

  const stopAsr = () => { asrRef.current.stop(); setRunning(""); log("ASR stop()", "CALLED"); };

  const testTts = () => {
    setRunning("tts");
    setTts({ request: "PASS", bytes: "-", load: "-", play: "-", started: "NO", provider: "-", voice: "-", error: "" });
    ttsRef.current.unlockAudio();
    log("TTS REQUEST", "PASS");
    ttsRef.current.speak({ text: TEST_TEXT, voiceId: undefined, streaming: VOICE_FEATURES.streamingTts }, {
      onStart: () => { setTts((current) => ({ ...current, started: "YES", play: "PASS" })); log("PLAYBACK STARTED", "YES"); },
      onEnd: () => { setRunning(""); log("TTS onEnd", "FIRED"); },
      onError: (message) => { setTts((current) => ({ ...current, play: "FAIL", error: message })); setRunning(""); log("TTS onError", message); },
      onMetrics: (metrics: TTSMetrics) => setTts((current) => ({ ...current, bytes: metrics.audioBytes == null ? current.bytes : String(metrics.audioBytes), provider: metrics.provider, voice: metrics.voice, load: metrics.generationSuccess === false ? "FAIL" : metrics.generationSuccess ? "PASS" : current.load, error: metrics.error || metrics.fallbackReason || current.error })),
      onPlaybackSignal: (signal: TTSPlaybackSignal) => { if (signal.type === "loadedmetadata" || signal.type === "canplay") setTts((current) => ({ ...current, load: "PASS" })); if (signal.type === "error") setTts((current) => ({ ...current, play: "FAIL", error: signal.errorMessage || signal.errorName || "audio error" })); },
    });
  };

  const runTenTurns = async () => {
    setRunning("ten");
    const history: ChatMessage[] = [];
    const texts = ["你好，这是第1轮测试。", "我刚才说得有点急。", "你能接着回答吗？", "我在检查连续对话。", "现在是第5轮。", "声音和文字都要正常。", "继续测试第7轮。", "不要跳过这一轮。", "马上到第9轮了。", "这是第10轮测试。"];
    try {
      for (let index = 0; index < texts.length; index += 1) {
        const userText = texts[index];
        history.push({ role: "user", content: userText });
        const response = await fetch(apiUrl("/api/chat"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ history, userMessage: userText, sceneContext: "稳定语音链路 smoke test", scenarioId: "free", debug: false }) });
        const data = await response.json() as { text?: string; reply?: string; error?: string };
        const reply = data.text || data.reply;
        if (!response.ok || !reply) throw new Error(data.error || `turn ${index + 1} LLM failed`);
        history.push({ role: "assistant", content: reply });
        await new Promise<void>((resolve, reject) => ttsRef.current.speak({ text: reply, streaming: false }, { onEnd: resolve, onError: reject }));
        log(`TURN ${index + 1}`, "MIC/ASR skipped in automated smoke; LLM/TTS PASS");
      }
      log("10 TURN TEST", "PASS");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log("10 TURN TEST", `FAIL · ${message}`);
    } finally { setRunning(""); }
  };

  useEffect(() => () => { asrRef.current.stop(); ttsRef.current.stop(); stopMic(); }, []);

  return <main className="min-h-[100dvh] bg-[#141313] px-5 py-8 text-[#f4efeb] sm:px-8"><div className="mx-auto max-w-3xl"><a href={sitePath("/")} className="text-xs text-[#e98972]">← 返回主页面</a><h1 className="mt-5 text-3xl font-medium">Voice Smoke Test</h1><p className="mt-2 text-sm leading-6 text-[#9f9795]">只测试 MIC / ASR / TTS 原子能力，不加载 Relationship Engine、EOT 或复盘模块。</p><p className="mt-2 text-xs text-[#e98972]">VOICE_MODE: {VOICE_FEATURES.mode} · BARGE_IN: OFF · STREAMING_TTS: OFF · ADVANCED_VAD: OFF</p>
    <section className="mt-8 grid gap-4 md:grid-cols-3"><article className="rounded-3xl border border-white/10 bg-[#1b1818] p-5"><h2 className="text-lg">1. 麦克风</h2><p className="mt-2 text-xs text-[#9f9795]">先点测试，再对着麦克风说话，音量条应变化。</p><div className="mt-4 h-3 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-[#e98972] transition-all" style={{ width: `${Math.round(mic.level * 100)}%` }} /></div><div className="mt-4 space-y-2 text-xs"><p>GET_USER_MEDIA: <Result value={mic.status} /></p><p>TRACK: <Result value={mic.track} /></p><p>AUDIO LEVEL: <Result value={mic.level.toFixed(3)} /></p><p>ERROR: <Result value={mic.error} /></p></div><button type="button" onClick={() => void testMic()} disabled={Boolean(running)} className="mt-5 rounded-full bg-[#e98972] px-4 py-2 text-sm text-[#241615] disabled:opacity-40">测试麦克风</button></article>
      <article className="rounded-3xl border border-white/10 bg-[#1b1818] p-5"><h2 className="text-lg">2. ASR</h2><p className="mt-2 text-xs text-[#9f9795]">请说：“{TEST_PHRASE}”</p><div className="mt-4 space-y-2 text-xs"><p>ASR: <Result value={asr.status} /></p><p>EVENT: <Result value={asr.event} /></p><p>PARTIAL: <Result value={asr.partial} /></p><p>FINAL: <Result value={asr.final} /></p><p>ERROR: <Result value={asr.error} /></p></div><div className="mt-5 flex gap-2"><button type="button" onClick={testAsr} disabled={Boolean(running)} className="rounded-full bg-[#e98972] px-4 py-2 text-sm text-[#241615] disabled:opacity-40">测试语音识别</button><button type="button" onClick={stopAsr} className="rounded-full border border-white/15 px-4 py-2 text-sm">停止</button></div></article>
      <article className="rounded-3xl border border-white/10 bg-[#1b1818] p-5"><h2 className="text-lg">3. TTS</h2><p className="mt-2 text-xs text-[#9f9795]">固定文本：{TEST_TEXT}</p><div className="mt-4 space-y-2 text-xs"><p>TTS REQUEST: <Result value={tts.request} /></p><p>AUDIO BYTES: <Result value={tts.bytes} /></p><p>AUDIO LOAD: <Result value={tts.load} /></p><p>AUDIO PLAY: <Result value={tts.play} /></p><p>PLAYBACK STARTED: <Result value={tts.started} /></p><p>PROVIDER / VOICE: <Result value={`${tts.provider} / ${tts.voice}`} /></p><p>ERROR: <Result value={tts.error} /></p></div><button type="button" onClick={testTts} disabled={Boolean(running)} className="mt-5 rounded-full bg-[#e98972] px-4 py-2 text-sm text-[#241615] disabled:opacity-40">测试 AI 声音</button></article></section>
    <section className="mt-4 rounded-3xl border border-white/10 bg-[#1b1818] p-5"><h2 className="text-lg">连续链路检查</h2><p className="mt-2 text-xs leading-5 text-[#9f9795]">执行 10 轮 LLM → TTS 播放，MIC/ASR 仍需在上方独立测试；任何一轮失败都会记录 FAIL。</p><button type="button" onClick={() => void runTenTurns()} disabled={Boolean(running)} className="mt-4 rounded-full border border-[#e98972]/50 px-4 py-2 text-sm text-[#f6a08b] disabled:opacity-40">运行 10 轮链路测试</button></section>
    <section className="mt-4 rounded-3xl border border-white/10 bg-[#1b1818] p-5"><h2 className="text-lg">原始事件日志</h2><div className="mt-4 max-h-80 overflow-auto space-y-2 text-xs">{logs.length === 0 ? <p className="text-[#817876]">尚未开始测试。</p> : logs.map((entry, index) => <p key={`${entry.at}-${index}`}><span className="text-[#817876]">{entry.at}</span> <span className="text-[#e98972]">{entry.label}</span> <span>{entry.value}</span></p>)}</div></section></div></main>;
}

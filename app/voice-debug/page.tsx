"use client";

import { useEffect, useRef, useState } from "react";
import { apiUrl, sitePath } from "@/lib/api";

const BUILD_SHA = process.env.NEXT_PUBLIC_BUILD_SHA || "LOCAL/UNSET";
const BUILD_TIME = process.env.NEXT_PUBLIC_BUILD_TIME || "LOCAL/UNSET";
const LOCAL_AUDIO = "/voice-tests/zh_female_meilinvyou_saturn_bigtts-softening.mp3";
const TTS_TEXT = "你好，这是AI声音测试。";

type VoiceEvent = { time: string; module: string; event: string; status: string; detail: string };
type MicState = { permission: string; getUserMedia: string; stream: string; track: string; muted: string; level: number; error: string };
type AsrState = { available: string; constructor: string; startCalled: string; started: string; speechDetected: string; resultReceived: string; lastError: string; ended: string; transcript: string };
type AudioState = { context: string; lastRequest: string; lastResponse: string; audioBytes: string };
type PlaybackState = { playCalled: string; playResolved: string; playing: string; currentTime: number; ended: string; error: string };

function timeWithMs() {
  const now = new Date();
  return `${now.toLocaleTimeString()}.${String(now.getMilliseconds()).padStart(3, "0")}`;
}

function getAudioContextConstructor() {
  if (typeof window === "undefined") return undefined;
  return window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
}

function Result({ value }: { value: unknown }) {
  return <span className="text-[#d6cbc8]">{value == null || value === "" ? "-" : String(value)}</span>;
}

export default function VoiceDebugPage() {
  const [events, setEvents] = useState<VoiceEvent[]>([]);
  const eventsRef = useRef<VoiceEvent[]>([]);
  const [mic, setMic] = useState<MicState>({ permission: "-", getUserMedia: "-", stream: "-", track: "-", muted: "-", level: 0, error: "" });
  const [asr, setAsr] = useState<AsrState>({ available: "-", constructor: "-", startCalled: "-", started: "-", speechDetected: "-", resultReceived: "-", lastError: "", ended: "-", transcript: "" });
  const [audio, setAudio] = useState<AudioState>({ context: "NOT_CREATED", lastRequest: "-", lastResponse: "-", audioBytes: "-" });
  const [playback, setPlayback] = useState<PlaybackState>({ playCalled: "-", playResolved: "-", playing: "-", currentTime: 0, ended: "-", error: "" });
  const [running, setRunning] = useState("");
  const [copied, setCopied] = useState(false);
  const [network, setNetwork] = useState("-");
  const streamRef = useRef<MediaStream | null>(null);
  const analyserContextRef = useRef<AudioContext | null>(null);
  const meterTimerRef = useRef<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playbackTimerRef = useRef<number | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const heartbeatRef = useRef<number | null>(null);
  const noInputTimerRef = useRef<number | null>(null);

  const trace = (module: string, event: string, status = "INFO", detail = "") => {
    const entry = { time: timeWithMs(), module, event, status, detail };
    eventsRef.current = [...eventsRef.current, entry].slice(-240);
    setEvents(eventsRef.current);
  };

  const setNetworkSnapshot = () => {
    const connection = (navigator as Navigator & { connection?: { effectiveType?: string; downlink?: number; rtt?: number } }).connection;
    const value = `online=${navigator.onLine} · effectiveType=${connection?.effectiveType || "-"} · rtt=${connection?.rtt ?? "-"}ms`;
    setNetwork(value);
    trace("NETWORK", "NETWORK_SNAPSHOT", "INFO", value);
  };

  const getAudio = () => {
    if (!audioRef.current) {
      const element = new Audio();
      element.preload = "auto";
      element.setAttribute("playsinline", "true");
      element.setAttribute("webkit-playsinline", "true");
      audioRef.current = element;
    }
    return audioRef.current;
  };

  const stopMic = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (meterTimerRef.current !== null) window.clearInterval(meterTimerRef.current);
    meterTimerRef.current = null;
    setMic((current) => ({ ...current, stream: "released", track: "ended" }));
    trace("MIC", "MIC_RELEASE", "INFO");
  };

  const stopAsr = () => {
    if (heartbeatRef.current !== null) window.clearTimeout(heartbeatRef.current);
    if (noInputTimerRef.current !== null) window.clearTimeout(noInputTimerRef.current);
    heartbeatRef.current = null;
    noInputTimerRef.current = null;
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setAsr((current) => ({ ...current, ended: "stop() called" }));
    trace("ASR", "ASR_STOP_CALLED", "INFO");
  };

  const ensureAudioContext = async () => {
    const Constructor = getAudioContextConstructor();
    if (!Constructor) {
      setAudio((current) => ({ ...current, context: "UNAVAILABLE" }));
      trace("AUDIO", "AUDIO_CONTEXT_UNAVAILABLE", "ERROR");
      return null;
    }
    if (!analyserContextRef.current || analyserContextRef.current.state === "closed") analyserContextRef.current = new Constructor();
    const context = analyserContextRef.current;
    trace("AUDIO", "AUDIO_CONTEXT_CREATED", "OK", context.state);
    setAudio((current) => ({ ...current, context: context.state }));
    if (context.state === "suspended" || context.state === "interrupted") {
      trace("AUDIO", "AUDIO_CONTEXT_RESUME_START", "INFO", context.state);
      try {
        await context.resume();
        trace("AUDIO", "AUDIO_CONTEXT_RESUME_RESOLVED", "OK", context.state);
      } catch (error) {
        trace("AUDIO", "AUDIO_CONTEXT_RESUME_ERROR", "ERROR", error instanceof Error ? error.message : String(error));
      }
    }
    setAudio((current) => ({ ...current, context: context.state }));
    return context;
  };

  const testMic = async () => {
    setRunning("mic");
    stopMic();
    setNetworkSnapshot();
    trace("VOICE", "VOICE_START_CLICK", "OK", "A 测试麦克风");
    trace("MIC", "SECURE_CONTEXT_CHECK", window.isSecureContext ? "OK" : "ERROR", String(window.isSecureContext));
    trace("MIC", "MEDIA_DEVICES_CHECK", navigator.mediaDevices ? "OK" : "ERROR", String(Boolean(navigator.mediaDevices)));
    const hasGetUserMedia = Boolean(navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === "function");
    trace("MIC", "GET_USER_MEDIA_EXISTS", hasGetUserMedia ? "OK" : "ERROR", String(hasGetUserMedia));
    let permission = "unavailable";
    try {
      if (navigator.permissions?.query) permission = (await navigator.permissions.query({ name: "microphone" as PermissionName })).state;
    } catch (error) {
      trace("MIC", "PERMISSION_QUERY_ERROR", "INFO", error instanceof Error ? error.message : String(error));
    }
    setMic((current) => ({ ...current, permission }));
    const startedAt = performance.now();
    trace("MIC", "GET_USER_MEDIA_START", "INFO", String(startedAt));
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("getUserMedia unavailable");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const resolvedAt = performance.now();
      streamRef.current = stream;
      const track = stream.getAudioTracks()[0];
      trace("MIC", "GET_USER_MEDIA_RESOLVE", "OK", `${Math.round(resolvedAt - startedAt)}ms`);
      trace("MIC", "MEDIA_STREAM_CREATED", stream.active ? "OK" : "ERROR", `id=${stream.id} active=${stream.active}`);
      trace("MIC", "AUDIO_TRACK_CREATED", track ? "OK" : "ERROR", String(stream.getAudioTracks().length));
      trace("MIC", "TRACK_READY_STATE", track?.readyState === "live" ? "OK" : "ERROR", track?.readyState || "missing");
      trace("MIC", "TRACK_MUTED", track?.muted ? "WARN" : "OK", String(track?.muted ?? "missing"));
      setMic({ permission: "granted", getUserMedia: "resolved", stream: stream.id, track: track?.readyState || "missing", muted: String(track?.muted ?? "missing"), level: 0, error: "" });
      const context = await ensureAudioContext();
      if (context && track) {
        const source = context.createMediaStreamSource(stream);
        const analyser = context.createAnalyser();
        analyser.fftSize = 512;
        source.connect(analyser);
        const data = new Uint8Array(analyser.fftSize);
        const levelStartedAt = performance.now();
        meterTimerRef.current = window.setInterval(() => {
          analyser.getByteTimeDomainData(data);
          let sum = 0;
          for (const sample of data) { const normalized = (sample - 128) / 128; sum += normalized * normalized; }
          const level = Math.min(100, Math.round(Math.sqrt(sum / data.length) * 500));
          setMic((current) => ({ ...current, level }));
          if (performance.now() - levelStartedAt > 3000 && level === 0) {
            trace("MIC", "MIC_LIVE_BUT_NO_AUDIO_DATA", "ERROR", `track=${track.readyState}`);
          }
        }, 100);
        trace("MIC", "MIC_LEVEL_MONITOR_STARTED", "OK", context.state);
      }
    } catch (error) {
      const exception = error as DOMException;
      const detail = `${exception?.name || "Error"}: ${error instanceof Error ? error.message : String(error)}`;
      setMic((current) => ({ ...current, getUserMedia: "error", error: detail }));
      trace("MIC", "GET_USER_MEDIA_ERROR", "ERROR", detail);
    } finally {
      setRunning("");
    }
  };

  const createRecognition = () => {
    const constructors = window as Window & { SpeechRecognition?: new () => SpeechRecognition; webkitSpeechRecognition?: new () => SpeechRecognition };
    const Recognition = constructors.SpeechRecognition || constructors.webkitSpeechRecognition;
    const constructorName = constructors.SpeechRecognition ? "SpeechRecognition" : constructors.webkitSpeechRecognition ? "webkitSpeechRecognition" : "NONE";
    setAsr((current) => ({ ...current, available: Recognition ? "yes" : "no", constructor: constructorName }));
    trace("ASR", "ASR_AVAILABLE", Recognition ? "OK" : "ERROR", `SpeechRecognition=${Boolean(constructors.SpeechRecognition)} webkit=${Boolean(constructors.webkitSpeechRecognition)}`);
    if (!Recognition) return null;
    const recognition = new Recognition();
    recognition.lang = "zh-CN";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    trace("ASR", "ASR_INSTANCE_CREATED", "OK", `actual=${constructorName} lang=${recognition.lang} continuous=${recognition.continuous} interimResults=${recognition.interimResults} maxAlternatives=${recognition.maxAlternatives}`);
    return recognition;
  };

  const startAsr = (resolveFinal?: (text: string) => void, rejectError?: (error: Error) => void) => {
    stopAsr();
    const recognition = createRecognition();
    if (!recognition) return false;
    recognitionRef.current = recognition;
    const noInputStartedAt = performance.now();
    let started = false;
    let speechDetected = false;
    const markActivity = (event: string) => {
      trace("ASR", event, "OK");
      if (["ASR_ONSPEECHSTART", "ASR_ONRESULT"].includes(event)) {
        speechDetected = true;
        setAsr((current) => ({ ...current, speechDetected: "yes" }));
      }
    };
    const recognitionEvents = recognition as SpeechRecognition & { onstart?: () => void; onaudiostart?: () => void; onsoundstart?: () => void; onspeechstart?: () => void; onspeechend?: () => void; onsoundend?: () => void; onaudioend?: () => void };
    recognitionEvents.onstart = () => { started = true; setAsr((current) => ({ ...current, started: "yes" })); trace("ASR", "ASR_ONSTART", "OK"); };
    recognitionEvents.onaudiostart = () => markActivity("ASR_ONAUDIOSTART");
    recognitionEvents.onsoundstart = () => markActivity("ASR_ONSOUNDSTART");
    recognitionEvents.onspeechstart = () => markActivity("ASR_ONSPEECHSTART");
    recognitionEvents.onspeechend = () => markActivity("ASR_ONSPEECHEND");
    recognitionEvents.onsoundend = () => markActivity("ASR_ONSOUNDEND");
    recognitionEvents.onaudioend = () => markActivity("ASR_ONAUDIOEND");
    recognition.onresult = (event: SpeechRecognitionEvent) => {
      speechDetected = true;
      setAsr((current) => ({ ...current, resultReceived: "yes" }));
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const alternatives = Array.from(result).map((item) => `${item.transcript.trim()} (${item.confidence})`).join(" | ");
        const transcript = result[0]?.transcript.trim() || "";
        trace("ASR", "ASR_ONRESULT", "OK", `resultIndex=${index} isFinal=${result.isFinal} transcript=${transcript} alternatives=${alternatives}`);
        setAsr((current) => ({ ...current, transcript: `${current.transcript}${transcript}` }));
        if (result.isFinal && resolveFinal && transcript) resolveFinal(transcript);
      }
    };
    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      const detail = event.error;
      setAsr((current) => ({ ...current, lastError: detail }));
      trace("ASR", "ASR_ONERROR", "ERROR", detail);
      rejectError?.(new Error(detail));
    };
    recognition.onend = () => { setAsr((current) => ({ ...current, ended: "yes" })); trace("ASR", "ASR_ONEND", "INFO"); };
    trace("ASR", "ASR_START_CALLED", "INFO");
    setAsr((current) => ({ ...current, startCalled: "yes", started: "waiting" }));
    try { recognition.start(); } catch (error) { trace("ASR", "ASR_START_ERROR", "ERROR", error instanceof Error ? error.message : String(error)); }
    heartbeatRef.current = window.setTimeout(() => {
      if (recognitionRef.current === recognition && !started) trace("ASR", "ASR_START_NO_EVENT", "ERROR", "1500ms 内未收到 onstart");
    }, 1500);
    noInputTimerRef.current = window.setTimeout(() => {
      if (recognitionRef.current === recognition && performance.now() - noInputStartedAt >= 3000 && !speechDetected) trace("ASR", "ASR_RUNNING_NO_INPUT", "WARN", "3s 内无 speechstart/result");
    }, 3000);
    return true;
  };

  const testAsr = () => {
    setRunning("asr");
    trace("VOICE", "VOICE_START_CLICK", "OK", "B 测试语音识别");
    if (!startAsr()) setRunning("");
    else window.setTimeout(() => setRunning(""), 12000);
  };

  const playSource = async (source: string, label: string) => {
    const audioElement = getAudio();
    if (playbackTimerRef.current !== null) window.clearInterval(playbackTimerRef.current);
    audioElement.pause();
    audioElement.currentTime = 0;
    audioElement.muted = false;
    audioElement.volume = 1;
    audioElement.src = source;
    audioElement.load();
    trace("PLAYBACK", "AUDIO_LOAD_START", "INFO", label);
    const finished = new Promise<void>((resolve) => {
      const timeout = window.setTimeout(() => { trace("PLAYBACK", "AUDIO_TIMEOUT", "ERROR", label); resolve(); }, 12000);
      audioElement.onloadedmetadata = () => trace("PLAYBACK", "AUDIO_LOADED_METADATA", "OK", `${label} duration=${audioElement.duration}`);
      audioElement.oncanplay = () => trace("PLAYBACK", "AUDIO_CANPLAY", "OK", `${label} readyState=${audioElement.readyState}`);
      audioElement.onplaying = () => { setPlayback((current) => ({ ...current, playing: "yes" })); trace("PLAYBACK", "AUDIO_PLAYING", "OK", label); };
      audioElement.ontimeupdate = () => { setPlayback((current) => ({ ...current, currentTime: audioElement.currentTime })); trace("PLAYBACK", "AUDIO_CURRENT_TIME", "INFO", `${label} ${audioElement.currentTime.toFixed(2)}s`); };
      audioElement.onended = () => { window.clearTimeout(timeout); setPlayback((current) => ({ ...current, ended: "yes", currentTime: audioElement.currentTime })); trace("PLAYBACK", "AUDIO_ENDED", "OK", `${label} ${audioElement.currentTime.toFixed(2)}s`); resolve(); };
      audioElement.onerror = () => { window.clearTimeout(timeout); const error = "HTMLAudioElement error"; setPlayback((current) => ({ ...current, error })); trace("PLAYBACK", "AUDIO_ERROR", "ERROR", `${label} ${error}`); resolve(); };
    });
    trace("PLAYBACK", "AUDIO_PLAY_CALLED", "INFO", `${label} volume=${audioElement.volume} muted=${audioElement.muted}`);
    setPlayback((current) => ({ ...current, playCalled: "yes", playResolved: "pending", playing: "no", ended: "no", currentTime: 0, error: "" }));
    try {
      await audioElement.play();
      setPlayback((current) => ({ ...current, playResolved: "yes" }));
      trace("PLAYBACK", "AUDIO_PLAY_RESOLVED", "OK", label);
    } catch (error) {
      const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      setPlayback((current) => ({ ...current, playResolved: "no", error: detail }));
      trace("PLAYBACK", "AUDIO_PLAY_REJECTED", "ERROR", `${label} ${detail}`);
    }
    playbackTimerRef.current = window.setInterval(() => setPlayback((current) => ({ ...current, currentTime: audioElement.currentTime })), 250);
    await finished;
    if (playbackTimerRef.current !== null) window.clearInterval(playbackTimerRef.current);
    playbackTimerRef.current = null;
  };

  const testLocalAudio = async () => {
    setRunning("local");
    trace("VOICE", "VOICE_START_CLICK", "OK", "C 测试本地声音");
    void ensureAudioContext();
    await playSource(sitePath(LOCAL_AUDIO), "LOCAL_AUDIO");
    setRunning("");
  };

  const requestTtsAudio = async (label: string) => {
    setNetworkSnapshot();
    const startedAt = performance.now();
    trace("TTS", "TTS_REQUEST_START", "INFO", `${label} ${TTS_TEXT}`);
    setAudio((current) => ({ ...current, lastRequest: "sent", lastResponse: "pending", audioBytes: "-" }));
    try {
      const response = await fetch(`${apiUrl("/api/tts")}?stream=false`, { method: "POST", headers: { "Content-Type": "application/json", "X-TTS-Stream": "false" }, body: JSON.stringify({ text: TTS_TEXT, streaming: false }) });
      trace("TTS", "TTS_RESPONSE", response.ok ? "OK" : "ERROR", `HTTP_STATUS=${response.status} latency=${Math.round(performance.now() - startedAt)}ms`);
      setAudio((current) => ({ ...current, lastResponse: String(response.status) }));
      if (!response.ok) {
        const detail = await response.text().catch(() => "TTS request failed");
        trace("TTS", "TTS_ERROR", "ERROR", detail.slice(0, 300));
        return null;
      }
      const mime = response.headers.get("content-type") || "";
      const blob = await response.blob();
      setAudio((current) => ({ ...current, audioBytes: String(blob.size) }));
      trace("TTS", "TTS_AUDIO_BYTES", blob.size > 0 ? "OK" : "ERROR", `${blob.size}`);
      trace("TTS", "TTS_MIME", "INFO", mime || blob.type || "unknown");
      if (!blob.size) return null;
      const url = URL.createObjectURL(blob);
      objectUrlRef.current = url;
      trace("TTS", "AUDIO_URL_CREATED", "OK", "blob URL created");
      return url;
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      trace("NETWORK", "TTS_NETWORK_ERROR", "ERROR", `${detail} latency=${Math.round(performance.now() - startedAt)}ms`);
      setAudio((current) => ({ ...current, lastResponse: "NETWORK_ERROR" }));
      return null;
    }
  };

  const testTts = async () => {
    setRunning("tts");
    trace("VOICE", "VOICE_START_CLICK", "OK", "D 测试AI声音");
    void ensureAudioContext();
    const url = await requestTtsAudio("D");
    if (url) await playSource(url, "SEED_TTS");
    setRunning("");
  };

  const testFullConversation = async () => {
    setRunning("full");
    trace("VOICE", "VOICE_START_CLICK", "OK", "E 测试完整对话");
    trace("MIC", "SECURE_CONTEXT_CHECK", window.isSecureContext ? "OK" : "ERROR", String(window.isSecureContext));
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const track = stream.getAudioTracks()[0];
      trace("MIC", "GET_USER_MEDIA_SUCCESS", "OK", `stream=${stream.id}`);
      trace("MIC", "TRACK_LIVE", track?.readyState === "live" ? "OK" : "ERROR", track?.readyState || "missing");
      setMic((current) => ({ ...current, permission: "granted", getUserMedia: "resolved", stream: stream.id, track: track?.readyState || "missing", muted: String(track?.muted ?? "missing") }));
      const userText = await new Promise<string>((resolve, reject) => {
        if (!startAsr(resolve, reject)) reject(new Error("ASR unavailable"));
      });
      trace("VOICE", "USER_FINAL_TEXT", "OK", userText);
      stopAsr();
      stopMic();
      trace("NETWORK", "CHAT_REQUEST_START", "INFO");
      const response = await fetch(apiUrl("/api/chat"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ history: [], userMessage: userText, scenarioId: "free", sceneContext: "voice-debug forensic test", debug: false }) });
      trace("NETWORK", "CHAT_RESPONSE", response.ok ? "OK" : "ERROR", `HTTP_STATUS=${response.status}`);
      const data = await response.json() as { text?: string; reply?: string; error?: string };
      const reply = data.text || data.reply;
      if (!response.ok || !reply) throw new Error(data.error || "chat response has no text");
      trace("VOICE", "AI_TEXT_READY", "OK", reply);
      const url = await requestTtsAudio("E");
      if (!url) throw new Error("TTS did not return audio");
      await playSource(url, "FULL_CONVERSATION_TTS");
      trace("VOICE", "FULL_CONVERSATION_DONE", "OK");
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      trace("VOICE", "FULL_CONVERSATION_ERROR", "ERROR", detail);
    } finally {
      stopAsr();
      stopMic();
      setRunning("");
    }
  };

  const reportText = () => {
    const device = typeof navigator === "undefined" ? "server" : `${navigator.userAgent}\nonline=${navigator.onLine}`;
    return [
      "MOBILE VOICE FORENSICS REPORT",
      `DEVICE\n${device}`,
      `BUILD\nversion=voice-debug\ncommit=${BUILD_SHA}\ntime=${BUILD_TIME}`,
      `NETWORK\n${network}`,
      `MIC\n${JSON.stringify(mic, null, 2)}`,
      `ASR\n${JSON.stringify(asr, null, 2)}`,
      `AUDIO\n${JSON.stringify(audio, null, 2)}`,
      `TTS\ntext=${TTS_TEXT}`,
      `PLAYBACK\n${JSON.stringify(playback, null, 2)}`,
      "PREPARING_MIC_STATE_SOURCE\napp/page.tsx:636, 723, 741\nvariable=realtimeState\nentry=startListening/resumeListening/startVoiceConversation\nexit=lib/providers.ts:onstart -> app/page.tsx:689-694, or RECOVERING_ASR/ERROR on timeout/error\nwaiting=AudioSessionManager.prepareForListening then SpeechRecognition onstart",
      "EVENT LOG",
      ...eventsRef.current.map((event) => `${event.time}\t${event.module}\t${event.event}\t${event.status}\t${event.detail}`),
    ].join("\n");
  };

  const copyReport = async () => {
    const report = reportText();
    try {
      await navigator.clipboard.writeText(report);
      setCopied(true);
      trace("REPORT", "REPORT_COPIED", "OK", `${report.length} chars`);
      window.setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      trace("REPORT", "REPORT_COPY_ERROR", "ERROR", error instanceof Error ? error.message : String(error));
    }
  };

  useEffect(() => {
    const onLifecycle = (event: string) => {
      const state = analyserContextRef.current?.state || "NOT_CREATED";
      setAudio((current) => ({ ...current, context: state }));
      trace("LIFECYCLE", event, "INFO", `visibility=${document.visibilityState} audioContext=${state}`);
      if (state === "suspended" || state === "interrupted") void analyserContextRef.current?.resume().then(() => trace("LIFECYCLE", "AUDIO_CONTEXT_RESUMED", "OK", analyserContextRef.current?.state || "unknown")).catch((error) => trace("LIFECYCLE", "AUDIO_CONTEXT_RESUME_ERROR", "ERROR", error instanceof Error ? error.message : String(error)));
    };
    const onOnline = () => { setNetworkSnapshot(); trace("NETWORK", "ONLINE", "OK"); };
    const onOffline = () => { setNetworkSnapshot(); trace("NETWORK", "OFFLINE", "ERROR"); };
    window.addEventListener("pageshow", () => onLifecycle("PAGESHOW"));
    window.addEventListener("focus", () => onLifecycle("FOCUS"));
    document.addEventListener("visibilitychange", () => onLifecycle("VISIBILITYCHANGE"));
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    trace("BOOT", "PAGE_READY", "OK", `build=${BUILD_SHA}`);
    setNetworkSnapshot();
    return () => {
      stopAsr();
      stopMic();
      audioRef.current?.pause();
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      void analyserContextRef.current?.close();
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  useEffect(() => {
    try { localStorage.setItem("voice_debug_last_report", reportText()); } catch { /* diagnostics must remain usable when storage is blocked */ }
  }, [events, mic, asr, audio, playback, network]);

  const statusText = running ? `正在执行：${running}` : "等待你选择一个测试";

  return <main className="min-h-[100dvh] bg-[#141313] px-5 py-8 text-[#f4efeb] sm:px-8"><div className="mx-auto max-w-6xl"><a href={sitePath("/")} className="text-xs text-[#e98972]">← 返回对话</a><header className="mt-5 border-b border-white/10 pb-6"><p className="text-[10px] tracking-[0.16em] text-[#e98972]">MOBILE VOICE FORENSICS · OBSERVE FIRST</p><h1 className="mt-2 text-3xl font-medium tracking-[-0.04em]">Voice Debug</h1><p className="mt-3 max-w-3xl text-sm leading-6 text-[#a9a09e]">只记录真实事件，不改变正式 Voice 行为。A/B/C/D/E 分开执行；请在 iPhone 上按顺序测试并复制报告。</p><div className="mt-4 grid gap-2 text-xs text-[#d6cbc8] sm:grid-cols-3"><p>BUILD VERSION：<Result value="voice-debug" /></p><p>GIT COMMIT SHA：<Result value={BUILD_SHA} /></p><p>BUILD TIME：<Result value={BUILD_TIME} /></p></div><p className="mt-3 text-xs text-[#f6a08b]">{statusText}</p></header>
    <section className="mt-6 rounded-3xl border border-[#e98972]/30 bg-[#1b1818] p-5"><h2 className="text-lg">PREPARING_MIC_STATE_SOURCE</h2><div className="mt-4 grid gap-2 text-xs leading-5 text-[#c7bdb9] sm:grid-cols-2"><p>文件：<Result value="app/page.tsx:636, 723, 741" /></p><p>变量：<Result value="realtimeState" /></p><p>进入条件：<Result value="startListening / resumeListening / startVoiceConversation" /></p><p>退出条件：<Result value="ASR onstart → LISTENING；超时/错误 → RECOVERING_ASR 或 ERROR" /></p><p className="sm:col-span-2">当前等待链：<Result value="AudioSessionManager.prepareForListening → 160ms → SpeechRecognition.start() → onstart" /></p></div></section>
    <section className="mt-6 grid gap-4 md:grid-cols-2"><article className="rounded-3xl border border-white/10 bg-[#1b1818] p-5"><h2 className="text-lg">A · 测试麦克风</h2><p className="mt-2 text-xs leading-5 text-[#9f9795]">真实 getUserMedia + track + AnalyserNode。说话时 MIC LEVEL 应变化。</p><div className="mt-4 h-3 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-[#e98972] transition-all" style={{ width: `${mic.level}%` }} /></div><div className="mt-4 grid gap-2 text-xs sm:grid-cols-2"><p>permission：<Result value={mic.permission} /></p><p>getUserMedia：<Result value={mic.getUserMedia} /></p><p>stream：<Result value={mic.stream} /></p><p>track：<Result value={mic.track} /></p><p>muted：<Result value={mic.muted} /></p><p>MIC LEVEL：<Result value={`${mic.level}/100`} /></p><p className="sm:col-span-2">error：<Result value={mic.error} /></p></div><button type="button" onClick={() => void testMic()} disabled={Boolean(running)} className="mt-5 rounded-full bg-[#e98972] px-4 py-2 text-sm text-[#241615] disabled:opacity-40">A 测试麦克风</button><button type="button" onClick={stopMic} className="ml-2 rounded-full border border-white/15 px-4 py-2 text-sm">释放</button></article>
      <article className="rounded-3xl border border-white/10 bg-[#1b1818] p-5"><h2 className="text-lg">B · 测试语音识别</h2><p className="mt-2 text-xs leading-5 text-[#9f9795]">独立创建原生 SpeechRecognition，完整记录 onstart/onresult/onend/onerror 及所有音频事件。</p><div className="mt-4 grid gap-2 text-xs sm:grid-cols-2"><p>available：<Result value={asr.available} /></p><p>constructor：<Result value={asr.constructor} /></p><p>startCalled：<Result value={asr.startCalled} /></p><p>started：<Result value={asr.started} /></p><p>speechDetected：<Result value={asr.speechDetected} /></p><p>resultReceived：<Result value={asr.resultReceived} /></p><p>ended：<Result value={asr.ended} /></p><p>lastError：<Result value={asr.lastError} /></p><p className="sm:col-span-2">transcript：<Result value={asr.transcript} /></p></div><button type="button" onClick={testAsr} disabled={Boolean(running)} className="mt-5 rounded-full bg-[#e98972] px-4 py-2 text-sm text-[#241615] disabled:opacity-40">B 测试语音识别</button><button type="button" onClick={stopAsr} className="ml-2 rounded-full border border-white/15 px-4 py-2 text-sm">停止 ASR</button></article>
      <article className="rounded-3xl border border-white/10 bg-[#1b1818] p-5"><h2 className="text-lg">C · 测试本地声音</h2><p className="mt-2 text-xs leading-5 text-[#9f9795]">绕过 TTS 服务，只播放项目本地短音频。</p><div className="mt-4 grid gap-2 text-xs sm:grid-cols-2"><p>playCalled：<Result value={playback.playCalled} /></p><p>playResolved：<Result value={playback.playResolved} /></p><p>playing：<Result value={playback.playing} /></p><p>currentTime：<Result value={playback.currentTime.toFixed(2)} /></p><p>ended：<Result value={playback.ended} /></p><p className="sm:col-span-2">error：<Result value={playback.error} /></p></div><button type="button" onClick={() => void testLocalAudio()} disabled={Boolean(running)} className="mt-5 rounded-full bg-[#e98972] px-4 py-2 text-sm text-[#241615] disabled:opacity-40">C 测试本地声音</button></article>
      <article className="rounded-3xl border border-white/10 bg-[#1b1818] p-5"><h2 className="text-lg">D · 测试 AI 声音</h2><p className="mt-2 text-xs leading-5 text-[#9f9795]">不启动麦克风、不启动 ASR、不调用 LLM，只请求现有 Seed-TTS。</p><div className="mt-4 grid gap-2 text-xs sm:grid-cols-2"><p>lastRequest：<Result value={audio.lastRequest} /></p><p>lastResponse：<Result value={audio.lastResponse} /></p><p>audioBytes：<Result value={audio.audioBytes} /></p><p>AudioContext：<Result value={audio.context} /></p><p className="sm:col-span-2">text：<Result value={TTS_TEXT} /></p></div><button type="button" onClick={() => void testTts()} disabled={Boolean(running)} className="mt-5 rounded-full bg-[#e98972] px-4 py-2 text-sm text-[#241615] disabled:opacity-40">D 测试 AI 声音</button></article></section>
    <section className="mt-4 rounded-3xl border border-[#e98972]/25 bg-[#1b1818] p-5"><h2 className="text-lg">E · 测试完整对话</h2><p className="mt-2 text-xs leading-5 text-[#9f9795]">独立测试：麦克风 → ASR final → Chat API → Seed-TTS → HTMLAudio 播放。不会调用正式页面的状态机。</p><button type="button" onClick={() => void testFullConversation()} disabled={Boolean(running)} className="mt-5 rounded-full border border-[#e98972]/50 px-4 py-2 text-sm text-[#f6a08b] disabled:opacity-40">E 测试完整对话</button></section>
    <section className="mt-4 grid gap-4 md:grid-cols-2"><article className="rounded-3xl border border-white/10 bg-[#1b1818] p-5"><h2 className="text-lg">当前状态快照</h2><div className="mt-4 space-y-3 text-xs leading-5"><p className="text-[#e98972]">MIC</p><p>permission：<Result value={mic.permission} /> · getUserMedia：<Result value={mic.getUserMedia} /> · stream：<Result value={mic.stream} /> · track：<Result value={mic.track} /> · muted：<Result value={mic.muted} /> · level：<Result value={mic.level} /></p><p className="text-[#e98972]">ASR</p><p>available：<Result value={asr.available} /> · started：<Result value={asr.started} /> · speech：<Result value={asr.speechDetected} /> · result：<Result value={asr.resultReceived} /> · ended：<Result value={asr.ended} /></p><p className="text-[#e98972]">AUDIO / TTS / PLAYBACK</p><p>AudioContext：<Result value={audio.context} /> · TTS response：<Result value={audio.lastResponse} /> · bytes：<Result value={audio.audioBytes} /> · play：<Result value={playback.playCalled} /> · resolved：<Result value={playback.playResolved} /> · playing：<Result value={playback.playing} /> · currentTime：<Result value={playback.currentTime.toFixed(2)} /> · ended：<Result value={playback.ended} /></p><p className="text-[#e98972]">NETWORK</p><p><Result value={network} /></p></div></article><article className="rounded-3xl border border-white/10 bg-[#1b1818] p-5"><h2 className="text-lg">诊断报告</h2><p className="mt-2 text-xs leading-5 text-[#9f9795]">最近一次会自动保存到 localStorage：<code>voice_debug_last_report</code></p><button type="button" onClick={() => void copyReport()} className="mt-5 rounded-full bg-[#e98972] px-4 py-2 text-sm text-[#241615]">{copied ? "已复制" : "复制诊断报告"}</button><button type="button" onClick={() => { eventsRef.current = []; setEvents([]); trace("REPORT", "LOG_CLEARED", "INFO"); }} className="ml-2 rounded-full border border-white/15 px-4 py-2 text-sm">清空日志</button></article></section>
    <section className="mt-4 rounded-3xl border border-white/10 bg-[#1b1818] p-5"><h2 className="text-lg">VOICE EVENT LOG</h2><div className="mt-4 max-h-[34rem] overflow-auto space-y-2 text-xs">{events.length === 0 ? <p className="text-[#817876]">暂无事件</p> : events.map((event, index) => <p key={`${event.time}-${index}`} className="break-words"><span className="text-[#817876]">{event.time}</span> <span className="text-[#e98972]">{event.module}</span> <span className={event.status === "ERROR" ? "text-red-300" : event.status === "WARN" ? "text-yellow-200" : "text-[#f4efeb]"}>{event.event}</span> <span className="text-[#a9a09e]">[{event.status}] {event.detail}</span></p>)}</div></section>
    <p className="mt-5 text-xs leading-5 text-[#817876]">本轮只做 FORENSICS，不宣布修复。没有真实 iPhone 操作时，结果必须以 NOT PHYSICALLY VERIFIED 为准。</p></div></main>;
}

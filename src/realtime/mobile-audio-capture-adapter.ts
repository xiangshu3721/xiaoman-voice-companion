import { apiUrl } from "@/lib/api";
import { AdaptiveVadMonitor } from "@/src/realtime/adaptive-vad";
import type { ASRAdapter, ASRAdapterHandlers, ASRPrepareResult } from "@/src/realtime/asr-adapter";
import { BrowserASRAdapter } from "@/src/realtime/browser-asr-adapter";
import { MicrophonePermissionManager, type MicrophoneRequestResult } from "@/src/realtime/microphone-permission";

const AUDIO_CONSTRAINTS: MediaStreamConstraints = { audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } };

export class MobileAudioCaptureAdapter implements ASRAdapter {
  readonly mode = "cloud" as const;
  private readonly permission = new MicrophonePermissionManager();
  private readonly vad = new AdaptiveVadMonitor();
  private handlers: ASRAdapterHandlers = {};
  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private captureContext: AudioContext | null = null;
  private captureSource: MediaStreamAudioSourceNode | null = null;
  private captureProcessor: ScriptProcessorNode | null = null;
  private pcmChunks: Float32Array[] = [];
  private pcmSampleRate = 48000;
  private silenceTimer: number | null = null;
  private maxTimer: number | null = null;
  private speechDetected = false;
  private active = false;
  private recordingStartedAt = 0;
  private lastRms = 0;
  private resumeCaptureAfterPlayback = false;
  private browserFallback: BrowserASRAdapter | null = null;
  private diagnostics: Record<string, unknown> = { mode: "cloud", capture: "idle", asr: "idle", lastError: "" };

  async prepare(): Promise<ASRPrepareResult> {
    if (!this.isSupported()) return { ready: false, mode: "unavailable", message: "当前浏览器不支持网页录音。" };
    if (!window.isSecureContext) return { ready: false, mode: "unavailable", message: "请使用 HTTPS 打开页面后再使用语音。" };
    return { ready: true, mode: this.mode };
  }

  async requestMicrophone(): Promise<MicrophoneRequestResult> {
    const result = await this.permission.request(AUDIO_CONSTRAINTS);
    if (result.stream) this.setStream(result.stream);
    return result;
  }

  start() {
    if (this.browserFallback) { this.browserFallback.start(); return; }
    if (!this.stream || this.stream.getAudioTracks()[0]?.readyState !== "live") { this.handlers.onError?.("麦克风暂时不可用，请重新点击开始语音。"); return; }
    if (this.active) return;
    const mimeType = pickMimeType();
    if (mimeType) { try { this.recorder = new MediaRecorder(this.stream, { mimeType }); } catch { this.recorder = null; } }
    if (!this.recorder && !this.startPcmCapture()) { this.handlers.onError?.("当前浏览器暂时无法录音，请改用系统浏览器。"); return; }
    this.chunks = [];
    this.pcmChunks = [];
    this.speechDetected = false;
    this.active = true;
    this.recordingStartedAt = Date.now();
    this.diagnostics = { ...this.diagnostics, capture: "recording", asr: "idle", lastError: "" };
    if (this.recorder) {
      this.recorder.ondataavailable = (event) => { if (event.data.size) this.chunks.push(event.data); };
      this.recorder.onerror = () => this.fail("录音暂时中断，请再试一次。", false);
      this.recorder.onstop = () => { void this.transcribe(); };
      this.recorder.start(250);
    }
    this.handlers.onReady?.();
    void this.vad.start(this.stream, (update) => this.handleVad(update.active, update.rms));
    this.maxTimer = window.setTimeout(() => this.finishCapture(), 15000);
  }

  stop() {
    this.clearTimers();
    this.active = false;
    this.browserFallback?.stop();
    this.vad.stop();
    if (this.recorder) {
      if (this.recorder.state !== "inactive") this.recorder.stop();
      else void this.transcribe();
    } else if (this.captureProcessor) { this.stopPcmCapture(); void this.transcribe(); }
    this.diagnostics = { ...this.diagnostics, capture: "idle" };
  }

  suspendForPlayback() {
    this.stop();
    if (this.stream) { this.stream.getTracks().forEach((track) => track.stop()); this.stream = null; this.resumeCaptureAfterPlayback = true; this.diagnostics = { ...this.diagnostics, capture: "suspended-for-playback" }; }
  }

  async resumeAfterPlayback() {
    if (!this.resumeCaptureAfterPlayback) return this.stream;
    this.resumeCaptureAfterPlayback = false;
    const result = await this.requestMicrophone();
    if (!result.stream) throw new Error(result.message || "麦克风没有恢复");
    return result.stream;
  }

  destroy() { this.stop(); this.browserFallback?.destroy(); this.browserFallback = null; this.stream?.getTracks().forEach((track) => track.stop()); this.stream = null; this.handlers = {}; }
  setHandlers(handlers: ASRAdapterHandlers) { this.handlers = handlers; }
  setStream(stream: MediaStream | null) { if (this.stream !== stream) this.stream?.getTracks().forEach((track) => track.stop()); this.stream = stream; }
  getStream() { return this.stream; }
  isSupported() { return typeof window !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia) && (typeof MediaRecorder !== "undefined" || Boolean(window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)); }
  getDiagnostics() { return { ...this.diagnostics, active: this.active, speechDetected: this.speechDetected, lastRms: Number(this.lastRms.toFixed(4)), recorder: this.recorder?.state || (this.captureProcessor ? "pcm" : "none") }; }

  private handleVad(active: boolean, rms: number) {
    if (!this.active) return;
    this.lastRms = rms;
    this.handlers.onActivity?.(active ? "speechstart" : "speechend");
    if (active) { this.speechDetected = true; if (this.silenceTimer !== null) window.clearTimeout(this.silenceTimer); this.silenceTimer = null; return; }
    if (this.speechDetected && this.silenceTimer === null) this.silenceTimer = window.setTimeout(() => this.finishCapture(), 950);
  }

  private finishCapture() {
    if (!this.active) return;
    this.clearTimers();
    this.active = false;
    this.vad.stop();
    if (this.recorder && this.recorder.state !== "inactive") this.recorder.stop();
    else { this.stopPcmCapture(); void this.transcribe(); }
    this.diagnostics = { ...this.diagnostics, capture: "processing", asr: "processing", durationMs: Date.now() - this.recordingStartedAt };
  }

  private async transcribe() {
    const recorder = this.recorder;
    const mimeType = recorder?.mimeType || this.chunks[0]?.type || "audio/wav";
    const blob = recorder ? new Blob(this.chunks, { type: mimeType }) : encodeWav(this.pcmChunks, this.pcmSampleRate);
    this.recorder = null; this.chunks = []; this.pcmChunks = [];
    if (!this.speechDetected || blob.size < 128) { this.diagnostics = { ...this.diagnostics, capture: "idle", asr: "idle" }; this.handlers.onEnd?.(); return; }
    try {
      const body = new FormData();
      body.append("audio", blob, `voice.${extensionForMime(mimeType)}`);
      const response = await fetch(apiUrl("/api/asr"), { method: "POST", body, cache: "no-store" });
      const payload = await response.json().catch(() => ({})) as { text?: string; error?: string };
      if ((response.status === 404 || response.status === 503) && typeof window !== "undefined" && Boolean(window.SpeechRecognition || window.webkitSpeechRecognition)) {
        this.startBrowserFallback();
        return;
      }
      if (!response.ok || !payload.text?.trim()) throw new Error(payload.error || "云端语音识别暂时不可用");
      this.diagnostics = { ...this.diagnostics, capture: "idle", asr: "ready" };
      this.handlers.onFinal?.(payload.text.trim());
    } catch (error) { this.fail(error instanceof Error ? error.message : "云端语音识别暂时不可用", true); }
  }

  private fail(message: string, asrError: boolean) {
    this.clearTimers(); this.active = false; this.vad.stop(); this.stopPcmCapture();
    this.diagnostics = { ...this.diagnostics, capture: "idle", asr: asrError ? "error" : "idle", lastError: message };
    this.handlers.onError?.(message); this.handlers.onEnd?.();
  }

  private clearTimers() { if (this.silenceTimer !== null) window.clearTimeout(this.silenceTimer); if (this.maxTimer !== null) window.clearTimeout(this.maxTimer); this.silenceTimer = null; this.maxTimer = null; }

  private startPcmCapture() {
    const Constructor = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Constructor || !this.stream) return false;
    try {
      this.captureContext = new Constructor(); this.pcmSampleRate = this.captureContext.sampleRate; this.captureSource = this.captureContext.createMediaStreamSource(this.stream); this.captureProcessor = this.captureContext.createScriptProcessor(4096, 1, 1); this.pcmChunks = [];
      this.captureProcessor.onaudioprocess = (event) => { if (this.active) this.pcmChunks.push(new Float32Array(event.inputBuffer.getChannelData(0))); };
      const silentGain = this.captureContext.createGain(); silentGain.gain.value = 0; this.captureSource.connect(this.captureProcessor); this.captureProcessor.connect(silentGain); silentGain.connect(this.captureContext.destination); void this.captureContext.resume().catch(() => undefined); return true;
    } catch { this.stopPcmCapture(); return false; }
  }

  private stopPcmCapture() { this.captureProcessor?.disconnect(); this.captureSource?.disconnect(); this.captureProcessor = null; this.captureSource = null; if (this.captureContext) void this.captureContext.close().catch(() => undefined); this.captureContext = null; }

  private startBrowserFallback() {
    this.diagnostics = { ...this.diagnostics, capture: "idle", asr: "fallback-browser" };
    this.browserFallback = new BrowserASRAdapter();
    this.browserFallback.setHandlers(this.handlers);
    this.browserFallback.start();
  }
}

function pickMimeType() { if (typeof MediaRecorder === "undefined") return ""; return ["audio/mp4", "audio/ogg;codecs=opus"].find((type) => MediaRecorder.isTypeSupported(type)) || ""; }
function extensionForMime(mimeType: string) { if (mimeType.includes("mp4")) return "m4a"; if (mimeType.includes("ogg")) return "ogg"; if (mimeType.includes("wav")) return "wav"; return "webm"; }
function encodeWav(chunks: Float32Array[], sourceRate: number) {
  const source = new Float32Array(chunks.reduce((total, chunk) => total + chunk.length, 0)); let offset = 0; for (const chunk of chunks) { source.set(chunk, offset); offset += chunk.length; }
  const targetRate = 16000; const targetLength = Math.max(1, Math.floor(source.length * targetRate / sourceRate)); const buffer = new ArrayBuffer(44 + targetLength * 2); const view = new DataView(buffer);
  writeAscii(view, 0, "RIFF"); view.setUint32(4, 36 + targetLength * 2, true); writeAscii(view, 8, "WAVE"); writeAscii(view, 12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, targetRate, true); view.setUint32(28, targetRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true); writeAscii(view, 36, "data"); view.setUint32(40, targetLength * 2, true);
  for (let index = 0; index < targetLength; index += 1) { const sample = Math.max(-1, Math.min(1, source[Math.min(source.length - 1, Math.floor(index * sourceRate / targetRate))] || 0)); view.setInt16(44 + index * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true); }
  return new Blob([buffer], { type: "audio/wav" });
}
function writeAscii(view: DataView, offset: number, text: string) { for (let index = 0; index < text.length; index += 1) view.setUint8(offset + index, text.charCodeAt(index)); }

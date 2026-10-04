import type { AudioCapability } from "@/src/realtime/audio-capability";

export type VoiceCapability = AudioCapability & {
  mobileLike: boolean;
  webView: boolean;
  browserSpeechRecognition: boolean;
  preferredASR: "browser" | "cloud" | "unavailable";
  platform: string;
};

export function detectVoiceCapability(): VoiceCapability {
  const base = detectBaseCapability();
  const ua = typeof navigator === "undefined" ? "" : navigator.userAgent;
  const coarsePointer = typeof window !== "undefined" && Boolean(window.matchMedia?.("(pointer: coarse)").matches);
  const webView = /MicroMessenger|; wv\)|\bwv\b|WebView/i.test(ua);
  const mobileLike = /Android|iPhone|iPad|iPod/i.test(ua) || coarsePointer || webView;
  const browserSpeechRecognition = Boolean(typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition));
  const preferredASR = base.getUserMedia && (base.mediaRecorder || base.audioContext) && (mobileLike || webView)
    ? "cloud"
    : browserSpeechRecognition
      ? "browser"
      : base.getUserMedia && (base.mediaRecorder || base.audioContext)
        ? "cloud"
        : "unavailable";
  return { ...base, mobileLike, webView, browserSpeechRecognition, preferredASR, platform: typeof navigator === "undefined" ? "unknown" : navigator.platform || "unknown" };
}

function detectBaseCapability(): AudioCapability {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return { device: "unknown", browser: "server", secureContext: false, mediaDevices: false, getUserMedia: false, permissionsApi: false, audioElement: false, audioContext: false, mediaRecorder: false, speechRecognition: false, mp3Playback: "unknown" };
  }
  const ua = navigator.userAgent;
  const audio = typeof Audio !== "undefined" ? new Audio() : null;
  const AudioContextConstructor = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  return {
    device: /iPhone|iPad|iPod/i.test(ua) ? "iOS" : /Android/i.test(ua) ? "Android" : "Desktop",
    browser: /MicroMessenger/i.test(ua) ? "WeChat WebView" : /CriOS/i.test(ua) ? "iOS Chrome" : /FxiOS/i.test(ua) ? "iOS Firefox" : /Safari/i.test(ua) && !/Chrome|CriOS/i.test(ua) ? "Safari" : /Chrome|Android/i.test(ua) ? "Chrome/WebView" : "Other",
    secureContext: window.isSecureContext,
    mediaDevices: Boolean(navigator.mediaDevices),
    getUserMedia: Boolean(navigator.mediaDevices?.getUserMedia),
    permissionsApi: Boolean(navigator.permissions?.query),
    audioElement: Boolean(audio),
    audioContext: Boolean(AudioContextConstructor),
    mediaRecorder: typeof MediaRecorder !== "undefined",
    speechRecognition: Boolean(window.SpeechRecognition || window.webkitSpeechRecognition),
    mp3Playback: audio?.canPlayType("audio/mpeg") || "",
  };
}

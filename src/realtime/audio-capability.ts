export type AudioCapability = {
  device: string;
  browser: string;
  secureContext: boolean;
  mediaDevices: boolean;
  getUserMedia: boolean;
  permissionsApi: boolean;
  audioElement: boolean;
  audioContext: boolean;
  mediaRecorder: boolean;
  speechRecognition: boolean;
  mp3Playback: string;
};

export function detectAudioCapability(): AudioCapability {
  if (typeof window === "undefined" || typeof navigator === "undefined") return { device: "unknown", browser: "server", secureContext: false, mediaDevices: false, getUserMedia: false, permissionsApi: false, audioElement: false, audioContext: false, mediaRecorder: false, speechRecognition: false, mp3Playback: "unknown" };
  const ua = navigator.userAgent;
  const device = /iPhone|iPad|iPod/i.test(ua) ? "iOS" : /Android/i.test(ua) ? "Android" : "Desktop";
  const browser = /MicroMessenger/i.test(ua) ? "WeChat WebView" : /CriOS/i.test(ua) ? "iOS Chrome" : /FxiOS/i.test(ua) ? "iOS Firefox" : /Safari/i.test(ua) && !/Chrome|CriOS/i.test(ua) ? "Safari" : /Chrome|Android/i.test(ua) ? "Chrome/WebView" : "Other";
  const audio = typeof Audio !== "undefined" ? new Audio() : null;
  return {
    device,
    browser,
    secureContext: window.isSecureContext,
    mediaDevices: Boolean(navigator.mediaDevices),
    getUserMedia: Boolean(navigator.mediaDevices?.getUserMedia),
    permissionsApi: Boolean(navigator.permissions?.query),
    audioElement: Boolean(audio),
    audioContext: Boolean(window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext),
    mediaRecorder: typeof MediaRecorder !== "undefined",
    speechRecognition: Boolean(window.SpeechRecognition || window.webkitSpeechRecognition),
    mp3Playback: audio?.canPlayType("audio/mpeg") || "",
  };
}

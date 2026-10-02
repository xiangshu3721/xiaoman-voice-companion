export type AudioCapability = {
  device: string;
  browser: string;
  os: string;
  webView: boolean;
  userAgent: string;
  iosVersion: string;
  secureContext: boolean;
  mediaDevices: boolean;
  getUserMedia: boolean;
  permissionsApi: boolean;
  audioElement: boolean;
  audioContext: boolean;
  mp3Playback: string;
  audioSession: string;
};

export function detectAudioCapability(): AudioCapability {
  if (typeof window === "undefined" || typeof navigator === "undefined") return { device: "unknown", browser: "server", os: "unknown", webView: false, userAgent: "", iosVersion: "unknown", secureContext: false, mediaDevices: false, getUserMedia: false, permissionsApi: false, audioElement: false, audioContext: false, mp3Playback: "unknown", audioSession: "UNAVAILABLE" };
  const ua = navigator.userAgent;
  const device = /iPhone|iPad|iPod/i.test(ua) ? "iOS" : /Android/i.test(ua) ? "Android" : "Desktop";
  const webView = /MicroMessenger|; wv\)|\bwv\b|WebView/i.test(ua);
  const browser = /MicroMessenger/i.test(ua) ? "WeChat WebView" : /CriOS/i.test(ua) ? "iOS Chrome" : /FxiOS/i.test(ua) ? "iOS Firefox" : /Safari/i.test(ua) && !/Chrome|CriOS/i.test(ua) ? "Safari" : /Chrome|Android/i.test(ua) ? (webView ? "Android WebView/Chrome" : "Chrome") : "Other";
  const os = /Android/i.test(ua) ? `Android${ua.match(/Android\s([\d.]+)/i)?.[1] ? ` ${ua.match(/Android\s([\d.]+)/i)?.[1]}` : ""}` : /iPhone|iPad|iPod/i.test(ua) ? "iOS" : "Desktop";
  const iosVersion = ua.match(/OS (\d+)[._](\d+)(?:[._](\d+))?/i);
  const audioSession = (navigator as Navigator & { audioSession?: { type?: string } }).audioSession;
  const audio = typeof Audio !== "undefined" ? new Audio() : null;
  return {
    device,
    browser,
    os,
    webView,
    userAgent: ua,
    iosVersion: device === "iOS" ? (iosVersion ? `${iosVersion[1]}.${iosVersion[2]}${iosVersion[3] ? `.${iosVersion[3]}` : ""}` : "unknown") : "not-iOS",
    secureContext: window.isSecureContext,
    mediaDevices: Boolean(navigator.mediaDevices),
    getUserMedia: Boolean(navigator.mediaDevices?.getUserMedia),
    permissionsApi: Boolean(navigator.permissions?.query),
    audioElement: Boolean(audio),
    audioContext: Boolean(window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext),
    mp3Playback: audio?.canPlayType("audio/mpeg") || "",
    audioSession: audioSession?.type || "UNAVAILABLE",
  };
}

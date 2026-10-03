import { apiUrl } from "@/lib/api";

export type VerifiedVoiceEvent =
  | "TTS_REQUEST_START"
  | "TTS_RESPONSE"
  | "AUDIO_URL_CREATED"
  | "AUDIO_LOAD_START"
  | "AUDIO_PLAY_CALLED"
  | "AUDIO_PLAY_RESOLVED"
  | "AUDIO_PLAYING"
  | "AUDIO_FIRST_PROGRESS"
  | "AUDIO_ENDED"
  | "AUDIO_ERROR"
  | "AUDIO_PLAY_REJECTED"
  | "AUDIO_TIMEOUT";

export type VerifiedVoiceEventPayload = {
  type: VerifiedVoiceEvent;
  detail?: string;
};

type EventHandler = (event: VerifiedVoiceEventPayload) => void;

function emit(onEvent: EventHandler | undefined, type: VerifiedVoiceEvent, detail = "") {
  onEvent?.({ type, detail });
}

export function isIOSMobileBrowser() {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export async function requestSeedTTS(text: string, onEvent?: EventHandler) {
  const startedAt = performance.now();
  emit(onEvent, "TTS_REQUEST_START", text);
  try {
    const response = await fetch(`${apiUrl("/api/tts")}?stream=false`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-TTS-Stream": "false" },
      body: JSON.stringify({ text, streaming: false }),
    });
    emit(onEvent, "TTS_RESPONSE", `HTTP_STATUS=${response.status} latency=${Math.round(performance.now() - startedAt)}ms`);
    if (!response.ok) return null;
    const blob = await response.blob();
    if (!blob.size) return null;
    const url = URL.createObjectURL(blob);
    emit(onEvent, "AUDIO_URL_CREATED", `bytes=${blob.size}`);
    return url;
  } catch (error) {
    emit(onEvent, "AUDIO_ERROR", error instanceof Error ? error.message : String(error));
    return null;
  }
}

export function releaseVerifiedAudioUrl(url: string | null | undefined) {
  if (url) URL.revokeObjectURL(url);
}

export async function playAudioAndWaitUntilEnded(source: string, options: { label?: string; timeoutMs?: number; onEvent?: EventHandler; signal?: AbortSignal } = {}) {
  const label = options.label || "VERIFIED_AUDIO";
  const timeoutMs = options.timeoutMs || 30000;
  const audio = new Audio();
  audio.preload = "auto";
  audio.setAttribute("playsinline", "true");
  audio.setAttribute("webkit-playsinline", "true");
  audio.muted = false;
  audio.volume = 1;
  audio.src = source;
  audio.load();
  emit(options.onEvent, "AUDIO_LOAD_START", label);

  let settled = false;
  let firstProgressEmitted = false;
  let timeout: number | null = null;
  let abortHandler: (() => void) | null = null;
  const finish = (result: "ENDED" | "FAILED") => {
    if (settled) return;
    settled = true;
    if (timeout !== null) window.clearTimeout(timeout);
    audio.onplaying = null;
    audio.ontimeupdate = null;
    audio.onended = null;
    audio.onerror = null;
    audio.onloadedmetadata = null;
    audio.oncanplay = null;
    if (abortHandler) options.signal?.removeEventListener("abort", abortHandler);
    if (result === "FAILED") { audio.pause(); audio.removeAttribute("src"); audio.load(); }
    return result;
  };

  const finished = new Promise<"ENDED" | "FAILED">((resolve) => {
    audio.onplaying = () => {
      if (audio.currentTime > 0) emit(options.onEvent, "AUDIO_PLAYING", `${label} currentTime=${audio.currentTime.toFixed(2)}`);
    };
    audio.ontimeupdate = () => {
      if (audio.currentTime > 0 && !firstProgressEmitted) {
        firstProgressEmitted = true;
        emit(options.onEvent, "AUDIO_FIRST_PROGRESS", `${label} currentTime=${audio.currentTime.toFixed(2)}`);
      }
    };
    audio.onended = () => {
      emit(options.onEvent, "AUDIO_ENDED", `${label} currentTime=${audio.currentTime.toFixed(2)}`);
      resolve(finish("ENDED") || "ENDED");
    };
    audio.onerror = () => {
      emit(options.onEvent, "AUDIO_ERROR", label);
      resolve(finish("FAILED") || "FAILED");
    };
    timeout = window.setTimeout(() => {
      emit(options.onEvent, "AUDIO_TIMEOUT", `${label} currentTime=${audio.currentTime.toFixed(2)}`);
      resolve(finish("FAILED") || "FAILED");
    }, timeoutMs);
    abortHandler = () => {
      emit(options.onEvent, "AUDIO_ERROR", `${label} aborted`);
      resolve(finish("FAILED") || "FAILED");
    };
    if (options.signal?.aborted) abortHandler();
    else options.signal?.addEventListener("abort", abortHandler, { once: true });
  });

  emit(options.onEvent, "AUDIO_PLAY_CALLED", `${label} volume=${audio.volume} muted=${audio.muted}`);
  try {
    await audio.play();
    emit(options.onEvent, "AUDIO_PLAY_RESOLVED", label);
  } catch (error) {
    emit(options.onEvent, "AUDIO_PLAY_REJECTED", `${label} ${error instanceof Error ? `${error.name}: ${error.message}` : String(error)}`);
    return finish("FAILED") || "FAILED";
  }
  return finished;
}

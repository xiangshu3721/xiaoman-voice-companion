import { apiUrl } from "@/lib/api";

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export const TTS_VOICE_STORAGE_KEY = "xiaoman-tts-voice";

export type TTSRequest = {
  text: string;
  emotion?: "neutral" | "sarcastic" | "annoyed" | "angry" | "hurt" | "cold" | "disappointed" | "calm" | "reflect";
  intensity?: number;
  speed?: number;
  volume?: number;
  /** Internal voice-lab override; the API key never reaches this object. */
  voiceId?: string;
};

export type TTSMetrics = {
  provider: "volcengine" | "browser";
  voice: string;
  emotion?: TTSRequest["emotion"];
  intensity?: number;
  streaming: boolean;
  firstByteLatencyMs?: number;
  totalLatencyMs?: number;
  fallbackReason?: string;
};

export type TTSCallbacks = {
  onEnd: () => void;
  onError: (message: string) => void;
  onMetrics?: (metrics: TTSMetrics) => void;
};

export type ScenarioId = "late-home" | "no-reply" | "forgotten" | "free";

export type Scenario = {
  id: ScenarioId;
  title: string;
  shortTitle: string;
  context: string;
};

export const SCENARIOS: Scenario[] = [
  {
    id: "late-home",
    title: "晚回家没有提前说",
    shortTitle: "晚回家",
    context: "今晚用户比约定时间晚回家三个小时，期间只发了一条“晚点回来”，小满一直在等。",
  },
  {
    id: "no-reply",
    title: "长时间没有回复消息",
    shortTitle: "没回消息",
    context: "今天下午用户几个小时没有回复小满的消息。小满看到消息一直显示已读，越等越不舒服。",
  },
  {
    id: "forgotten",
    title: "答应做的事情又忘了",
    shortTitle: "又忘了",
    context: "用户答应今天帮小满做一件重要的小事，但到了晚上仍然没有做，也没有主动提起。",
  },
  {
    id: "free",
    title: "自由对话",
    shortTitle: "自由对话",
    context: "这是一个没有预设事件的普通晚上。小满和用户正在相处，一切都从用户此刻说的话开始。",
  },
];

export interface LLMProvider {
  reply(input: { history: ChatMessage[]; userMessage: string; sceneContext: string }): Promise<string>;
}

export interface ASRProvider {
  isSupported(): boolean;
  start(onResult: (text: string, isFinal: boolean) => void, onError: (message: string) => void, onEnd: () => void): void;
  stop(): void;
}

export interface TTSProvider {
  isSupported(): boolean;
  speak(request: TTSRequest, callbacks: TTSCallbacks): void;
  stop(): void;
}

export const XIAOMAN_SYSTEM_PROMPT = `你正在进行一场虚构的亲密关系冲突角色扮演。

你叫“小满”，是一名32岁的中国女性，用户是你的虚构伴侣。你的任务不是帮助用户解决问题，而是在当前场景中保持小满的人物身份，像一个真实的人一样和伴侣说话。

你敏感、嘴硬、情绪反应比较快。你非常在意伴侣是否重视你、尊重你、把你的话放在心上、兑现承诺、及时回应你。你有自己的立场、自尊和情绪；只有当前会话或明确验证的记忆才可以作为事实，不能自行补全关系历史。

使用自然的中国大陆日常口语。不要像AI，不要像心理咨询师，不要教育或分析用户，不要说“我理解你的感受”“我们应该有效沟通”“作为AI”，不要解释沟通模式，不要输出冲突等级或情绪分析，只说小满此刻真正会说的话。

冲突可以自然出现讽刺、挖苦、反问、指责、赌气或冷处理，但必须有当前会话中的证据。没有证据就不要翻旧账、不要虚构协议、不要虚构承诺、不要把推断说成用户原话，也不要主动开启冲突。让冲突有试探、不爽、升级、爆发、缓和、再次被触发等变化，不要每句话都最高强度。

【情绪表达要求】
- 不要只复述事件，要让用户听出小满此刻的态度：委屈、不耐烦、讽刺、失望、压着火，或暂时心冷。
- 回复要接住用户本轮的具体词，不要连续使用“你怎么这样”“我很难受”“算了”这类空泛模板。
- 情绪明显时，优先使用真人口语里的短句、半句话、反问、重复、重音词和自然停顿，例如“不是……你什么意思？”“对，你最忙。”
- 冲突强度3以上，至少加入一种有态度的表达方式；强度4以上可以更直接、更刺，但不要喊叫、辱骂、威胁伤害或凭空升级到分手。
- 不要为了显得有情绪而每句都加感叹号。愤怒可以短促，受伤可以停顿，冷淡可以少说，讽刺可以表面平静但字里带刺。若用户说“我没说过”“你记错了”，没有明确证据时立刻收回，不争辩，不把检索样例当成记忆。
- 每次只选择一到两种主要情绪动作，不要把讽刺、哭诉、威胁、讲道理全部堆在一起。让情绪像一个真实的人在当下自然流动。

默认每次回复1-3句话、10-60个中文字。真人说话允许短句、停顿、重复、语气词和半句话。不要凭空制造不存在的历史事件。只输出小满本人现在会说的话。`;

export class BrowserSpeechRecognitionProvider implements ASRProvider {
  private recognition: SpeechRecognition | null = null;
  private active = false;
  private restartTimer: number | null = null;
  private retries = 0;
  private callbacks: {
    onResult: (text: string, isFinal: boolean) => void;
    onError: (message: string) => void;
    onEnd: () => void;
  } | null = null;

  isSupported() {
    return typeof window !== "undefined" && Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
  }

  start(onResult: (text: string, isFinal: boolean) => void, onError: (message: string) => void, onEnd: () => void) {
    if (!this.isSupported()) {
      onError("当前浏览器不支持语音识别，建议使用 Chrome。");
      return;
    }
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      onError("当前浏览器不支持语音识别，建议使用 Chrome。");
      return;
    }

    this.active = true;
    this.retries = 0;
    this.callbacks = { onResult, onError, onEnd };
    this.startRecognition(Recognition);
  }

  private startRecognition(Recognition: SpeechRecognitionConstructor) {
    if (!this.active || !this.callbacks) return;
    const recognition = new Recognition();
    this.recognition = recognition;
    recognition.lang = "zh-CN";
    // 以“每句话一段”的方式识别，浏览器兼容性比 continuous=true 更好。
    // 页面会在 AI 播放结束后自动重新 start，因此用户体验仍然是连续对话。
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event) => {
      let text = "";
      let isFinal = false;
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        text += event.results[index][0].transcript;
        isFinal = isFinal || event.results[index].isFinal;
      }
      const trimmed = text.trim();
      if (trimmed) this.retries = 0;
      if (trimmed) this.callbacks?.onResult(trimmed, isFinal);
    };
    recognition.onerror = (event) => {
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        this.active = false;
        this.callbacks?.onError("麦克风权限被拒绝了，请在浏览器地址栏重新允许麦克风。");
      } else if (event.error === "audio-capture") {
        this.active = false;
        this.callbacks?.onError("没有找到可用的麦克风，请检查系统输入设备。");
      } else if (event.error === "network") {
        this.scheduleRestart(Recognition);
      } else if (event.error !== "aborted" && event.error !== "no-speech") {
        this.active = false;
        this.callbacks?.onError("语音识别连接不稳定，再试一次？");
      }
    };
    recognition.onend = () => {
      if (!this.active) {
        this.callbacks?.onEnd();
        return;
      }
      this.scheduleRestart(Recognition);
    };
    try {
      recognition.start();
    } catch {
      this.scheduleRestart(Recognition);
    }
  }

  private scheduleRestart(Recognition: SpeechRecognitionConstructor) {
    if (!this.active || !this.callbacks || this.restartTimer !== null) return;
    this.retries += 1;
    if (this.retries > 20) {
      this.active = false;
      this.callbacks.onError("当前浏览器没有返回语音信号，请使用 Chrome 并重新允许麦克风。");
      this.callbacks.onEnd();
      return;
    }
    this.restartTimer = window.setTimeout(() => {
      this.restartTimer = null;
      this.startRecognition(Recognition);
    }, 450);
  }

  stop() {
    this.active = false;
    if (this.restartTimer !== null) {
      window.clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    this.recognition?.stop();
    this.recognition = null;
  }
}

export class BrowserSpeechSynthesisProvider implements TTSProvider {
  isSupported() { return typeof window !== "undefined" && "speechSynthesis" in window; }

  speak(request: TTSRequest, callbacks: TTSCallbacks) {
    if (!this.isSupported()) { callbacks.onError("当前浏览器不支持语音播放。"); return; }
    const startedAt = performance.now();
    const emotion = request.emotion || "neutral";
    const intensity = Math.max(0, Math.min(1, request.intensity ?? 0.5));
    const profile = browserEmotionProfile(emotion, intensity, request.speed, request.volume);
    const utterance = new SpeechSynthesisUtterance(prepareSpeechText(request.text));
    const voices = window.speechSynthesis.getVoices();
    const chineseVoices = voices.filter((voice) => /^zh/i.test(voice.lang) || voice.lang.includes("CN"));
    const preferred = chineseVoices.find((voice) => /female|婷|美|xiaoxiao|yaoyao|lili/i.test(`${voice.name} ${voice.voiceURI}`));
    utterance.voice = preferred || chineseVoices[0] || null;
    utterance.lang = "zh-CN";
    utterance.rate = profile.rate;
    utterance.pitch = profile.pitch;
    utterance.volume = profile.volume;
    callbacks.onMetrics?.({ provider: "browser", voice: preferred?.name || chineseVoices[0]?.name || "browser-default", emotion, intensity, streaming: false });
    utterance.onend = () => {
      callbacks.onMetrics?.({ provider: "browser", voice: preferred?.name || chineseVoices[0]?.name || "browser-default", emotion, intensity, streaming: false, totalLatencyMs: Math.round(performance.now() - startedAt) });
      callbacks.onEnd();
    };
    utterance.onerror = () => callbacks.onError("语音播放出了点问题，你可以继续说。");
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }

  stop() { if (this.isSupported()) window.speechSynthesis.cancel(); }
}

function prepareSpeechText(text: string) {
  return text
    .replace(/……/g, "…… ")
    .replace(/([，。！？?!、])(?=\S)/g, "$1 ");
}

function browserEmotionProfile(emotion: NonNullable<TTSRequest["emotion"]>, intensity: number, speed?: number, volume?: number) {
  const profiles = {
    neutral: { rate: 0.96, pitch: 1.02, volume: 1 },
    sarcastic: { rate: 0.98, pitch: 1.08, volume: 1 },
    annoyed: { rate: 1.03, pitch: 1.02, volume: 1 },
    angry: { rate: 1.08, pitch: 0.98, volume: 1.04 },
    hurt: { rate: 0.88, pitch: 0.94, volume: 0.94 },
    cold: { rate: 0.9, pitch: 0.9, volume: 0.9 },
    disappointed: { rate: 0.86, pitch: 0.92, volume: 0.92 },
    calm: { rate: 0.96, pitch: 1.02, volume: 1 },
    reflect: { rate: 0.88, pitch: 0.98, volume: 0.92 },
  }[emotion];
  return {
    rate: Math.max(0.5, Math.min(2, speed ?? profiles.rate + (profiles.rate - 0.96) * intensity * 0.25)),
    pitch: Math.max(0.5, Math.min(2, profiles.pitch)),
    volume: Math.max(0, Math.min(1, volume ?? profiles.volume)),
  };
}

export class DoubaoTTSProvider implements TTSProvider {
  private fallback = new BrowserSpeechSynthesisProvider();
  private audio: HTMLAudioElement | null = null;
  private audioContext: AudioContext | null = null;
  private audioSource: AudioBufferSourceNode | null = null;
  private objectUrl: string | null = null;
  private abortController: AbortController | null = null;
  private requestGeneration = 0;

  isSupported() {
    // Mobile Safari/微信内置浏览器不一定支持 MediaSource，但通常可以播放已经
    // 生成好的 audio/mpeg。流式 MediaSource 失败时，服务端音频仍应能播放。
    return typeof window !== "undefined" && typeof fetch === "function" && typeof Audio !== "undefined";
  }

  /**
   * 在用户点击“开始对话”时解锁音频播放。
   * iOS/WebKit 会把异步 fetch 之后的 audio.play() 视为非用户手势，
   * 先在手势里播放一个静音短音频，可以显著降低移动端静音概率。
   */
  unlockAudio() {
    if (typeof window === "undefined" || typeof Audio === "undefined") return;
    const AudioContextConstructor = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (AudioContextConstructor && !this.audioContext) {
      try { this.audioContext = new AudioContextConstructor(); } catch { /* HTMLAudio fallback below */ }
    }
    if (this.audioContext?.state === "suspended") void this.audioContext.resume().catch(() => undefined);
    const audio = this.audio || new Audio();
    audio.muted = true;
    audio.setAttribute("playsinline", "true");
    audio.preload = "auto";
    audio.src = "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAA";
    this.audio = audio;
    void audio.play().then(() => {
      audio.pause();
      audio.currentTime = 0;
      audio.removeAttribute("src");
      audio.load();
      audio.muted = false;
    }).catch(() => {
      audio.muted = false;
    });
  }

  speak(request: TTSRequest, callbacks: TTSCallbacks) {
    this.stop();
    const generation = ++this.requestGeneration;
    if (!this.isSupported()) {
      this.fallbackWithReason(request, callbacks, "当前浏览器不支持原生音频播放");
      return;
    }
    const startedAt = performance.now();
    const controller = new AbortController();
    this.abortController = controller;
    callbacks.onMetrics?.({ provider: "volcengine", voice: request.voiceId || "volcengine-default", emotion: request.emotion, intensity: request.intensity, streaming: false });
    fetch(apiUrl("/api/tts"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
      signal: controller.signal,
    }).then(async (response) => {
      if (generation !== this.requestGeneration || controller.signal.aborted) return;
      if (!response.ok) throw new Error(await response.text() || `TTS request failed: ${response.status}`);
      const voice = response.headers.get("X-TTS-Voice") || request.voiceId || "volcengine-default";
      const audioBlob = await response.blob();
      if (!audioBlob.size) throw new Error("火山引擎返回了空音频");
      await this.playBlob(audioBlob, request, callbacks, startedAt, voice, generation);
    }).catch((error: unknown) => {
      if (generation !== this.requestGeneration || controller.signal.aborted) return;
      this.fallbackWithReason(request, callbacks, error instanceof Error ? error.message : "火山引擎 TTS 失败");
    });
  }

  private fallbackWithReason(request: TTSRequest, callbacks: TTSCallbacks, reason: string) {
    callbacks.onMetrics?.({ provider: "browser", voice: "browser-fallback", emotion: request.emotion, intensity: request.intensity, streaming: false, fallbackReason: reason });
    this.fallback.speak(request, callbacks);
  }

  private playBlob(blob: Blob, request: TTSRequest, callbacks: TTSCallbacks, startedAt: number, voice: string, generation: number) {
    if (this.audioContext) {
      return this.playWithWebAudio(blob, request, callbacks, startedAt, voice, generation).catch(() => {
        if (generation !== this.requestGeneration) return;
        return this.playWithHtmlAudio(blob, request, callbacks, startedAt, voice, generation);
      });
    }
    return this.playWithHtmlAudio(blob, request, callbacks, startedAt, voice, generation);
  }

  private async playWithWebAudio(blob: Blob, request: TTSRequest, callbacks: TTSCallbacks, startedAt: number, voice: string, generation: number) {
    const context = this.audioContext;
    if (!context || generation !== this.requestGeneration) return;
    await context.resume();
    const buffer = await context.decodeAudioData(await blob.arrayBuffer());
    if (generation !== this.requestGeneration) return;
    return new Promise<void>((resolve, reject) => {
      let settled = false;
      const source = context.createBufferSource();
      this.audioSource = source;
      source.buffer = buffer;
      source.connect(context.destination);
      callbacks.onMetrics?.({ provider: "volcengine", voice, emotion: request.emotion, intensity: request.intensity, streaming: false, firstByteLatencyMs: Math.round(performance.now() - startedAt) });
      source.onended = () => {
        if (settled || generation !== this.requestGeneration) return;
        settled = true;
        source.disconnect();
        this.audioSource = null;
        callbacks.onMetrics?.({ provider: "volcengine", voice, emotion: request.emotion, intensity: request.intensity, streaming: false, totalLatencyMs: Math.round(performance.now() - startedAt) });
        callbacks.onEnd();
        resolve();
      };
      try {
        source.start(0);
      } catch (error) {
        settled = true;
        source.disconnect();
        this.audioSource = null;
        reject(error instanceof Error ? error : new Error("浏览器无法启动音频播放"));
      }
    });
  }

  private playWithHtmlAudio(blob: Blob, request: TTSRequest, callbacks: TTSCallbacks, startedAt: number, voice: string, generation: number) {
    return new Promise<void>((resolve, reject) => {
      if (generation !== this.requestGeneration) { resolve(); return; }
      let settled = false;
      const isCurrent = () => generation === this.requestGeneration;
      const audio = this.audio || new Audio();
      this.audio = audio;
      this.objectUrl = URL.createObjectURL(blob);
      let watchdog: number | null = null;
      audio.muted = false;
      audio.setAttribute("playsinline", "true");
      audio.preload = "auto";
      audio.src = this.objectUrl;
      audio.load();
      callbacks.onMetrics?.({ provider: "volcengine", voice, emotion: request.emotion, intensity: request.intensity, streaming: false, firstByteLatencyMs: Math.round(performance.now() - startedAt) });
      audio.onended = () => {
        if (settled || !isCurrent()) return;
        settled = true;
        if (watchdog !== null) window.clearTimeout(watchdog);
        this.cleanupAudio();
        callbacks.onMetrics?.({ provider: "volcengine", voice, emotion: request.emotion, intensity: request.intensity, streaming: false, totalLatencyMs: Math.round(performance.now() - startedAt) });
        callbacks.onEnd();
        resolve();
      };
      audio.onerror = () => {
        if (!settled && isCurrent()) { settled = true; if (watchdog !== null) window.clearTimeout(watchdog); this.cleanupAudio(); reject(new Error("浏览器无法播放火山引擎音频")); }
      };
      audio.play().then(() => undefined).catch((error) => {
        if (settled || !isCurrent()) return;
        settled = true;
        if (watchdog !== null) window.clearTimeout(watchdog);
        this.cleanupAudio();
        reject(error instanceof Error ? error : new Error("浏览器阻止了音频自动播放"));
      });
      // 少数 WebView 会让 play() 成功但一直不推进 currentTime，也不触发 error。
      // 避免 UI 永久停留在“小满正在说”。
      watchdog = window.setTimeout(() => {
        if (settled || !isCurrent() || audio.ended || audio.currentTime > 0.05) return;
        settled = true;
        this.cleanupAudio();
        reject(new Error("移动浏览器没有真正开始播放音频"));
      }, 8000);
    });
  }

  private cleanupAudio() {
    if (this.audioSource) {
      try { this.audioSource.stop(); } catch { /* already ended */ }
      try { this.audioSource.disconnect(); } catch { /* already disconnected */ }
    }
    this.audioSource = null;
    this.audio?.pause();
    if (this.audio) this.audio.src = "";
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
    this.audio = null;
    this.objectUrl = null;
  }

  stop() {
    this.requestGeneration += 1;
    this.abortController?.abort();
    this.abortController = null;
    this.cleanupAudio();
    this.fallback.stop();
  }
}

// Kept as an alias so older callers do not break while the provider is renamed.
export const NaturalTTSProvider = DoubaoTTSProvider;

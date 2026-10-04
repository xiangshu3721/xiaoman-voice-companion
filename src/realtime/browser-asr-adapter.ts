import { BrowserSpeechRecognitionProvider, type ASRSessionEvent } from "@/lib/providers";
import type { ASRAdapter, ASRAdapterHandlers, ASRPrepareResult } from "@/src/realtime/asr-adapter";

export class BrowserASRAdapter implements ASRAdapter {
  readonly mode = "browser" as const;
  private readonly provider = new BrowserSpeechRecognitionProvider();
  private handlers: ASRAdapterHandlers = {};
  private lastSession: ASRSessionEvent | null = null;

  async prepare(): Promise<ASRPrepareResult> {
    const ready = this.isSupported();
    return { ready, mode: ready ? this.mode : "unavailable", message: ready ? undefined : "当前浏览器没有可用的浏览器语音识别能力。" };
  }

  start() {
    this.provider.start(
      (text, isFinal) => isFinal ? this.handlers.onFinal?.(text) : this.handlers.onInterim?.(text),
      (message) => this.handlers.onError?.(message),
      () => this.handlers.onEnd?.(),
      {
        onReady: () => this.handlers.onReady?.(),
        onActivity: (event) => this.handlers.onActivity?.(event),
        onSessionEvent: (event) => { this.lastSession = event; this.handlers.onActivity?.(event.type); },
      },
    );
  }

  stop() { this.provider.stop(); }
  destroy() { this.stop(); this.handlers = {}; }
  setHandlers(handlers: ASRAdapterHandlers) { this.handlers = handlers; }
  isSupported() { return this.provider.isSupported(); }
  getDiagnostics() { return { mode: this.mode, ...this.provider.getDiagnostics(), session: this.lastSession }; }
}

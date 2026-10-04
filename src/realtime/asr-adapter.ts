export type ASRAdapterState = "IDLE" | "PREPARING" | "READY" | "LISTENING" | "PROCESSING" | "ERROR";

export type ASRPrepareResult = {
  ready: boolean;
  mode: "browser" | "cloud" | "unavailable";
  message?: string;
};

export type ASRAdapterHandlers = {
  onReady?: () => void;
  onInterim?: (text: string) => void;
  onFinal?: (text: string) => void;
  onError?: (message: string) => void;
  onEnd?: () => void;
  onActivity?: (event: string) => void;
};

export interface ASRAdapter {
  readonly mode: "browser" | "cloud" | "unavailable";
  prepare(): Promise<ASRPrepareResult>;
  start(): void;
  stop(): void;
  destroy(): void;
  setHandlers(handlers: ASRAdapterHandlers): void;
  isSupported(): boolean;
  setStream?(stream: MediaStream | null): void;
  getStream?(): MediaStream | null;
  requestMicrophone?(): Promise<{ status: "granted" | "denied" | "unavailable" | "error"; stream: MediaStream | null; message?: string }>;
  suspendForPlayback?(): void;
  resumeAfterPlayback?(): Promise<MediaStream | null>;
  getDiagnostics?(): Record<string, unknown>;
}

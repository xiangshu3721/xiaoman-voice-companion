export type MobileBootEventName =
  | "NAVIGATION_START"
  | "HTML_RECEIVED"
  | "DOM_INTERACTIVE"
  | "DOM_CONTENT_LOADED"
  | "FIRST_CONTENTFUL_PAINT"
  | "LCP"
  | "JS_MAIN_LOADED"
  | "REACT_BOOTSTRAP_START"
  | "REACT_MOUNTED"
  | "HYDRATION_COMPLETE"
  | "CORE_UI_READY"
  | "VOICE_RUNTIME_START"
  | "VOICE_RUNTIME_READY"
  | "MIC_INIT_START"
  | "MIC_READY"
  | "ASR_INIT_START"
  | "ASR_READY"
  | "APP_READY"
  | "SLOW_BOOT";

export type MobileBootEvent = {
  name: MobileBootEventName;
  at: number;
  durationMs?: number;
  error?: string;
};

type ResourceTimingSummary = { name: string; durationMs: number; transferSize: number; initiatorType: string };

function now() {
  return typeof performance !== "undefined" ? Math.round(performance.now()) : 0;
}

class MobileBootTrace {
  private readonly startedAt = now();
  private readonly events = new Map<MobileBootEventName, MobileBootEvent>();
  private initialized = false;

  constructor() {
    if (typeof window === "undefined") return;
    const navigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    this.mark("NAVIGATION_START", 0);
    if (navigation?.responseStart) this.mark("HTML_RECEIVED", Math.round(navigation.responseStart));
    if (navigation?.domInteractive) this.mark("DOM_INTERACTIVE", Math.round(navigation.domInteractive));
    if (navigation?.domContentLoadedEventEnd) this.mark("DOM_CONTENT_LOADED", Math.round(navigation.domContentLoadedEventEnd));
    this.mark("JS_MAIN_LOADED");
    this.installObservers();
    window.setTimeout(() => { if (!this.events.has("APP_READY")) this.mark("SLOW_BOOT", this.getElapsedMs(), "APP_READY not reached within 8 seconds"); }, 8000);
  }

  mark(name: MobileBootEventName, durationMs?: number, error?: string) {
    if (this.events.has(name) && name !== "SLOW_BOOT") return;
    const at = now();
    this.events.set(name, { name, at, durationMs: durationMs ?? Math.max(0, at - this.startedAt), ...(error ? { error } : {}) });
  }

  snapshot() {
    return Array.from(this.events.values()).sort((a, b) => a.at - b.at);
  }

  getElapsedMs() {
    return Math.max(0, now() - this.startedAt);
  }

  resources(): ResourceTimingSummary[] {
    if (typeof performance === "undefined") return [];
    return performance.getEntriesByType("resource").map((entry) => {
      const resource = entry as PerformanceResourceTiming;
      return { name: resource.name, durationMs: Math.round(resource.duration), transferSize: resource.transferSize || 0, initiatorType: resource.initiatorType || "unknown" };
    }).sort((a, b) => b.durationMs - a.durationMs).slice(0, 10);
  }

  private installObservers() {
    if (this.initialized || typeof window === "undefined") return;
    this.initialized = true;
    const markDom = () => this.mark("DOM_INTERACTIVE");
    if (document.readyState === "interactive" || document.readyState === "complete") markDom();
    else document.addEventListener("readystatechange", () => { if (document.readyState === "interactive") markDom(); }, { once: true });
    if (document.readyState === "complete") this.mark("DOM_CONTENT_LOADED");
    else document.addEventListener("DOMContentLoaded", () => this.mark("DOM_CONTENT_LOADED"), { once: true });
    window.addEventListener("load", () => this.mark("HTML_RECEIVED"), { once: true });
    if (typeof PerformanceObserver === "undefined") return;
    try {
      const paintObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) if (entry.name === "first-contentful-paint") this.mark("FIRST_CONTENTFUL_PAINT", Math.round(entry.startTime));
      });
      paintObserver.observe({ type: "paint", buffered: true });
    } catch { /* unsupported browser */ }
    try {
      const lcpObserver = new PerformanceObserver((list) => {
        const entry = list.getEntries().at(-1);
        if (entry) this.mark("LCP", Math.round(entry.startTime));
      });
      lcpObserver.observe({ type: "largest-contentful-paint", buffered: true });
    } catch { /* unsupported browser */ }
  }
}

export const mobileBootTrace = new MobileBootTrace();

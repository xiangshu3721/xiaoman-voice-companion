"use client";

import { useEffect } from "react";

const RELOAD_KEY = "xiaoman-chunk-reload-once";

export function ChunkRecovery() {
  useEffect(() => {
    const isChunkError = (value: unknown) => /ChunkLoadError|Loading chunk|dynamically imported module|CSS_CHUNK_LOAD_FAILED/i.test(String(value));
    const recover = (value: unknown) => {
      if (!isChunkError(value) || sessionStorage.getItem(RELOAD_KEY)) return;
      sessionStorage.setItem(RELOAD_KEY, "1");
      window.location.reload();
    };
    const onError = (event: ErrorEvent) => recover(event.message || event.error);
    const onRejection = (event: PromiseRejectionEvent) => recover(event.reason);
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    const clearAfterStableLoad = window.setTimeout(() => sessionStorage.removeItem(RELOAD_KEY), 10000);
    return () => { window.clearTimeout(clearAfterStableLoad); window.removeEventListener("error", onError); window.removeEventListener("unhandledrejection", onRejection); };
  }, []);
  return null;
}


"use client";

import { useEffect, useState } from "react";
import { BUILD_INFO, displayBuildTime, shortGitSha } from "@/src/build-info";

export function BuildInfo() {
  const [debug, setDebug] = useState(false);
  const time = displayBuildTime(BUILD_INFO.buildTime);

  useEffect(() => {
    setDebug(new URLSearchParams(window.location.search).get("debug") === "true");
  }, []);

  const summary = [
    `Release #${BUILD_INFO.releaseNumber}`,
    debug ? BUILD_INFO.gitSha : shortGitSha(BUILD_INFO.gitSha),
    time,
  ].filter(Boolean).join(" · ");
  const serializedInfo = JSON.stringify(BUILD_INFO).replace(/</g, "\\u003c");

  return <>
    {debug ? <div className="pointer-events-none fixed bottom-2 right-3 z-30 max-w-[calc(100vw-1.5rem)] rounded-lg border border-white/10 bg-[#141313]/95 px-3 py-2 text-[11px] leading-5 text-[#d6cbc8] shadow-lg shadow-black/20 backdrop-blur-sm" aria-label="完整构建信息">
      <p>Release #{BUILD_INFO.releaseNumber}</p>
      <p className="break-all">SHA {BUILD_INFO.gitSha}</p>
      <p>Build {time || "LOCAL/UNSET"}</p>
    </div> : <div className="pointer-events-none fixed inset-x-0 bottom-2 z-20 flex justify-end px-3 sm:px-5">
      <p className="rounded-full bg-[#141313]/80 px-2 py-1 text-[10px] leading-4 text-[#746c6a] backdrop-blur-sm" aria-label="线上发布版本">{summary}</p>
    </div>}
    <script dangerouslySetInnerHTML={{ __html: `window.__BUILD_INFO__=${serializedInfo};` }} />
  </>;
}

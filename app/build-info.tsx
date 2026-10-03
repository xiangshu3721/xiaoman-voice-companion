import { BUILD_INFO, displayBuildTime, shortGitSha } from "@/src/build-info";

type BuildInfoProps = {
  debug?: boolean;
  expose?: boolean;
};

export function BuildInfo({ debug = false, expose = true }: BuildInfoProps) {
  const time = displayBuildTime(BUILD_INFO.buildTime);
  const visibleSha = debug ? BUILD_INFO.gitSha : shortGitSha(BUILD_INFO.gitSha);
  const summary = [
    `Release #${BUILD_INFO.releaseNumber}`,
    visibleSha,
    time,
  ].filter(Boolean).join(" · ");
  const serializedInfo = JSON.stringify(BUILD_INFO).replace(/</g, "\\u003c");

  return <>
    {!debug && <div className="pointer-events-none fixed inset-x-0 bottom-2 z-20 flex justify-end px-3 sm:px-5">
      <p className="rounded-full bg-[#141313]/80 px-2 py-1 text-[10px] leading-4 text-[#746c6a] backdrop-blur-sm" aria-label="线上发布版本">{summary}</p>
    </div>}
    {debug && <section className="mt-4 grid gap-2 text-xs text-[#d6cbc8] sm:grid-cols-3" aria-label="完整构建信息">
      <p>RELEASE NUMBER：<span className="text-[#f4efeb]">#{BUILD_INFO.releaseNumber}</span></p>
      <p>GIT COMMIT SHA：<span className="break-all text-[#f4efeb]">{BUILD_INFO.gitSha}</span></p>
      <p>BUILD TIME：<span className="text-[#f4efeb]">{time || "LOCAL/UNSET"}</span></p>
    </section>}
    {expose && <script dangerouslySetInnerHTML={{ __html: `window.__BUILD_INFO__=${serializedInfo};` }} />}
  </>;
}

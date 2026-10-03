export type BuildInfo = {
  releaseNumber: string;
  gitSha: string;
  buildTime: string;
};

export const BUILD_INFO: BuildInfo = {
  releaseNumber: process.env.NEXT_PUBLIC_RELEASE_NUMBER || "dev",
  gitSha: process.env.NEXT_PUBLIC_GIT_SHA || process.env.NEXT_PUBLIC_BUILD_SHA || "local",
  buildTime: process.env.NEXT_PUBLIC_BUILD_TIME || "",
};

export function shortGitSha(gitSha: string) {
  return gitSha.length > 7 ? gitSha.slice(0, 7) : gitSha;
}

export function displayBuildTime(buildTime: string) {
  if (!buildTime) return "";
  return buildTime.replace("T", " ").replace(/\.\d{3}Z$/, " UTC").replace(/Z$/, " UTC");
}

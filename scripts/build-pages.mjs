import { existsSync, renameSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const projectRoot = process.cwd();
const apiDirectory = resolve(projectRoot, "app/api");
const backupDirectory = resolve(projectRoot, ".github-pages-api-backup");
const nextBinary = resolve(projectRoot, "node_modules/next/dist/bin/next");
const releaseNumber = process.env.NEXT_PUBLIC_RELEASE_NUMBER || process.env.GITHUB_RUN_NUMBER || "dev";
const gitSha = process.env.NEXT_PUBLIC_GIT_SHA || process.env.NEXT_PUBLIC_BUILD_SHA || process.env.GITHUB_SHA || spawnSync("git", ["rev-parse", "HEAD"], { cwd: projectRoot, encoding: "utf8" }).stdout.trim() || "UNKNOWN";
const buildTime = process.env.NEXT_PUBLIC_BUILD_TIME || new Date().toISOString();

if (!existsSync(apiDirectory)) {
  throw new Error("Cannot create GitHub Pages build: app/api was not found.");
}
if (existsSync(backupDirectory)) {
  throw new Error("Cannot create GitHub Pages build: stale .github-pages-api-backup exists.");
}

renameSync(apiDirectory, backupDirectory);
let exitCode = 1;
try {
  const result = spawnSync(process.execPath, [nextBinary, "build"], {
    cwd: projectRoot,
    env: {
      ...process.env,
      GITHUB_PAGES: "true",
      NEXT_PUBLIC_RELEASE_NUMBER: releaseNumber,
      NEXT_PUBLIC_GIT_SHA: gitSha,
      NEXT_PUBLIC_BUILD_SHA: gitSha,
      NEXT_PUBLIC_BUILD_TIME: buildTime,
    },
    stdio: "inherit",
  });
  exitCode = result.status ?? 1;
} finally {
  renameSync(backupDirectory, apiDirectory);
}

process.exitCode = exitCode;

import { existsSync, renameSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const projectRoot = process.cwd();
const apiDirectory = resolve(projectRoot, "app/api");
const backupDirectory = resolve(projectRoot, ".github-pages-api-backup");
const nextBinary = resolve(projectRoot, "node_modules/next/dist/bin/next");

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
    env: { ...process.env, GITHUB_PAGES: "true" },
    stdio: "inherit",
  });
  exitCode = result.status ?? 1;
} finally {
  renameSync(backupDirectory, apiDirectory);
}

process.exitCode = exitCode;

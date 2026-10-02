import type { NextConfig } from "next";

const githubPagesBuild = process.env.GITHUB_PAGES === "true";
const basePath = (process.env.NEXT_PUBLIC_BASE_PATH || "").replace(/\/+$/, "");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Explicitly expose only the public API origin to the static client bundle.
  // GitHub Pages has no Next.js API routes, so losing this value makes both
  // voice config and TTS silently fall back to the same-origin 404 path.
  env: {
    NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL || "",
  },
  outputFileTracingRoot: process.cwd(),
  output: githubPagesBuild ? "export" : "standalone",
  ...(githubPagesBuild ? {
    trailingSlash: true,
    basePath,
    assetPrefix: basePath ? `${basePath}/` : undefined,
    images: { unoptimized: true },
  } : {}),
};

export default nextConfig;

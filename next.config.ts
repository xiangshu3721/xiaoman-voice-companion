import type { NextConfig } from "next";

const githubPagesBuild = process.env.GITHUB_PAGES === "true";
const basePath = (process.env.NEXT_PUBLIC_BASE_PATH || "").replace(/\/+$/, "");

const nextConfig: NextConfig = {
  reactStrictMode: true,
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

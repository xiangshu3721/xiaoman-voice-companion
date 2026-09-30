const apiBaseUrl = (process.env.NEXT_PUBLIC_API_BASE_URL || "").replace(/\/+$/, "");
const siteBasePath = (process.env.NEXT_PUBLIC_BASE_PATH || "").replace(/\/+$/, "");

export function apiUrl(path: string) {
  return `${apiBaseUrl}${path.startsWith("/") ? path : `/${path}`}`;
}

export function sitePath(path = "/") {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  if (!siteBasePath) return normalized;
  return normalized === "/" ? `${siteBasePath}/` : `${siteBasePath}${normalized}`;
}

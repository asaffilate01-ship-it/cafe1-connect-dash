const PUBLIC_DOCUMENTS = new Set([
  "/",
  "/about",
  "/blog",
  "/breakfast-st-albans",
  "/cookies",
  "/contact",
  "/gdpr",
  "/halal-food-st-albans",
  "/judges",
  "/judges-menu",
  "/jury-menu",
  "/lunch-st-albans",
  "/menu",
  "/order-direct",
  "/privacy",
  "/socials",
  "/terms",
  "/watcher-download",
]);

export const PUBLIC_DOCUMENT_CACHE_HEADERS = {
  // Browsers revalidate so a customer never keeps an old menu shell. The CDN
  // can serve the shared, non-personalised document while a fresh copy is made.
  "Cache-Control": "public, max-age=0, must-revalidate",
  "CDN-Cache-Control": "public, s-maxage=300, stale-while-revalidate=86400",
  "Cloudflare-CDN-Cache-Control": "public, s-maxage=300, stale-while-revalidate=86400",
} as const;

export function isPublicDocumentPath(pathname: string): boolean {
  return PUBLIC_DOCUMENTS.has(pathname) || pathname.startsWith("/blog/");
}

export function canCachePublicDocument(request: Request, response: Response): boolean {
  if (request.method !== "GET" && request.method !== "HEAD") return false;
  if (!isPublicDocumentPath(new URL(request.url).pathname)) return false;
  if (response.status !== 200) return false;
  if (request.headers.has("authorization") || request.headers.has("cookie")) return false;
  if (response.headers.has("set-cookie")) return false;
  return (response.headers.get("content-type") ?? "").toLowerCase().includes("text/html");
}

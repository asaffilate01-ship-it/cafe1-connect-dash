// The service worker and manifest are mutable, stable URLs. They must be
// revalidated so browsers discover releases instead of keeping stale app
// metadata or worker logic behind an edge cache.
export const MUTABLE_PUBLIC_ASSET_HEADERS = {
  "Cache-Control": "public, max-age=0, must-revalidate",
  "Cloudflare-CDN-Cache-Control": "no-cache",
  "CDN-Cache-Control": "no-cache",
} as const;

export function createMutablePublicAssetRouteRules() {
  return Object.fromEntries(
    ["/sw.js", "/manifest.webmanifest", "/kds.webmanifest"].map((path) => [
      path,
      { cache: false, headers: MUTABLE_PUBLIC_ASSET_HEADERS },
    ]),
  );
}

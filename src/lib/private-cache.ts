export const PRIVATE_ROUTE_ROOTS = [
  "/api",
  "/admin",
  "/staff",
  "/staff-hours",
  "/till",
  "/kds",
  "/driver",
  "/display",
  "/pay",
  "/order",
  "/print",
  "/account",
  "/tab",
  "/checkout",
  "/cart",
  "/lovable",
] as const;

export const PRIVATE_CACHE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  // Cloudflare may normalise the browser-facing Cache-Control header unless
  // explicit CDN policy is supplied. These directives keep both Cloudflare
  // and any upstream CDN from storing authenticated or checkout responses.
  "Cloudflare-CDN-Cache-Control": "no-store",
  "CDN-Cache-Control": "no-store",
  Pragma: "no-cache",
  Expires: "0",
} as const;

export function isPrivatePath(pathname: string): boolean {
  return PRIVATE_ROUTE_ROOTS.some((root) => pathname === root || pathname.startsWith(`${root}/`));
}

export function createPrivateRouteRules() {
  return Object.fromEntries(
    PRIVATE_ROUTE_ROOTS.flatMap((root) => [
      [root, { cache: false, headers: PRIVATE_CACHE_HEADERS }],
      [`${root}/**`, { cache: false, headers: PRIVATE_CACHE_HEADERS }],
    ]),
  );
}

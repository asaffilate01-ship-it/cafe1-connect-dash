import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { isPrivatePath, PRIVATE_CACHE_HEADERS } from "./lib/private-cache";
import { canCachePublicDocument, PUBLIC_DOCUMENT_CACHE_HEADERS } from "./lib/public-cache";
import { isRequestCancellation } from "./lib/request-cancellation";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

// The Lovable editor renders the app inside an iframe on its preview hosts.
// Production hosts stay fully frame-denied.
const FRAMEABLE_HOST_SUFFIXES = [".lovableproject.com", ".lovable.app", ".lovable.dev"];

export function isPreviewHost(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    FRAMEABLE_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix))
  );
}

function permissionsPolicy(pathname: string): string {
  const geolocation = /^\/driver(?:\/|$)/.test(pathname) ? "geolocation=(self)" : "geolocation=()";
  const payment = /^(?:\/checkout(?:\/|$)|\/pay(?:\/|$)|\/google-pay-test(?:\/|$)|\/google-pay-review(?:\/|$))/.test(
    pathname,
  )
    ? "payment=(self)"
    : "payment=()";
  return ["camera=()", geolocation, "microphone=()", payment, "usb=()"].join(", ");
}

export function withProductionHeaders(request: Request, response: Response): Response {
  const url = new URL(request.url);
  const previewHost = isPreviewHost(url.hostname);
  const headers = new Headers(response.headers);
  headers.set("X-Content-Type-Options", "nosniff");
  if (previewHost) {
    headers.delete("X-Frame-Options");
  } else {
    headers.set("X-Frame-Options", "DENY");
  }
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("Permissions-Policy", permissionsPolicy(url.pathname));
  headers.set(
    "Content-Security-Policy",
    [
      "base-uri 'self'",
      "object-src 'none'",
      "form-action 'self'",
      "manifest-src 'self'",
      "worker-src 'self' blob:",
      previewHost
        ? "frame-ancestors 'self' https://lovable.dev https://*.lovable.dev https://*.lovable.app https://*.lovableproject.com"
        : "frame-ancestors 'none'",
      "frame-src 'self' https://gateway.sumup.com https://pay.google.com https://www.google.com https://maps.google.com https://www.youtube-nocookie.com https://www.youtube.com https://www.tiktok.com https://www.instagram.com https://www.facebook.com",
      "upgrade-insecure-requests",
    ].join("; "),
  );
  if (url.protocol === "https:") {
    headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }

  const pathname = url.pathname;
  if (isPrivatePath(pathname)) {
    for (const [name, value] of Object.entries(PRIVATE_CACHE_HEADERS)) {
      headers.set(name, value);
    }
    headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  } else if (!previewHost && canCachePublicDocument(request, response)) {
    for (const [name, value] of Object.entries(PUBLIC_DOCUMENT_CACHE_HEADERS)) {
      headers.set(name, value);
    }
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  const captured = consumeLastCapturedError();
  if (isRequestCancellation(captured)) return new Response(null, { status: 499 });
  console.error(captured ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

export function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

function dishBeeRedirect(request: Request): Response | undefined {
  const url = new URL(request.url);
  if (url.pathname !== "/") return undefined;
  const host = request.headers.get("x-forwarded-host") ?? url.hostname;
  if (host === "dishbee.itechlounge.co.uk" || host === "www.dishbee.itechlounge.co.uk") {
    return Response.redirect("https://dishbee.itechlounge.co.uk/platform", 308);
  }
  return undefined;
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      if (request.signal.aborted) return new Response(null, { status: 499 });
      const redirectResponse = dishBeeRedirect(request);
      if (redirectResponse) return redirectResponse;
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      if (request.signal.aborted) return new Response(null, { status: 499 });
      return withProductionHeaders(request, await normalizeCatastrophicSsrResponse(response));
    } catch (error) {
      // The client went away mid-response — nothing to render, nothing to report.
      if (request.signal.aborted || isRequestCancellation(error)) {
        return new Response(null, { status: 499 });
      }
      console.error(error);
      return withProductionHeaders(
        request,
        new Response(renderErrorPage(), {
          status: 500,
          headers: { "content-type": "text/html; charset=utf-8" },
        }),
      );
    }
  },
};

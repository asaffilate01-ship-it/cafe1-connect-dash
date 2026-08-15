import { describe, expect, it } from "vitest";

import { isH3SwallowedErrorBody, isPreviewHost, withProductionHeaders } from "../../server";
import { isPrivatePath, PRIVATE_ROUTE_ROOTS } from "../private-cache";
import { canCachePublicDocument, isPublicDocumentPath } from "../public-cache";

describe("production response security", () => {
  it("sets browser security headers on the production origin", () => {
    const response = withProductionHeaders(
      new Request("https://cafe1stalbans.co.uk/menu"),
      new Response("menu"),
    );

    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("x-frame-options")).toBe("DENY");
    expect(response.headers.get("permissions-policy")).toContain("payment=()");
    expect(response.headers.get("permissions-policy")).toContain("geolocation=()");
    expect(response.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
    expect(response.headers.get("content-security-policy")).toContain(
      "https://www.youtube-nocookie.com",
    );
    expect(response.headers.get("content-security-policy")).toContain("https://www.tiktok.com");
    expect(response.headers.get("content-security-policy")).toContain("form-action 'self'");
    expect(response.headers.get("strict-transport-security")).toContain("max-age=31536000");
  });

  it("grants sensitive browser capabilities only to the routes that use them", () => {
    const driver = withProductionHeaders(
      new Request("https://cafe1stalbans.co.uk/driver"),
      new Response("driver"),
    );
    const checkout = withProductionHeaders(
      new Request("https://cafe1stalbans.co.uk/checkout"),
      new Response("checkout"),
    );
    const payment = withProductionHeaders(
      new Request("https://cafe1stalbans.co.uk/pay/order-1"),
      new Response("payment"),
    );

    expect(driver.headers.get("permissions-policy")).toContain("geolocation=(self)");
    expect(driver.headers.get("permissions-policy")).toContain("payment=()");
    expect(checkout.headers.get("permissions-policy")).toContain("geolocation=()");
    expect(checkout.headers.get("permissions-policy")).toContain("payment=(self)");
    expect(payment.headers.get("permissions-policy")).toContain("payment=(self)");
    expect(payment.headers.get("permissions-policy")).toContain("camera=()");
  });

  it("prevents private operational pages from being cached", () => {
    const response = withProductionHeaders(
      new Request("https://cafe1stalbans.co.uk/admin/security"),
      new Response("restricted"),
    );

    expect(response.headers.get("cache-control")).toContain("private");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("cloudflare-cdn-cache-control")).toBe("no-store");
    expect(response.headers.get("cdn-cache-control")).toBe("no-store");
    expect(response.headers.get("pragma")).toBe("no-cache");
    expect(response.headers.get("expires")).toBe("0");
    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow, noarchive");
  });

  it("keeps application and edge private-route matching aligned", () => {
    for (const root of PRIVATE_ROUTE_ROOTS) {
      expect(isPrivatePath(root)).toBe(true);
      expect(isPrivatePath(`${root}/example`)).toBe(true);
    }

    expect(isPrivatePath("/menu")).toBe(false);
    expect(isPrivatePath("/administrator")).toBe(false);
    expect(isPrivatePath("/orders-public")).toBe(false);
  });

  it("lets the CDN absorb cold starts only for anonymous public HTML", () => {
    const response = withProductionHeaders(
      new Request("https://cafe1stalbans.co.uk/menu"),
      new Response("<main>menu</main>", { headers: { "content-type": "text/html" } }),
    );

    expect(response.headers.get("cache-control")).toBe("public, max-age=0, must-revalidate");
    expect(response.headers.get("cdn-cache-control")).toContain("s-maxage=300");
    expect(response.headers.get("cloudflare-cdn-cache-control")).toContain(
      "stale-while-revalidate=86400",
    );
    expect(isPublicDocumentPath("/blog/halal-breakfast-st-albans")).toBe(true);
    expect(isPublicDocumentPath("/order-direct")).toBe(true);
    expect(isPublicDocumentPath("/watcher-download")).toBe(true);
    expect(isPublicDocumentPath("/checkout")).toBe(false);
  });

  it("never shares public documents when a request or response is personalised", () => {
    const html = new Response("<main>menu</main>", {
      headers: { "content-type": "text/html", "set-cookie": "session=private" },
    });
    expect(canCachePublicDocument(new Request("https://cafe1stalbans.co.uk/menu"), html)).toBe(
      false,
    );
    expect(
      canCachePublicDocument(
        new Request("https://cafe1stalbans.co.uk/menu", {
          headers: { cookie: "session=private" },
        }),
        new Response("<main>menu</main>", { headers: { "content-type": "text/html" } }),
      ),
    ).toBe(false);
    expect(
      canCachePublicDocument(
        new Request("https://cafe1stalbans.co.uk/not-a-public-document"),
        new Response("<main>unknown</main>", { headers: { "content-type": "text/html" } }),
      ),
    ).toBe(false);
  });

  it("allows Lovable preview framing without weakening production", () => {
    const response = withProductionHeaders(
      new Request("https://preview.lovable.app/"),
      new Response("preview"),
    );

    expect(isPreviewHost("preview.lovable.app")).toBe(true);
    expect(isPreviewHost("cafe1stalbans.co.uk")).toBe(false);
    expect(response.headers.has("x-frame-options")).toBe(false);
    expect(response.headers.get("content-security-policy")).toContain("https://*.lovable.app");
  });

  it("recognises only the catastrophic h3 error envelope", () => {
    expect(isH3SwallowedErrorBody('{"unhandled":true,"message":"HTTPError"}')).toBe(true);
    expect(isH3SwallowedErrorBody('{"unhandled":false,"message":"HTTPError"}')).toBe(false);
    expect(isH3SwallowedErrorBody("not-json")).toBe(false);
  });
});

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  PRODUCTION_CHECKS,
  parseProductionOrigin,
  verifyProduction,
} from "./verify-production.mjs";

const securityHeaders = {
  "strict-transport-security": "max-age=31536000; includeSubDomains",
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "x-frame-options": "DENY",
  "permissions-policy": "camera=(), geolocation=(), microphone=(), payment=(), usb=()",
  "content-security-policy":
    "base-uri 'self'; object-src 'none'; form-action 'self'; frame-ancestors 'none'; frame-src 'self' https://www.youtube-nocookie.com https://www.tiktok.com; upgrade-insecure-requests",
};

function successfulFetch(input) {
  const url = new URL(input);
  const specification = PRODUCTION_CHECKS.find((check) => check.path === url.pathname);
  assert.ok(specification, url.pathname);
  const status = specification.statuses[0];
  let body = "";
  let contentType = "text/html; charset=utf-8";

  if (url.pathname === "/") body = "<html>Cafe 1, St Albans Crown Court, AL1 3JU</html>";
  if (url.pathname === "/robots.txt") {
    body = "User-agent: *\nDisallow: /admin\nSitemap: https://cafe1stalbans.co.uk/sitemap.xml\n";
    contentType = "text/plain; charset=utf-8";
  }
  if (url.pathname === "/sitemap.xml") {
    body = `<?xml version="1.0"?><urlset>
      <url><loc>https://cafe1stalbans.co.uk/breakfast-st-albans</loc></url>
      <url><loc>https://cafe1stalbans.co.uk/halal-food-st-albans</loc></url>
      <url><loc>https://cafe1stalbans.co.uk/lunch-st-albans</loc></url>
      <url><loc>https://cafe1stalbans.co.uk/blog</loc></url>
    </urlset>`;
    contentType = "application/xml";
  }
  if (url.pathname === "/api/public/health") {
    body = JSON.stringify({
      status: "ok",
      service: "cafe1-st-albans",
      postcode: "AL1 3JU",
      release: "3e0b4f1e1c51a1b9437faa8a2eb0e7ee5c7c55c6",
    });
    contentType = "application/json";
  }
  if (url.pathname === "/manifest.webmanifest") {
    body = JSON.stringify({
      name: "Cafe 1",
      short_name: "Cafe 1",
      id: "/",
      scope: "/",
      start_url: "/",
      display: "standalone",
      icons: [
        { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
        {
          src: "/icon-512.png",
          sizes: "512x512",
          type: "image/png",
          purpose: "maskable",
        },
      ],
    });
    contentType = "application/manifest+json";
  }
  if (url.pathname === "/kds.webmanifest") {
    body = JSON.stringify({
      name: "Cafe 1 KDS",
      short_name: "KDS",
      id: "/kds",
      scope: "/kds",
      start_url: "/kds?source=pwa",
      display: "standalone",
      icons: [
        { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
        {
          src: "/icon-512.png",
          sizes: "512x512",
          type: "image/png",
          purpose: "maskable",
        },
      ],
    });
    contentType = "application/manifest+json";
  }
  if (url.pathname === "/sw.js") {
    body =
      'const ASSET_CACHE = "cafe1-assets-v2"; const PROTECTED_PREFIXES = ["/admin", "/till", "/kds", "/checkout", "/cart"]; if (request.mode === "navigate") return;';
    contentType = "text/javascript";
  }
  if (url.pathname.endsWith(".png")) contentType = "image/png";
  if (url.pathname.endsWith("-watcher-windows.zip")) {
    body = "PK";
    contentType = "application/zip";
  }

  const headers = new Headers({ ...securityHeaders, "content-type": contentType });
  if (specification.protectedRoute) {
    headers.set("cache-control", "private, no-store, max-age=0");
    headers.set("x-robots-tag", "noindex, nofollow, noarchive");
  }
  if (specification.mutablePublicAsset) {
    headers.set("cache-control", "public, max-age=0, must-revalidate");
    headers.set("cdn-cache-control", "no-cache");
    headers.set("cloudflare-cdn-cache-control", "no-cache");
  }
  return Promise.resolve(new Response(body, { status, headers }));
}

test("accepts only a credential-free HTTPS production origin", () => {
  assert.equal(
    parseProductionOrigin("https://cafe1stalbans.co.uk/path").href,
    "https://cafe1stalbans.co.uk/",
  );
  assert.throws(() => parseProductionOrigin("http://cafe1stalbans.co.uk"), /credential-free HTTPS/);
  assert.throws(
    () => parseProductionOrigin("https://user:pass@example.com"),
    /credential-free HTTPS/,
  );
});

test("passes the full production contract and records structured checks", async () => {
  const report = await verifyProduction({
    baseUrl: "https://cafe1stalbans.co.uk",
    expectedRelease: "3e0b4f1e1c51a1b9437faa8a2eb0e7ee5c7c55c6",
    fetchImpl: successfulFetch,
  });

  assert.equal(report.passed, true);
  assert.equal(report.check_count, PRODUCTION_CHECKS.length);
  assert.equal(
    report.checks.every((check) => check.passed),
    true,
  );
});

test("covers every live POS and operational surface with private caching checks", () => {
  for (const path of ["/till", "/kds", "/display", "/driver", "/staff", "/account", "/tab"]) {
    const check = PRODUCTION_CHECKS.find((candidate) => candidate.path === path);
    assert.ok(check, `${path} is missing from production smoke`);
    assert.equal(check.protectedRoute, true, `${path} must be treated as private`);
  }
});

test("requires both Deliveroo channels to fail closed when probed without credentials", () => {
  for (const path of ["/api/public/deliveroo/webhook", "/api/public/deliveroo/hub-ingest"]) {
    const check = PRODUCTION_CHECKS.find((candidate) => candidate.path === path);
    assert.ok(check, `${path} is missing from production smoke`);
    assert.deepEqual(check.statuses, [401, 503]);
    assert.equal(check.method, "POST");
    assert.equal(check.protectedRoute, true);
    assert.equal(check.statuses.includes(200), false);
  }
});

test("requires both Just Eat channels and both watcher packages in production smoke", () => {
  for (const path of ["/api/public/justeat/webhook", "/api/public/justeat/hub-ingest"]) {
    const check = PRODUCTION_CHECKS.find((candidate) => candidate.path === path);
    assert.ok(check, `${path} is missing from production smoke`);
    assert.deepEqual(check.statuses, [401, 503]);
    assert.equal(check.method, "POST");
    assert.equal(check.protectedRoute, true);
    assert.equal(check.statuses.includes(200), false);
  }

  for (const path of [
    "/downloads/cafe1-justeat-watcher-windows.zip",
    "/downloads/cafe1-deliveroo-watcher-windows.zip",
  ]) {
    const check = PRODUCTION_CHECKS.find((candidate) => candidate.path === path);
    assert.ok(check, `${path} is missing from production smoke`);
    assert.deepEqual(check.statuses, [200]);
    assert.match("application/zip", check.contentType);
  }
});

test("covers the direct-order and watcher landing pages", () => {
  for (const path of ["/order-direct", "/watcher-download"]) {
    const check = PRODUCTION_CHECKS.find((candidate) => candidate.path === path);
    assert.ok(check, `${path} is missing from production smoke`);
    assert.deepEqual(check.statuses, [200]);
    assert.match("text/html", check.contentType);
  }
});

test("covers every install surface and public legal/help page", () => {
  for (const path of [
    "/terms",
    "/gdpr",
    "/complaints",
    "/faq",
    "/manifest.webmanifest",
    "/kds.webmanifest",
    "/sw.js",
    "/icon-192.png",
    "/icon-512.png",
  ]) {
    assert.ok(
      PRODUCTION_CHECKS.some((candidate) => candidate.path === path),
      `${path} is missing`,
    );
  }
  for (const path of ["/manifest.webmanifest", "/kds.webmanifest", "/sw.js"]) {
    assert.equal(
      PRODUCTION_CHECKS.find((candidate) => candidate.path === path)?.mutablePublicAsset,
      true,
    );
  }
});

test("rejects stale PWA assets and invalid deployed manifests", async () => {
  const report = await verifyProduction({
    baseUrl: "https://cafe1stalbans.co.uk",
    fetchImpl: async (input) => {
      const response = await successfulFetch(input);
      const url = new URL(input);
      if (url.pathname === "/manifest.webmanifest") {
        const headers = new Headers(response.headers);
        headers.set("cf-cache-status", "HIT");
        headers.set("age", "120");
        return new Response(JSON.stringify({ id: "/wrong" }), { status: 200, headers });
      }
      return response;
    },
  });

  assert.equal(report.passed, false);
  assert.equal(
    report.failures.some((failure) => failure.includes("stale shared cache")),
    true,
  );
  assert.equal(
    report.failures.some((failure) => failure.includes("web manifest id")),
    true,
  );
});

test("rejects an unversioned or mismatched deployment", async () => {
  const report = await verifyProduction({
    baseUrl: "https://cafe1stalbans.co.uk",
    expectedRelease: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    fetchImpl: successfulFetch,
  });

  assert.equal(report.passed, false);
  assert.equal(
    report.failures.some((failure) => failure.includes("does not match expected")),
    true,
  );
});

test("reports protected caching and postcode regressions", async () => {
  const report = await verifyProduction({
    baseUrl: "https://cafe1stalbans.co.uk",
    fetchImpl: async (input) => {
      const response = await successfulFetch(input);
      const url = new URL(input);
      if (url.pathname === "/admin/security") {
        const headers = new Headers(response.headers);
        headers.set("cache-control", "no-cache");
        return new Response(response.body, { status: response.status, headers });
      }
      if (url.pathname === "/") {
        return new Response("AL1 3JW", { status: 200, headers: response.headers });
      }
      return response;
    },
  });

  assert.equal(report.passed, false);
  assert.equal(
    report.failures.some((failure) => failure.includes("private, no-store")),
    true,
  );
  assert.equal(
    report.failures.some((failure) => failure.includes("AL1 3JW")),
    true,
  );
});

test("rejects protected content served from an intermediary cache", async () => {
  const report = await verifyProduction({
    baseUrl: "https://cafe1stalbans.co.uk",
    fetchImpl: async (input) => {
      const response = await successfulFetch(input);
      const url = new URL(input);
      if (url.pathname === "/checkout") {
        const headers = new Headers(response.headers);
        headers.set("cf-cache-status", "HIT");
        headers.set("age", "60");
        return new Response(response.body, { status: response.status, headers });
      }
      return response;
    },
  });

  assert.equal(report.passed, false);
  assert.equal(
    report.failures.some((failure) => failure.includes("served from Cloudflare cache")),
    true,
  );
  assert.equal(
    report.failures.some((failure) => failure.includes("reusable cache age")),
    true,
  );
});

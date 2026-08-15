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
  if (url.pathname.endsWith("-watcher-windows.zip")) {
    body = "PK";
    contentType = "application/zip";
  }

  const headers = new Headers({ ...securityHeaders, "content-type": contentType });
  if (specification.protectedRoute) {
    headers.set("cache-control", "private, no-store, max-age=0");
    headers.set("x-robots-tag", "noindex, nofollow, noarchive");
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

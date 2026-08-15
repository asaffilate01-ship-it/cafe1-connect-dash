import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const root = resolve(dirname(scriptPath), "..");

const PAGE_SECURITY_HEADERS = [
  ["strict-transport-security", /max-age=/i],
  ["x-content-type-options", /^nosniff$/i],
  ["referrer-policy", /strict-origin-when-cross-origin/i],
  ["x-frame-options", /^DENY$/i],
  ["permissions-policy", /camera=\(\)/i],
  ["content-security-policy", /base-uri\s+'self'/i],
  ["content-security-policy", /object-src\s+'none'/i],
  ["content-security-policy", /frame-ancestors\s+'none'/i],
  ["content-security-policy", /frame-src\s+'self'[^;]*youtube-nocookie\.com/i],
  ["content-security-policy", /form-action\s+'self'/i],
];

export const DEFAULT_MAX_DURATION_MS = 10_000;

export function responseBudgetBytes(specification) {
  if (specification.path.endsWith("-watcher-windows.zip")) return 100 * 1024 * 1024;
  if (specification.path.endsWith(".png")) return 2 * 1024 * 1024;
  if (specification.inspectManifest || specification.inspectRelease) return 64 * 1024;
  if (specification.inspectWorker) return 512 * 1024;
  if (specification.inspectRobots) return 128 * 1024;
  if (specification.inspectSitemap) return 2 * 1024 * 1024;
  return 2 * 1024 * 1024;
}

export const PRODUCTION_CHECKS = [
  { path: "/", statuses: [200], contentType: /text\/html/i, inspectPostcode: true },
  { path: "/menu", statuses: [200], contentType: /text\/html/i },
  { path: "/breakfast-st-albans", statuses: [200], contentType: /text\/html/i },
  { path: "/halal-food-st-albans", statuses: [200], contentType: /text\/html/i },
  { path: "/lunch-st-albans", statuses: [200], contentType: /text\/html/i },
  { path: "/blog", statuses: [200], contentType: /text\/html/i },
  { path: "/about", statuses: [200], contentType: /text\/html/i },
  { path: "/contact", statuses: [200], contentType: /text\/html/i },
  { path: "/order-direct", statuses: [200], contentType: /text\/html/i },
  { path: "/socials", statuses: [200], contentType: /text\/html/i },
  { path: "/watcher-download", statuses: [200], contentType: /text\/html/i },
  { path: "/privacy", statuses: [200], contentType: /text\/html/i },
  { path: "/terms", statuses: [200], contentType: /text\/html/i },
  { path: "/cookies", statuses: [200], contentType: /text\/html/i },
  { path: "/gdpr", statuses: [200], contentType: /text\/html/i },
  { path: "/complaints", statuses: [200], contentType: /text\/html/i },
  { path: "/faq", statuses: [200], contentType: /text\/html/i },
  { path: "/cart", statuses: [200], contentType: /text\/html/i, protectedRoute: true },
  { path: "/checkout", statuses: [200], contentType: /text\/html/i, protectedRoute: true },
  { path: "/admin/login", statuses: [200], contentType: /text\/html/i, protectedRoute: true },
  {
    path: "/admin/security",
    statuses: [200, 301, 302, 303, 307, 308],
    contentType: /text\/html/i,
    protectedRoute: true,
  },
  { path: "/till", statuses: [200], contentType: /text\/html/i, protectedRoute: true },
  { path: "/kds", statuses: [200], contentType: /text\/html/i, protectedRoute: true },
  { path: "/display", statuses: [200], contentType: /text\/html/i, protectedRoute: true },
  { path: "/driver", statuses: [200], contentType: /text\/html/i, protectedRoute: true },
  { path: "/staff", statuses: [200], contentType: /text\/html/i, protectedRoute: true },
  { path: "/account", statuses: [200], contentType: /text\/html/i, protectedRoute: true },
  { path: "/tab", statuses: [200], contentType: /text\/html/i, protectedRoute: true },
  {
    path: "/robots.txt",
    statuses: [200],
    contentType: /text\/plain/i,
    inspectRobots: true,
    browserDocument: false,
  },
  {
    path: "/sitemap.xml",
    statuses: [200],
    contentType: /(?:application|text)\/xml/i,
    inspectSitemap: true,
    browserDocument: false,
  },
  {
    path: "/manifest.webmanifest",
    statuses: [200],
    contentType: /application\/(?:manifest\+json|json)/i,
    browserDocument: false,
    mutablePublicAsset: true,
    inspectManifest: "customer",
  },
  {
    path: "/kds.webmanifest",
    statuses: [200],
    contentType: /application\/(?:manifest\+json|json)/i,
    browserDocument: false,
    mutablePublicAsset: true,
    inspectManifest: "kds",
  },
  {
    path: "/sw.js",
    statuses: [200],
    contentType: /(?:application|text)\/javascript/i,
    browserDocument: false,
    mutablePublicAsset: true,
    inspectWorker: true,
  },
  {
    path: "/icon-192.png",
    statuses: [200],
    contentType: /image\/png/i,
    browserDocument: false,
  },
  {
    path: "/icon-512.png",
    statuses: [200],
    contentType: /image\/png/i,
    browserDocument: false,
  },
  {
    path: "/api/public/cleanup-unpaid",
    statuses: [405],
    method: "GET",
    protectedRoute: true,
    browserDocument: false,
  },
  {
    path: "/api/public/juror-daily",
    statuses: [405],
    method: "GET",
    protectedRoute: true,
    browserDocument: false,
  },
  {
    path: "/api/public/deliveroo/webhook",
    // 401 means the Orders API channel is configured and rejected this unsigned probe.
    // 503 is the correct fail-closed state when the café uses only the Hub watcher.
    statuses: [401, 503],
    method: "POST",
    protectedRoute: true,
    browserDocument: false,
  },
  {
    path: "/api/public/deliveroo/hub-ingest",
    // The watcher endpoint follows the inverse configuration state but must never accept this probe.
    statuses: [401, 503],
    method: "POST",
    protectedRoute: true,
    browserDocument: false,
  },
  {
    path: "/api/public/justeat/webhook",
    // Enabled webhook mode rejects an unsigned probe with 401. Every other
    // mode must remain unavailable with 503; an anonymous 2xx is never valid.
    statuses: [401, 503],
    method: "POST",
    protectedRoute: true,
    browserDocument: false,
  },
  {
    path: "/api/public/justeat/hub-ingest",
    // The local watcher channel follows the inverse mode but must also fail
    // closed when the smoke request supplies no bridge secret.
    statuses: [401, 503],
    method: "POST",
    protectedRoute: true,
    browserDocument: false,
  },
  {
    path: "/downloads/cafe1-justeat-watcher-windows.zip",
    statuses: [200],
    contentType: /application\/zip/i,
    browserDocument: false,
  },
  {
    path: "/downloads/cafe1-deliveroo-watcher-windows.zip",
    statuses: [200],
    contentType: /application\/zip/i,
    browserDocument: false,
  },
  {
    path: "/api/public/health",
    statuses: [200],
    contentType: /application\/json/i,
    protectedRoute: true,
    browserDocument: false,
    inspectRelease: true,
  },
];

export function parseProductionOrigin(supplied) {
  if (!supplied) {
    throw new Error("Set PRODUCTION_BASE_URL or pass the production HTTPS origin as an argument.");
  }

  const base = new URL(supplied);
  if (base.protocol !== "https:" || base.username || base.password || base.search || base.hash) {
    throw new Error("Production smoke checks require a credential-free HTTPS origin.");
  }
  base.pathname = "/";
  return base;
}

export async function verifyProduction({
  baseUrl,
  expectedRelease,
  fetchImpl = fetch,
  timeoutMs = 15_000,
  maxDurationMs = DEFAULT_MAX_DURATION_MS,
} = {}) {
  if (!Number.isFinite(maxDurationMs) || maxDurationMs <= 0 || maxDurationMs > timeoutMs) {
    throw new Error("Production max duration must be positive and no greater than the timeout.");
  }
  const base = parseProductionOrigin(baseUrl);
  const checks = await Promise.all(
    PRODUCTION_CHECKS.map(async (specification) => {
      const url = new URL(specification.path, base);
      const method = specification.method ?? "GET";
      const startedAt = performance.now();
      let response;

      try {
        response = await fetchImpl(url, {
          method,
          redirect: "manual",
          signal: AbortSignal.timeout(timeoutMs),
          headers: { "user-agent": "Cafe1-production-smoke/2.0" },
        });
      } catch (error) {
        const durationMs = Math.round((performance.now() - startedAt) * 100) / 100;
        const message = `${specification.path}: request failed (${error instanceof Error ? error.message : "unknown error"})`;
        return {
          path: specification.path,
          method,
          status: null,
          duration_ms: durationMs,
          response_bytes: null,
          duration_budget_ms: maxDurationMs,
          response_budget_bytes: responseBudgetBytes(specification),
          passed: false,
          failures: [message],
        };
      }

      const checkFailures = [];
      const fail = (message) => {
        const detail = `${specification.path}: ${message}`;
        checkFailures.push(detail);
      };

      if (!specification.statuses.includes(response.status)) {
        fail(`expected ${specification.statuses.join(" or ")}, received ${response.status}`);
      }

      const requiredHeaders =
        specification.browserDocument === false
          ? PAGE_SECURITY_HEADERS.slice(0, 3)
          : PAGE_SECURITY_HEADERS;
      for (const [name, expected] of requiredHeaders) {
        const value = response.headers.get(name) ?? "";
        if (!expected.test(value)) fail(`missing or invalid ${name}`);
      }

      if (specification.protectedRoute) {
        const cache = response.headers.get("cache-control") ?? "";
        const cacheStatus = response.headers.get("cf-cache-status") ?? "";
        const cdnCache = response.headers.get("cdn-cache-control") ?? "";
        const cloudflareCdnCache = response.headers.get("cloudflare-cdn-cache-control") ?? "";
        const rawAge = response.headers.get("age");
        const ageValue = Number(rawAge ?? "0");
        const ageIsZeroOrAbsent = rawAge === null || (Number.isFinite(ageValue) && ageValue === 0);

        const originPolicy = /private/i.test(cache) && /no-store/i.test(cache);
        // Lovable's Cloudflare edge rewrites the origin's `private, no-store, max-age=0`
        // response header and we cannot install a response-header rule to restore it.
        // Accept the edge-rewritten form only when every non-caching signal is present.
        const edgeRewrittenPolicy =
          /no-cache/i.test(cache) &&
          /must-revalidate/i.test(cache) &&
          /max-age=0/i.test(cache) &&
          /^no-store$/i.test(cdnCache.trim()) &&
          /^no-store$/i.test(cloudflareCdnCache.trim()) &&
          // DYNAMIC, or absent entirely (the edge omits the header for uncached responses)
          (cacheStatus.trim() === "" || /^DYNAMIC$/i.test(cacheStatus.trim())) &&
          ageIsZeroOrAbsent;

        if (!originPolicy && !edgeRewrittenPolicy) {
          fail(
            "protected response must use private, no-store caching (or the edge-rewritten no-cache, must-revalidate, max-age=0 with cdn-cache-control: no-store, cloudflare-cdn-cache-control: no-store, cf-cache-status: DYNAMIC and age 0)",
          );
        }

        if (/^(?:HIT|STALE|REVALIDATED|UPDATING)$/i.test(cacheStatus)) {
          fail(`protected response was served from Cloudflare cache (${cacheStatus})`);
        }

        if (Number.isFinite(ageValue) && ageValue > 0) {
          fail(`protected response has a reusable cache age of ${ageValue}`);
        }

        if (!/\bnoindex\b/i.test(response.headers.get("x-robots-tag") ?? "")) {
          fail("protected response must include x-robots-tag: noindex");
        }
      }

      if (specification.mutablePublicAsset) {
        const cache = response.headers.get("cache-control") ?? "";
        const cdnCache = response.headers.get("cdn-cache-control") ?? "";
        const cloudflareCdnCache = response.headers.get("cloudflare-cdn-cache-control") ?? "";
        const cacheStatus = response.headers.get("cf-cache-status") ?? "";
        const rawAge = response.headers.get("age");
        const age = Number(rawAge ?? "0");
        if (!/max-age=0/i.test(cache) || !/must-revalidate/i.test(cache)) {
          fail("mutable PWA asset must revalidate in the browser");
        }
        if (!/^no-cache$/i.test(cdnCache.trim())) {
          fail("mutable PWA asset must revalidate at shared CDNs");
        }
        if (!/^no-cache$/i.test(cloudflareCdnCache.trim())) {
          fail("mutable PWA asset must revalidate at Cloudflare");
        }
        if (/^(?:HIT|STALE|REVALIDATED|UPDATING)$/i.test(cacheStatus.trim())) {
          fail(`mutable PWA asset was served from stale shared cache (${cacheStatus})`);
        }
        if (Number.isFinite(age) && age > 0) {
          fail(`mutable PWA asset has a reusable cache age of ${age}`);
        }
      }

      const contentType = response.headers.get("content-type") ?? "";
      if (specification.contentType && !specification.contentType.test(contentType)) {
        fail(`unexpected content-type ${contentType || "(missing)"}`);
      }

      const shouldInspectBody =
        response.status === 200 &&
        (specification.inspectPostcode ||
          specification.inspectRobots ||
          specification.inspectSitemap ||
          specification.inspectManifest ||
          specification.inspectWorker ||
          specification.inspectRelease);
      let measuredBodyBytes = null;
      if (shouldInspectBody) {
        const body = await response.text();
        measuredBodyBytes = Buffer.byteLength(body, "utf8");
        if (specification.inspectPostcode) {
          if (!body.includes("AL1 3JU")) fail("confirmed postcode AL1 3JU is missing");
          if (body.includes("AL1 3JW")) fail("legacy postcode AL1 3JW is still rendered");
        }
        if (specification.inspectRobots) {
          if (!/Disallow:\s*\/admin/i.test(body)) fail("robots.txt does not block admin routes");
          if (!body.includes("https://cafe1stalbans.co.uk/sitemap.xml")) {
            fail("robots.txt does not reference the canonical sitemap");
          }
        }
        if (specification.inspectSitemap) {
          for (const required of [
            "https://cafe1stalbans.co.uk/breakfast-st-albans",
            "https://cafe1stalbans.co.uk/halal-food-st-albans",
            "https://cafe1stalbans.co.uk/lunch-st-albans",
            "https://cafe1stalbans.co.uk/blog",
          ]) {
            if (!body.includes(`<loc>${required}</loc>`)) {
              fail(`sitemap is missing ${required}`);
            }
          }
        }
        if (specification.inspectManifest) {
          let manifest;
          try {
            manifest = JSON.parse(body);
          } catch {
            fail("web manifest is not valid JSON");
          }
          if (manifest) {
            const expected =
              specification.inspectManifest === "kds"
                ? { id: "/kds", scope: "/kds", start_url: "/kds?source=pwa" }
                : { id: "/", scope: "/", start_url: "/" };
            for (const [field, value] of Object.entries(expected)) {
              if (manifest[field] !== value) fail(`web manifest ${field} must be ${value}`);
            }
            if (manifest.display !== "standalone") {
              fail("web manifest display must be standalone");
            }
            const icons = Array.isArray(manifest.icons) ? manifest.icons : [];
            for (const size of ["192x192", "512x512"]) {
              if (!icons.some((icon) => icon?.sizes === size && icon?.type === "image/png")) {
                fail(`web manifest is missing its ${size} PNG icon`);
              }
            }
            if (!icons.some((icon) => /(?:^|\s)maskable(?:\s|$)/.test(icon?.purpose ?? ""))) {
              fail("web manifest is missing a maskable icon");
            }
          }
        }
        if (specification.inspectWorker) {
          if (!body.includes('const ASSET_CACHE = "cafe1-assets-')) {
            fail("service worker asset-cache identity is missing");
          }
          if (!body.includes('request.mode === "navigate"')) {
            fail("service worker navigation cache exclusion is missing");
          }
          for (const route of ["/admin", "/till", "/kds", "/checkout", "/cart"]) {
            if (!body.includes(`"${route}"`)) {
              fail(`service worker does not exclude protected route ${route}`);
            }
          }
        }
        if (specification.inspectRelease) {
          let payload;
          try {
            payload = JSON.parse(body);
          } catch {
            fail("release health response is not valid JSON");
          }
          if (payload) {
            if (payload.status !== "ok" || payload.service !== "cafe1-st-albans") {
              fail("release health identity is invalid");
            }
            if (payload.postcode !== "AL1 3JU") {
              fail("release health postcode is invalid");
            }
            if (!/^[0-9a-f]{40}$/i.test(payload.release ?? "")) {
              fail("release health does not expose a 40-character Git commit");
            } else if (
              expectedRelease &&
              payload.release.toLowerCase() !== expectedRelease.toLowerCase()
            ) {
              fail(
                `deployed release ${payload.release} does not match expected ${expectedRelease}`,
              );
            }
          }
        }
      }

      const rawContentLength = response.headers.get("content-length");
      const parsedContentLength = rawContentLength === null ? null : Number(rawContentLength);
      const responseBytes =
        measuredBodyBytes ??
        (Number.isSafeInteger(parsedContentLength) && parsedContentLength >= 0
          ? parsedContentLength
          : null);
      const responseBudget = responseBudgetBytes(specification);
      if (responseBytes !== null && responseBytes > responseBudget) {
        fail(`response size ${responseBytes} bytes exceeds budget ${responseBudget} bytes`);
      }

      const durationMs = Math.round((performance.now() - startedAt) * 100) / 100;
      if (durationMs > maxDurationMs) {
        fail(`response time ${durationMs}ms exceeds budget ${maxDurationMs}ms`);
      }

      return {
        path: specification.path,
        method,
        status: response.status,
        duration_ms: durationMs,
        response_bytes: responseBytes,
        duration_budget_ms: maxDurationMs,
        response_budget_bytes: responseBudget,
        passed: checkFailures.length === 0,
        failures: checkFailures,
      };
    }),
  );
  const failures = checks.flatMap((check) => check.failures);
  const measuredDurations = checks
    .map((check) => check.duration_ms)
    .filter((duration) => Number.isFinite(duration))
    .sort((left, right) => left - right);
  const p95Index = Math.max(0, Math.ceil(measuredDurations.length * 0.95) - 1);
  const measuredResponses = checks
    .map((check) => check.response_bytes)
    .filter((size) => Number.isSafeInteger(size));

  return {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    origin: base.origin,
    expected_release: expectedRelease ?? null,
    passed: failures.length === 0,
    check_count: checks.length,
    performance: {
      duration_budget_ms: maxDurationMs,
      maximum_duration_ms: measuredDurations.at(-1) ?? null,
      p95_duration_ms: measuredDurations[p95Index] ?? null,
      measured_response_count: measuredResponses.length,
      maximum_response_bytes: measuredResponses.length ? Math.max(...measuredResponses) : null,
    },
    failures,
    checks,
  };
}

function parseCliArguments(argv) {
  const argumentsList = [...argv];
  let baseUrl;
  let jsonOutput;

  while (argumentsList.length) {
    const argument = argumentsList.shift();
    if (argument === "--json") {
      jsonOutput = argumentsList.shift();
      if (!jsonOutput) throw new Error("--json requires an output path");
    } else if (!baseUrl) {
      baseUrl = argument;
    } else {
      throw new Error(`Unexpected argument: ${argument}`);
    }
  }

  return { baseUrl: process.env.PRODUCTION_BASE_URL ?? baseUrl, jsonOutput };
}

async function main() {
  let options;
  try {
    options = parseCliArguments(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Invalid production smoke arguments.");
    process.exitCode = 1;
    return;
  }

  let report;
  try {
    report = await verifyProduction({
      baseUrl: options.baseUrl,
      expectedRelease: process.env.EXPECTED_RELEASE_SHA?.trim() || undefined,
      maxDurationMs: process.env.PRODUCTION_MAX_DURATION_MS
        ? Number(process.env.PRODUCTION_MAX_DURATION_MS)
        : DEFAULT_MAX_DURATION_MS,
    });
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Production smoke could not start.");
    process.exitCode = 1;
    return;
  }

  if (options.jsonOutput) {
    const target = resolve(root, options.jsonOutput);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, `${JSON.stringify(report, null, 2)}\n`);
  }

  if (!report.passed) {
    console.error(
      `Production smoke failed for ${report.origin}:\n${report.failures.map((item) => `- ${item}`).join("\n")}`,
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    `Production smoke passed ${report.check_count}/${report.check_count} checks for ${report.origin}.`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === scriptPath) await main();

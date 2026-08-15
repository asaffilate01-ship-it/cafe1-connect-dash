import assert from "node:assert/strict";
import test from "node:test";

import { pngDimensions, validateManifest, validateWorkerContract } from "./verify-pwa.mjs";

const manifest = {
  name: "Cafe",
  short_name: "Cafe",
  id: "/",
  scope: "/",
  start_url: "/",
  display: "standalone",
  orientation: "portrait",
  icons: [
    { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
    { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
  ],
};

test("accepts a complete install manifest", () => {
  assert.deepEqual(
    validateManifest(manifest, {
      file: "manifest.webmanifest",
      id: "/",
      scope: "/",
      startUrl: "/",
      orientation: "portrait",
    }),
    [],
  );
});

test("rejects unsafe service-worker coverage and cached update checks", () => {
  const failures = validateWorkerContract({
    privateRoots: ["/admin", "/checkout"],
    workerSource:
      'const PROTECTED_PREFIXES = ["/admin"]; if (request.mode === "navigate") return; if (url.origin !== self.location.origin) return;',
    registerSource: 'navigator.serviceWorker.register("/sw.js")',
  });
  assert.equal(failures.length, 2);
  assert.match(failures.join("\n"), /checkout/);
  assert.match(failures.join("\n"), /bypass HTTP caches/);
});

test("reads PNG dimensions from the IHDR header", () => {
  const bytes = Buffer.alloc(24);
  Buffer.from("89504e470d0a1a0a", "hex").copy(bytes);
  bytes.writeUInt32BE(192, 16);
  bytes.writeUInt32BE(192, 20);
  assert.deepEqual(pngDimensions(bytes), { width: 192, height: 192 });
});

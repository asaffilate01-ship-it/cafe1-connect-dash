import assert from "node:assert/strict";
import test from "node:test";

import { validateBundleEntries } from "./verify-bundle-budget.mjs";

const budgets = {
  any_javascript_gzip_bytes: 100,
  any_stylesheet_gzip_bytes: 50,
  any_image_bytes: 200,
  till_route_gzip_bytes: 30,
  kds_route_gzip_bytes: 30,
  display_route_gzip_bytes: 20,
};

test("accepts assets inside the global and route budgets", () => {
  const report = validateBundleEntries(
    [
      { name: "index-abc.js", gzip_bytes: 90 },
      { name: "till-abc.js", gzip_bytes: 30 },
      { name: "styles-abc.css", gzip_bytes: 40 },
      { name: "hero-abc.webp", raw_bytes: 190, gzip_bytes: 180 },
    ],
    budgets,
  );
  assert.equal(report.valid, true);
});

test("rejects route and global regressions", () => {
  const report = validateBundleEntries(
    [
      { name: "kds-abc.js", gzip_bytes: 31 },
      { name: "vendor-abc.js", gzip_bytes: 101 },
    ],
    budgets,
  );
  assert.equal(report.valid, false);
  assert.equal(report.failures.length, 2);
});

test("rejects oversized image payloads using their transfer size", () => {
  const report = validateBundleEntries(
    [{ name: "footer-logo.png", raw_bytes: 201, gzip_bytes: 20 }],
    budgets,
  );
  assert.equal(report.valid, false);
  assert.match(report.failures[0], /footer-logo\.png: 0\.2 KiB exceeds 0\.2 KiB/);
});

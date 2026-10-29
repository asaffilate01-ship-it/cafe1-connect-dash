import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
// Test the actual standalone TypeScript module without loading native Expo APIs.
const source = readFileSync(new URL("../readiness.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
});
const { isPrecise, allowsBackground, readinessChecks } = await import(
  "data:text/javascript;base64," + Buffer.from(outputText).toString("base64")
);
const good = {
  running: true,
  services: true,
  foreground: true,
  background: true,
  precise: true,
  configurationMatches: true,
};
test("approximate or missing permissions cannot pass precise/background checks", () => {
  assert.equal(isPrecise({ granted: true, android: { accuracy: "coarse" } }), false);
  assert.equal(isPrecise({ granted: true, ios: { accuracy: "reduced" } }), false);
  assert.equal(isPrecise({ granted: false, android: { accuracy: "fine" } }), false);
  assert.equal(isPrecise({ granted: true }), false);
  assert.equal(isPrecise({ granted: true, android: { accuracy: "fine" } }), true);
  assert.equal(isPrecise({ granted: true, ios: { accuracy: "full" } }), true);
  assert.equal(allowsBackground({ granted: true, ios: { scope: "whenInUse" } }), false);
  assert.equal(allowsBackground({ granted: true, ios: { scope: "always" } }), true);
  assert.equal(allowsBackground({ granted: false }), false);
  assert.equal(allowsBackground({ granted: true }), true);
});
test("unverified online approvals remain unknown", () => {
  assert.deepEqual(
    readinessChecks(good, null, null)
      .filter((c) => c.ok === null)
      .map((c) => c.label),
    ["Manager phone approval", "Verified workplace boundary"],
  );
  assert.ok(readinessChecks(null, null, null).every((c) => c.ok === null));
});
test("a registered service for another configuration is not ready", () => {
  const checks = readinessChecks({ ...good, configurationMatches: false }, true, true);
  assert.equal(checks.at(-1).ok, false);
  assert.equal(checks.filter((c) => c.ok === false).length, 1);
});
test("permission loss and revoked approval remain visible with a registered service", () => {
  assert.deepEqual(
    readinessChecks({ ...good, background: false, services: false }, false, true)
      .filter((c) => c.ok === false)
      .map((c) => c.label),
    ["Phone location services", "Background location permission", "Manager phone approval"],
  );
  assert.ok(readinessChecks(good, true, true).every((c) => c.ok === true));
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
const { outputText } = ts.transpileModule(
  readFileSync(new URL("../device-identity.ts", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.ESNext } },
);
const { deviceStorageKey } = await import(
  "data:text/javascript;base64," + Buffer.from(outputText).toString("base64")
);
test("device approval identity is stable and isolated across accounts and sites", () => {
  const a = "10000000-0000-4000-8000-000000000001";
  const b = "10000000-0000-4000-8000-000000000002";
  assert.equal(deviceStorageKey(a, a), deviceStorageKey(a, a));
  assert.notEqual(deviceStorageKey(a, a), deviceStorageKey(b, a));
  assert.notEqual(deviceStorageKey(a, a), deviceStorageKey(a, b));
  assert.throws(() => deviceStorageKey(a, "invalid"));
});

test("pilot scenarios are identical in fixture and full-schema suites", () => {
  const source = readFileSync(new URL("./pilot.sql", import.meta.url), "utf8");
  const full = readFileSync(
    new URL("../../supabase/tests/staff_attendance_pilot.sql", import.meta.url),
    "utf8",
  );
  assert.ok(full.includes(source));
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  REQUIRED_OPERATIONAL_GATES,
  validateOperationalAcceptance,
} from "./verify-operational-acceptance.mjs";

function template() {
  return JSON.parse(
    readFileSync(new URL("../release/operational-acceptance.json", import.meta.url), "utf8"),
  );
}

test("acceptance template has every required gate exactly once", () => {
  const record = template();
  const result = validateOperationalAcceptance(record);
  assert.equal(result.schema_valid, true);
  assert.equal(result.total, REQUIRED_OPERATIONAL_GATES.length);
  assert.equal(result.pending + result.passed + result.failed, REQUIRED_OPERATIONAL_GATES.length);
  assert.equal(result.passed, 1);
  assert.equal(record.gates.find((gate) => gate.id === "scheduler_history")?.status, "pass");
  assert.equal(result.ready, false);
});

test("strict acceptance rejects pending gates", () => {
  const result = validateOperationalAcceptance(template(), { strict: true });
  assert.equal(result.ready, false);
  assert.ok(result.errors.some((error) => error.includes("has not passed")));
});

test("strict acceptance passes complete evidence and named approvals", () => {
  const record = template();
  record.gates = record.gates.map((gate) => ({
    ...gate,
    status: "pass",
    evidence: `evidence/${gate.id}`,
    checked_by: "Release owner",
    checked_at: "2026-08-02T20:00:00.000Z",
  }));
  record.approvals = {
    go_live_decision: "approved",
    operations_owner: "Operations owner",
    technical_owner: "Technical owner",
    approved_at: "2026-08-02T21:00:00.000Z",
  };

  const result = validateOperationalAcceptance(record, { strict: true });
  assert.deepEqual(result.errors, []);
  assert.equal(result.ready, true);
});

test("rejects duplicate, missing and unsupported gates", () => {
  const record = template();
  record.gates[1].id = record.gates[0].id;
  record.gates.push({ id: "unsupported", status: "pending" });
  const result = validateOperationalAcceptance(record);
  assert.ok(result.errors.some((error) => error.includes("duplicate gate")));
  assert.ok(result.errors.some((error) => error.includes("required gate is missing")));
  assert.ok(result.errors.some((error) => error.includes("unknown gate")));
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
const { outputText } = ts.transpileModule(
  readFileSync(new URL("../sync-queue.ts", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } },
);
const { drainQueue, RETRY_WARNING } = await import(
  "data:text/javascript;base64," + Buffer.from(outputText).toString("base64")
);
function fixture(count) {
  const rows = Array.from({ length: count }, (_, id) => ({
    id: String(id),
    captured: 100,
    payload: JSON.stringify({ id }),
  }));
  const uploaded = [],
    reviewed = [];
  let paused = false;
  const io = {
    next: async () => rows.slice(0, 200),
    upload: async (p) => {
      uploaded.push(p.id);
    },
    remove: async (id) => {
      rows.splice(
        rows.findIndex((r) => r.id === id),
        1,
      );
    },
    review: async (id, reason) => {
      reviewed.push({ id, reason });
      await io.remove(id);
    },
    pause: async () => {
      paused = true;
    },
    now: () => 100,
  };
  return { io, rows, uploaded, reviewed, paused: () => paused };
}
test("drains multiple batches in order and reports complete recovery", async () => {
  const f = fixture(450);
  assert.equal(await drainQueue(f.io), null);
  assert.equal(f.rows.length, 0);
  assert.deepEqual(
    f.uploaded,
    Array.from({ length: 450 }, (_, i) => i),
  );
});
test("network failure preserves failed and later readings for ordered retry", async () => {
  const f = fixture(4);
  f.io.upload = async (p) => {
    if (p.id === 1) throw new Error("offline");
    f.uploaded.push(p.id);
  };
  assert.equal(await drainQueue(f.io), RETRY_WARNING);
  assert.deepEqual(
    f.rows.map((r) => r.id),
    ["1", "2", "3"],
  );
  assert.equal(f.paused(), false);
  f.io.upload = async (p) => {
    f.uploaded.push(p.id);
  };
  assert.equal(await drainQueue(f.io), null);
  assert.deepEqual(f.uploaded, [0, 1, 2, 3]);
});
test("revoked approval pauses and flags the rejected reading without deleting later evidence", async () => {
  const f = fixture(2);
  f.io.upload = async () => {
    throw { message: "Device approval required" };
  };
  assert.match(await drainQueue(f.io), /Attendance paused/);
  assert.equal(f.paused(), true);
  assert.equal(f.reviewed[0].id, "0");
  assert.deepEqual(
    f.rows.map((r) => r.id),
    ["1"],
  );
});
test("expired readings need correction and are never uploaded", async () => {
  const f = fixture(2);
  f.rows[0].captured = -8 * 86400000;
  assert.equal(await drainQueue(f.io), null);
  assert.deepEqual(f.uploaded, [1]);
  assert.match(f.reviewed[0].reason, /correction/);
});
test("large backlog is bounded and asks for another sync", async () => {
  const f = fixture(1001);
  assert.match(await drainQueue(f.io), /More events remain/);
  assert.equal(f.rows.length, 1);
  assert.equal(await drainQueue(f.io), null);
});

test("server review outcomes retain a coordinate-free correction indicator", async () => {
  for (const status of ["offline_review", "out_of_order_review", "shift_review"]) {
    const f = fixture(1);
    f.io.upload = async () => ({ status });
    assert.equal(await drainQueue(f.io), null);
    assert.equal(f.reviewed.length, 1);
    assert.match(f.reviewed[0].reason, new RegExp(status));
  }
});
test("account change between uploads preserves the previous owner's remaining queue", async () => {
  const f = fixture(3);
  f.io.isCurrentOwner = async () => f.uploaded.length === 0;
  assert.match(await drainQueue(f.io), /Account changed/);
  assert.deepEqual(f.uploaded, [0]);
  assert.deepEqual(
    f.rows.map((r) => r.id),
    ["1", "2"],
  );
  assert.equal(f.reviewed.length, 0);
});

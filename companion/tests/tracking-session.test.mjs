import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
const { outputText } = ts.transpileModule(
  readFileSync(new URL("../tracking.ts", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } },
);
let serial = 0;
async function fixture() {
  const store = new Map();
  const state = { owner: "a", running: false, starts: 0 };
  const Location = {
    requestForegroundPermissionsAsync: async () => ({ granted: true }),
    hasServicesEnabledAsync: async () => true,
    requestBackgroundPermissionsAsync: async () => ({ granted: true }),
    hasStartedLocationUpdatesAsync: async () => state.running,
    startLocationUpdatesAsync: async () => {
      state.running = true;
      state.starts++;
    },
    stopLocationUpdatesAsync: async () => {
      state.running = false;
    },
    Accuracy: { BestForNavigation: 1 },
    ActivityType: { OtherNavigation: 1 },
  };
  const key = "__trackingTest" + serial++;
  globalThis[key] = {
    Location,
    TaskManager: { defineTask() {} },
    SQLite: {},
    SecureStore: {
      getItemAsync: async (k) => store.get(k),
      setItemAsync: async (k, v) => store.set(k, v),
      deleteItemAsync: async (k) => store.delete(k),
    },
    backend: {
      auth: {
        getSession: async () => ({
          data: { session: state.owner ? { user: { id: state.owner } } : null },
        }),
      },
    },
    isPrecise: (p) => p.granted,
    allowsBackground: (p) => p.granted,
  };
  const code =
    `const {Location,TaskManager,SQLite,SecureStore,backend,isPrecise,allowsBackground}=globalThis.${key};\n` +
    outputText.replace(/^import .*;$/gm, "");
  const api = await import("data:text/javascript;base64," + Buffer.from(code).toString("base64"));
  delete globalThis[key];
  return { api, state, Location, store };
}
const config = { userId: "a", site_id: "site", device_id: "device", boundary_version: "version" };
test("account change during permission prompt prevents native tracking start", async () => {
  const f = await fixture();
  f.Location.requestBackgroundPermissionsAsync = async () => {
    f.state.owner = "b";
    return { granted: true };
  };
  await assert.rejects(f.api.startTracking(config), /Account changed/);
  assert.equal(f.state.starts, 0);
  assert.equal(f.store.has("cafe1-attendance-config"), false);
});
test("sign-out during native startup stops the newly registered service", async () => {
  const f = await fixture();
  f.Location.startLocationUpdatesAsync = async () => {
    f.state.running = true;
    f.state.owner = null;
  };
  await assert.rejects(f.api.startTracking(config), /Account changed/);
  assert.equal(f.state.running, false);
  assert.equal(f.store.has("cafe1-attendance-config"), false);
});
test("same account can start and explicitly stop tracking", async () => {
  const f = await fixture();
  await f.api.startTracking(config);
  assert.equal(f.state.running, true);
  await f.api.stopTracking();
  assert.equal(f.state.running, false);
  assert.equal(f.store.has("cafe1-attendance-config"), false);
});

import assert from "node:assert/strict";
import test from "node:test";

import { validateDependencyContract } from "./verify-dependency-contract.mjs";

function fixture() {
  const dependencies = { react: "19.2.0" };
  const devDependencies = { "@lovable.dev/vite-tanstack-config": "2.9.1" };
  return {
    manifest: {
      dependencies,
      devDependencies,
      overrides: { dompurify: "3.4.13", nanoid: "3.3.18" },
    },
    lockfile: {
      lockfileVersion: 3,
      packages: {
        "": { dependencies, devDependencies },
        "node_modules/dompurify": { version: "3.4.13" },
        "node_modules/nanoid": { version: "3.3.18" },
        "node_modules/@lovable.dev/vite-tanstack-config": { version: "2.9.1" },
      },
    },
  };
}

test("accepts a synchronised lock and security resolutions", () => {
  const { manifest, lockfile } = fixture();
  assert.equal(validateDependencyContract(manifest, lockfile).valid, true);
});

test("rejects a stale root lock entry", () => {
  const { manifest, lockfile } = fixture();
  lockfile.packages[""].dependencies = { react: "18.0.0" };
  const report = validateDependencyContract(manifest, lockfile);
  assert.equal(report.valid, false);
  assert.match(report.failures[0], /out of sync/);
});

test("rejects a vulnerable transitive resolution", () => {
  const { manifest, lockfile } = fixture();
  lockfile.packages["node_modules/nanoid"].version = "3.3.16";
  const report = validateDependencyContract(manifest, lockfile);
  assert.equal(report.valid, false);
  assert.match(report.failures.join("\n"), /nanoid lock resolution/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { validateBundleEntries } from './verify-bundle-budget.mjs';
test('optional renderer budget is bounded and does not relax ordinary JavaScript', () => {
  const entry = name => ({name, gzip_bytes: 185*1024, raw_bytes: 700*1024});
  assert.equal(validateBundleEntries([entry('assets/three.module-hash.js')]).valid, true);
  assert.equal(validateBundleEntries([entry('assets/index-hash.js')]).valid, false);
  assert.equal(validateBundleEntries([{...entry('assets/three.module-hash.js'), gzip_bytes:191*1024}]).valid, false);
});

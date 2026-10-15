import assert from "node:assert/strict";
import test from "node:test";
import { assessAdyenForPlatformsCutover, ADYEN_STALBANS_EVIDENCE } from "./adyen-platforms-preflight.mjs";

const identity = {
  schemaVersion: 1,
  provider: "adyen_for_platforms",
  businessKey: "cafe1stalbans",
  landlord: "dishbee",
  product: "dishbee-one",
};
function claims() {
  const all = [...ADYEN_STALBANS_EVIDENCE.common,
    ...ADYEN_STALBANS_EVIDENCE.online,
    ...ADYEN_STALBANS_EVIDENCE.counter];
  return Object.fromEntries(all.map((key) => [key, {
    passed: true,
    evidence: "approved-staging-test-ticket-0001",
  }]));
}

test("never authorises a live Adyen switch even if every evidence field is claimed", () => {
  const x = assessAdyenForPlatformsCutover({ ...identity, checks: claims() });
  assert.equal(x.evidenceCoverageComplete, true);
  assert.equal(x.checked, x.total);
  assert.equal(x.liveSwitchAuthorised, false);
  assert.equal(x.productionProviderConfigured, false);
  assert.equal(x.currentProvider, "sumup");
});

test("merchant accounts cannot be silently shared with MealDeck or Luton", () => {
  for (const businessKey of ["mealdeck", "cafe1luton", "cafe-1-st-albans"]) {
    const x = assessAdyenForPlatformsCutover({ ...identity, businessKey, checks: claims() });
    assert.equal(x.evidenceCoverageComplete, false);
    assert.deepEqual(x.missing, ["wrongOrMissingTenantProviderIdentity"]);
  }
});

test("payment channels require independent online and physical-terminal evidence", () => {
  const checks=claims();
  delete checks.adyenCompatibleTerminalsProvisioned;
  const both = assessAdyenForPlatformsCutover({ ...identity, checks });
  const web = assessAdyenForPlatformsCutover({ ...identity, checks }, ["online"]);
  assert.equal(both.evidenceCoverageComplete, false);
  assert.ok(both.missing.includes("adyenCompatibleTerminalsProvisioned"));
  assert.equal(web.evidenceCoverageComplete, true);
  assert.equal(web.liveSwitchAuthorised, false);
  const bad=assessAdyenForPlatformsCutover({ ...identity, checks }, ["unsupported-channel"]);
  assert.ok(bad.missing.includes("invalidOrMissingPaymentChannels"));
});

test("missing evidence and sensitive reference strings fail closed", () => {
  for (const evidence of ["", "abc", "token=private", "https://example.com/run?api_key=123", "http://example.com/run"]) {
    const checks = claims();
    checks.signedWebhooksAndReplayTested = { passed: true, evidence };
    const status = assessAdyenForPlatformsCutover({ ...identity, checks });
    assert.equal(status.evidenceCoverageComplete, false);
    assert.ok(status.missing.includes("signedWebhooksAndReplayTested"));
  }
  assert.ok(assessAdyenForPlatformsCutover(null).missing.includes("wrongOrMissingTenantProviderIdentity"));
});

test("public report never includes bank/merchant IDs or checked evidence references", () => {
  const x=assessAdyenForPlatformsCutover({
    ...identity,
    merchantId:"sensitive-merchant-123",
    checks:claims(),
  });
  const output=JSON.stringify(x);
  assert.equal(output.includes("sensitive-merchant-123"), false);
  assert.equal(output.includes("approved-staging-test-ticket"), false);
});

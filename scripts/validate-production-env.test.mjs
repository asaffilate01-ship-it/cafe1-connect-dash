import assert from "node:assert/strict";
import test from "node:test";

import { validateProductionEnvironment } from "./validate-production-env.mjs";

function validEnvironment(overrides = {}) {
  return {
    VITE_SUPABASE_URL: "https://cafe1.supabase.co",
    VITE_SUPABASE_PUBLISHABLE_KEY: "publishable-key",
    SUPABASE_URL: "https://cafe1.supabase.co",
    SUPABASE_PUBLISHABLE_KEY: "publishable-key",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
    PUBLIC_APP_URL: "https://cafe1stalbans.co.uk",
    PUBLIC_RELEASE_SHA: "3e0b4f1e1c51a1b9437faa8a2eb0e7ee5c7c55c6",
    SUMUP_API_KEY: "live-sumup-key",
    SUMUP_MERCHANT_CODE: "merchant-code",
    SUMUP_AFFILIATE_KEY: "affiliate-key",
    GOOGLE_PAY_MERCHANT_ID: "123456789012345678",
    CRON_SECRET: "0123456789abcdefghijklmnopqrstuvwxyz",
    REQUIRE_ADMIN_MFA: "true",
    ENABLE_DEV_LOGIN: "false",
    LOVABLE_API_KEY: "email-key",
    RESEND_API_KEY: "resend-key",
    GOOGLE_MAPS_API_KEY: "maps-key",
    ...overrides,
  };
}

test("accepts a complete canonical production environment", () => {
  assert.deepEqual(validateProductionEnvironment(validEnvironment()), {
    errors: [],
    warnings: [],
  });
});

test("rejects test payments, disabled MFA and production dev access", () => {
  const result = validateProductionEnvironment(
    validEnvironment({
      SUMUP_API_KEY: `sk_${"test"}_key`,
      REQUIRE_ADMIN_MFA: "false",
      ENABLE_DEV_LOGIN: "true",
      DEV_ADMIN_PASSWORD: "should-not-be-in-production",
    }),
  );

  assert.ok(result.errors.some((message) => message.includes("test key")));
  assert.ok(result.errors.some((message) => message.includes("MFA")));
  assert.ok(result.errors.some((message) => message.includes("ENABLE_DEV_LOGIN")));
  assert.ok(result.errors.some((message) => message.includes("DEV_ADMIN_PASSWORD")));
});

test("rejects inconsistent projects and partial integrations", () => {
  const result = validateProductionEnvironment(
    validEnvironment({
      VITE_SUPABASE_URL: "https://different.supabase.co",
      DELIVEROO_CLIENT_ID: "client-id",
    }),
  );

  assert.ok(result.errors.some((message) => message.includes("same project")));
  assert.ok(result.errors.some((message) => message.includes("partially configured")));
});

test("requires the server-side email and delivery integrations used by production", () => {
  const result = validateProductionEnvironment(
    validEnvironment({
      LOVABLE_API_KEY: "",
      RESEND_API_KEY: "",
      GOOGLE_MAPS_API_KEY: "",
      VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY: "public-browser-key",
    }),
  );

  assert.ok(result.errors.some((message) => message.includes("LOVABLE_API_KEY")));
  assert.ok(result.errors.some((message) => message.includes("RESEND_API_KEY")));
  assert.ok(result.errors.some((message) => message.includes("GOOGLE_MAPS_API_KEY")));
});

test("requires an exact deployed release commit", () => {
  const result = validateProductionEnvironment(validEnvironment({ PUBLIC_RELEASE_SHA: "main" }));

  assert.ok(result.errors.some((message) => message.includes("40-character deployed Git commit")));
});

test("rejects a valid-looking release SHA that does not match the release candidate", () => {
  const expectedRelease = "a".repeat(40);
  const result = validateProductionEnvironment(validEnvironment(), { expectedRelease });

  assert.ok(result.errors.some((message) => message.includes(expectedRelease)));
  assert.deepEqual(
    validateProductionEnvironment(
      validEnvironment({ PUBLIC_RELEASE_SHA: expectedRelease }),
      { expectedRelease },
    ).errors,
    [],
  );
});

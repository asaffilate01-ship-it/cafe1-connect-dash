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
    GOOGLE_PLACE_ID: "ChIJcafe1StAlbans12345",
    VITE_GA_MEASUREMENT_ID: "G-ABC12345",
    VITE_SOCIAL_EMBEDS_JSON: "[]",
    YOUTUBE_API_KEY: "youtube-production-key-1234567890",
    YOUTUBE_CHANNEL_HANDLE: "@Cafe1_Stalbans",
    INSTAGRAM_ACCESS_TOKEN: "instagram-production-token-1234567890",
    INSTAGRAM_GRAPH_VERSION: "v23.0",
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
      GOOGLE_PLACE_ID: "",
      VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY: "public-browser-key",
    }),
  );

  assert.ok(result.errors.some((message) => message.includes("LOVABLE_API_KEY")));
  assert.ok(result.errors.some((message) => message.includes("RESEND_API_KEY")));
  assert.ok(result.errors.some((message) => message.includes("GOOGLE_MAPS_API_KEY")));
  assert.ok(result.errors.some((message) => message.includes("GOOGLE_PLACE_ID")));
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
    validateProductionEnvironment(validEnvironment({ PUBLIC_RELEASE_SHA: expectedRelease }), {
      expectedRelease,
    }).errors,
    [],
  );
});

test("rejects incomplete or malformed automatic social configurations", () => {
  const partialYouTube = validateProductionEnvironment(
    validEnvironment({
      YOUTUBE_CHANNEL_HANDLE: "",
      YOUTUBE_CHANNEL_ID: "bad-channel",
    }),
  );
  assert.ok(partialYouTube.errors.some((message) => message.includes("CHANNEL_ID")));

  const missingYouTubeKey = validateProductionEnvironment(
    validEnvironment({
      YOUTUBE_API_KEY: "",
      YOUTUBE_CHANNEL_HANDLE: "@Cafe1_Stalbans",
    }),
  );
  assert.ok(missingYouTubeKey.errors.some((message) => message.includes("YOUTUBE_API_KEY")));

  const publicChannelFeed = validateProductionEnvironment(
    validEnvironment({
      YOUTUBE_API_KEY: "",
      YOUTUBE_CHANNEL_HANDLE: "",
      YOUTUBE_CHANNEL_ID: "UC1234567890123456789012",
    }),
  );
  assert.equal(
    publicChannelFeed.errors.some((message) => message.includes("YOUTUBE_API_KEY")),
    false,
  );

  const badInstagram = validateProductionEnvironment(
    validEnvironment({ INSTAGRAM_GRAPH_VERSION: "latest" }),
  );
  assert.ok(badInstagram.errors.some((message) => message.includes("vNN.N")));
});

test("validates official and fallback Deliveroo ingestion modes", () => {
  const official = validateProductionEnvironment(
    validEnvironment({
      DELIVEROO_INGEST_MODE: "orders_api",
      DELIVEROO_SITE_MODE: "tablet",
      DELIVEROO_API_ENV: "production",
      DELIVEROO_CLIENT_ID: "client-id",
      DELIVEROO_CLIENT_SECRET: "client-secret",
      DELIVEROO_WEBHOOK_SECRET: "w".repeat(32),
    }),
  );
  assert.deepEqual(official.errors, []);

  const fallback = validateProductionEnvironment(
    validEnvironment({ DELIVEROO_INGEST_MODE: "hub_watcher", DELIVEROO_BRIDGE_SECRET: "short" }),
  );
  assert.ok(fallback.errors.some((message) => message.includes("DELIVEROO_BRIDGE_SECRET")));
});

test("requires an explicit, strong secret for every enabled Just Eat ingest mode", () => {
  const watcher = validateProductionEnvironment(
    validEnvironment({
      JUSTEAT_INGEST_MODE: "hub_watcher",
      JUSTEAT_BRIDGE_SECRET: "j".repeat(64),
    }),
  );
  assert.deepEqual(watcher.errors, []);

  const missingSecret = validateProductionEnvironment(
    validEnvironment({ JUSTEAT_INGEST_MODE: "webhook" }),
  );
  assert.ok(missingSecret.errors.some((message) => message.includes("JUSTEAT_BRIDGE_SECRET")));

  const invalidMode = validateProductionEnvironment(
    validEnvironment({ JUSTEAT_INGEST_MODE: "orders_api" }),
  );
  assert.ok(invalidMode.errors.some((message) => message.includes("JUSTEAT_INGEST_MODE")));

  const disabledWithSecret = validateProductionEnvironment(
    validEnvironment({ JUSTEAT_BRIDGE_SECRET: "j".repeat(64) }),
  );
  assert.ok(disabledWithSecret.warnings.some((message) => message.includes("disabled")));
});

test("rejects malformed optional analytics configuration", () => {
  const result = validateProductionEnvironment(
    validEnvironment({ VITE_GA_MEASUREMENT_ID: "UA-legacy-id" }),
  );
  assert.ok(result.errors.some((message) => message.includes("VITE_GA_MEASUREMENT_ID")));
});

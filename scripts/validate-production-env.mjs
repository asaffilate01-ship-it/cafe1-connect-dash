import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const CANONICAL_ORIGIN = "https://cafe1stalbans.co.uk";
const PLACEHOLDER = /(?:replace(?:[_ -]?me)?|your[_ -]?project|example|changeme|placeholder)/i;

function value(env, name) {
  return String(env[name] ?? "").trim();
}

function validHttpsOrigin(raw) {
  try {
    const url = new URL(raw);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      (url.pathname === "/" || url.pathname === "")
    );
  } catch {
    return false;
  }
}

export function validateProductionEnvironment(env, { expectedRelease } = {}) {
  const errors = [];
  const warnings = [];
  const required = [
    "VITE_SUPABASE_URL",
    "VITE_SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_URL",
    "SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "PUBLIC_APP_URL",
    "PUBLIC_RELEASE_SHA",
    "SUMUP_API_KEY",
    "SUMUP_MERCHANT_CODE",
    "GOOGLE_PAY_MERCHANT_ID",
    "CRON_SECRET",
    "REQUIRE_ADMIN_MFA",
    "LOVABLE_API_KEY",
    "RESEND_API_KEY",
    "GOOGLE_MAPS_API_KEY",
    "GOOGLE_PLACE_ID",
  ];

  for (const name of required) {
    const configured = value(env, name);
    if (!configured) errors.push(`${name} is required`);
    else if (PLACEHOLDER.test(configured)) errors.push(`${name} still contains a placeholder`);
  }

  for (const name of ["VITE_SUPABASE_URL", "SUPABASE_URL", "PUBLIC_APP_URL"]) {
    const configured = value(env, name);
    if (configured && !validHttpsOrigin(configured)) {
      errors.push(`${name} must be a credential-free HTTPS origin with no path, query or fragment`);
    }
  }

  if (value(env, "PUBLIC_APP_URL").replace(/\/$/, "") !== CANONICAL_ORIGIN) {
    errors.push(`PUBLIC_APP_URL must be the canonical origin ${CANONICAL_ORIGIN}`);
  }
  if (!/^[0-9a-f]{40}$/i.test(value(env, "PUBLIC_RELEASE_SHA"))) {
    errors.push("PUBLIC_RELEASE_SHA must be the exact 40-character deployed Git commit");
  }
  if (expectedRelease) {
    if (!/^[0-9a-f]{40}$/i.test(expectedRelease)) {
      errors.push("Expected release must be a 40-character Git commit");
    } else if (value(env, "PUBLIC_RELEASE_SHA").toLowerCase() !== expectedRelease.toLowerCase()) {
      errors.push(`PUBLIC_RELEASE_SHA must match the release being validated (${expectedRelease})`);
    }
  }
  if (
    value(env, "VITE_SUPABASE_URL").replace(/\/$/, "") !==
    value(env, "SUPABASE_URL").replace(/\/$/, "")
  ) {
    errors.push("VITE_SUPABASE_URL and SUPABASE_URL must identify the same project");
  }
  if (value(env, "VITE_SUPABASE_PUBLISHABLE_KEY") !== value(env, "SUPABASE_PUBLISHABLE_KEY")) {
    errors.push("VITE_SUPABASE_PUBLISHABLE_KEY and SUPABASE_PUBLISHABLE_KEY must match");
  }
  if (
    value(env, "SUPABASE_SERVICE_ROLE_KEY") &&
    value(env, "SUPABASE_SERVICE_ROLE_KEY") === value(env, "SUPABASE_PUBLISHABLE_KEY")
  ) {
    errors.push("SUPABASE_SERVICE_ROLE_KEY must not equal the publishable key");
  }
  if (value(env, "CRON_SECRET").length < 32) {
    errors.push("CRON_SECRET must contain at least 32 characters");
  }
  if (value(env, "SUMUP_API_KEY").startsWith("sk_test_")) {
    errors.push("SUMUP_API_KEY is a test key; production requires a live SumUp credential");
  }
  if (value(env, "REQUIRE_ADMIN_MFA") !== "true") {
    errors.push("REQUIRE_ADMIN_MFA must be true for production");
  }
  if (
    value(env, "GOOGLE_PLACE_ID") &&
    !/^[A-Za-z0-9_-]{10,255}$/.test(value(env, "GOOGLE_PLACE_ID"))
  ) {
    errors.push("GOOGLE_PLACE_ID is not a valid Google Place ID");
  }
  if (value(env, "ENABLE_DEV_LOGIN") === "true") {
    errors.push("ENABLE_DEV_LOGIN must not be true in production");
  }

  for (const name of [
    "DEV_ADMIN_EMAIL",
    "DEV_ADMIN_PASSWORD",
    "DEV_STAFF_EMAIL",
    "DEV_STAFF_PASSWORD",
    "DEV_DRIVER_EMAIL",
    "DEV_DRIVER_PASSWORD",
    "DEV_CUSTOMER_EMAIL",
    "DEV_CUSTOMER_PASSWORD",
  ]) {
    if (value(env, name)) errors.push(`${name} must be absent from the production environment`);
  }

  const deliveroo = ["DELIVEROO_CLIENT_ID", "DELIVEROO_CLIENT_SECRET", "DELIVEROO_WEBHOOK_SECRET"];
  const configuredDeliveroo = deliveroo.filter((name) => value(env, name));
  if (configuredDeliveroo.length > 0 && configuredDeliveroo.length !== deliveroo.length) {
    errors.push(
      "Deliveroo is partially configured; set all three Deliveroo variables or none of them",
    );
  }
  const deliverooMode =
    value(env, "DELIVEROO_INGEST_MODE") ||
    (configuredDeliveroo.length === deliveroo.length ? "orders_api" : "disabled");
  if (!["disabled", "orders_api", "hub_watcher", "dual"].includes(deliverooMode)) {
    errors.push("DELIVEROO_INGEST_MODE must be disabled, orders_api, hub_watcher or dual");
  }
  if (["orders_api", "dual"].includes(deliverooMode)) {
    for (const name of deliveroo) {
      if (!value(env, name)) errors.push(`${name} is required for ${deliverooMode} mode`);
    }
    if (!/^(?:tablet|tabletless)$/.test(value(env, "DELIVEROO_SITE_MODE"))) {
      errors.push("DELIVEROO_SITE_MODE must be tablet or tabletless for Orders API mode");
    }
  }
  if (
    value(env, "DELIVEROO_API_ENV") &&
    !/^(?:production|sandbox)$/.test(value(env, "DELIVEROO_API_ENV"))
  ) {
    errors.push("DELIVEROO_API_ENV must be production or sandbox");
  }
  if (
    value(env, "DELIVEROO_WEBHOOK_SECRET") &&
    value(env, "DELIVEROO_WEBHOOK_SECRET").length < 32
  ) {
    errors.push("DELIVEROO_WEBHOOK_SECRET must contain at least 32 characters");
  }
  if (["hub_watcher", "dual"].includes(deliverooMode)) {
    if (value(env, "DELIVEROO_BRIDGE_SECRET").length < 32) {
      errors.push(
        `DELIVEROO_BRIDGE_SECRET must contain at least 32 characters for ${deliverooMode} mode`,
      );
    }
  } else if (
    value(env, "DELIVEROO_BRIDGE_SECRET") &&
    value(env, "DELIVEROO_BRIDGE_SECRET").length < 32
  ) {
    errors.push("DELIVEROO_BRIDGE_SECRET must contain at least 32 characters when configured");
  }
  if (deliverooMode === "disabled" && configuredDeliveroo.length === deliveroo.length) {
    warnings.push("Deliveroo credentials are present but DELIVEROO_INGEST_MODE is disabled");
  }

  const justEatMode = value(env, "JUSTEAT_INGEST_MODE") || "disabled";
  if (!["disabled", "hub_watcher", "webhook", "dual"].includes(justEatMode)) {
    errors.push("JUSTEAT_INGEST_MODE must be disabled, hub_watcher, webhook or dual");
  }
  if (["hub_watcher", "webhook", "dual"].includes(justEatMode)) {
    if (value(env, "JUSTEAT_BRIDGE_SECRET").length < 32) {
      errors.push(
        `JUSTEAT_BRIDGE_SECRET must contain at least 32 characters for ${justEatMode} mode`,
      );
    }
  } else if (
    value(env, "JUSTEAT_BRIDGE_SECRET") &&
    value(env, "JUSTEAT_BRIDGE_SECRET").length < 32
  ) {
    errors.push("JUSTEAT_BRIDGE_SECRET must contain at least 32 characters when configured");
  }
  if (justEatMode === "disabled" && value(env, "JUSTEAT_BRIDGE_SECRET")) {
    warnings.push("JUSTEAT_BRIDGE_SECRET is present but JUSTEAT_INGEST_MODE is disabled");
  }

  if (!value(env, "SUMUP_AFFILIATE_KEY")) {
    warnings.push(
      "SUMUP_AFFILIATE_KEY is absent; confirm it is not required for the connected readers",
    );
  }

  const analyticsMeasurement = value(env, "VITE_GA_MEASUREMENT_ID");
  if (analyticsMeasurement && !/^G-[A-Z0-9]{6,20}$/i.test(analyticsMeasurement)) {
    errors.push("VITE_GA_MEASUREMENT_ID must be a valid GA4 G-XXXXXXXX measurement ID");
  }
  if (!analyticsMeasurement) {
    warnings.push("Optional analytics is disabled; the consent panel will show it as unavailable");
  }

  const youtubeKey = value(env, "YOUTUBE_API_KEY");
  const youtubeChannelId = value(env, "YOUTUBE_CHANNEL_ID");
  const youtubeSources = [
    "YOUTUBE_UPLOADS_PLAYLIST_ID",
    "YOUTUBE_CHANNEL_ID",
    "YOUTUBE_CHANNEL_HANDLE",
  ].filter((name) => value(env, name));
  if (youtubeKey && youtubeSources.length !== 1) {
    errors.push("YouTube automatic feeds require exactly one channel, handle or uploads playlist");
  }
  if (
    !youtubeKey &&
    youtubeSources.length > 0 &&
    !(youtubeSources.length === 1 && Boolean(youtubeChannelId))
  ) {
    errors.push("YOUTUBE_API_KEY is required for a YouTube handle or uploads playlist");
  }
  if (youtubeKey && (youtubeKey.length < 20 || PLACEHOLDER.test(youtubeKey))) {
    errors.push("YOUTUBE_API_KEY is not a valid production credential");
  }
  if (
    value(env, "YOUTUBE_UPLOADS_PLAYLIST_ID") &&
    !/^[A-Za-z0-9_-]{10,80}$/.test(value(env, "YOUTUBE_UPLOADS_PLAYLIST_ID"))
  ) {
    errors.push("YOUTUBE_UPLOADS_PLAYLIST_ID is malformed");
  }
  if (
    youtubeChannelId &&
    !/^UC[A-Za-z0-9_-]{20,30}$/.test(youtubeChannelId)
  ) {
    errors.push("YOUTUBE_CHANNEL_ID is malformed");
  }
  if (
    value(env, "YOUTUBE_CHANNEL_HANDLE") &&
    !/^@?[A-Za-z0-9._-]{3,40}$/.test(value(env, "YOUTUBE_CHANNEL_HANDLE"))
  ) {
    errors.push("YOUTUBE_CHANNEL_HANDLE is malformed");
  }

  const instagramToken = value(env, "INSTAGRAM_ACCESS_TOKEN");
  if (instagramToken && (instagramToken.length < 20 || PLACEHOLDER.test(instagramToken))) {
    errors.push("INSTAGRAM_ACCESS_TOKEN is not a valid production credential");
  }
  if (
    value(env, "INSTAGRAM_GRAPH_VERSION") &&
    !/^v\d{1,3}\.\d{1,2}$/.test(value(env, "INSTAGRAM_GRAPH_VERSION"))
  ) {
    errors.push("INSTAGRAM_GRAPH_VERSION must use the vNN.N format");
  }

  if (!youtubeKey && !youtubeChannelId) {
    warnings.push("YouTube automatic social updates are not configured");
  }
  if (!instagramToken) warnings.push("Instagram automatic social updates are not configured");
  if (
    (!value(env, "VITE_SOCIAL_EMBEDS_JSON") || value(env, "VITE_SOCIAL_EMBEDS_JSON") === "[]") &&
    !youtubeKey &&
    !youtubeChannelId &&
    !instagramToken
  ) {
    warnings.push("No automatic or manually curated social posts are configured");
  }

  return { errors: [...new Set(errors)], warnings: [...new Set(warnings)] };
}

function run() {
  let repositoryRelease;
  try {
    repositoryRelease = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: resolve(dirname(fileURLToPath(import.meta.url)), ".."),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    // Production images may not contain .git; EXPECTED_RELEASE_SHA remains the
    // explicit comparison mechanism in that environment.
  }
  const expectedRelease = value(process.env, "EXPECTED_RELEASE_SHA") || repositoryRelease;
  const result = validateProductionEnvironment(process.env, { expectedRelease });
  for (const warning of result.warnings) console.warn(`Warning: ${warning}`);
  if (result.errors.length) {
    console.error(
      "Production environment validation failed:\n" +
        result.errors.map((message) => `- ${message}`).join("\n"),
    );
    process.exitCode = 1;
    return;
  }
  console.log(
    `Production environment is valid for ${CANONICAL_ORIGIN} (${result.warnings.length} warning(s)).`,
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  run();
}

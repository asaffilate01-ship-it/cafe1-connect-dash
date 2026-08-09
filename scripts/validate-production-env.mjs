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
      errors.push(
        `PUBLIC_RELEASE_SHA must match the release being validated (${expectedRelease})`,
      );
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
  if (!value(env, "SUMUP_AFFILIATE_KEY")) {
    warnings.push(
      "SUMUP_AFFILIATE_KEY is absent; confirm it is not required for the connected readers",
    );
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

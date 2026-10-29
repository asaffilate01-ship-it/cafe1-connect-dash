import { gzipSync } from "node:zlib";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const KIB = 1024;

export const BUNDLE_BUDGETS = {
  any_javascript_gzip_bytes: 180 * KIB,
  any_stylesheet_gzip_bytes: 40 * KIB,
  any_image_bytes: 200 * KIB,
  till_route_gzip_bytes: 35 * KIB,
  kds_route_gzip_bytes: 35 * KIB,
  display_route_gzip_bytes: 15 * KIB,
};

export function validateBundleEntries(entries, budgets = BUNDLE_BUDGETS) {
  const failures = [];
  const checked = [];
  for (const entry of entries) {
    let limit = null;
    let measuredBytes = entry.gzip_bytes;
    if (entry.name.endsWith(".js")) limit = budgets.any_javascript_gzip_bytes;
    if (entry.name.endsWith(".css")) limit = budgets.any_stylesheet_gzip_bytes;
    if (/\.(?:avif|gif|jpe?g|png|svg|webp)$/i.test(entry.name)) {
      limit = budgets.any_image_bytes;
      measuredBytes = entry.raw_bytes;
    }
    if (/(?:^|\/)till-.*\.js$/.test(entry.name))
      limit = Math.min(limit, budgets.till_route_gzip_bytes);
    if (/(?:^|\/)kds-.*\.js$/.test(entry.name))
      limit = Math.min(limit, budgets.kds_route_gzip_bytes);
    if (/(?:^|\/)display-.*\.js$/.test(entry.name))
      limit = Math.min(limit, budgets.display_route_gzip_bytes);
    if (limit === null) continue;
    checked.push({ ...entry, limit_bytes: limit });
    if (measuredBytes > limit) {
      failures.push(
        `${entry.name}: ${(measuredBytes / KIB).toFixed(1)} KiB${entry.name.endsWith(".js") || entry.name.endsWith(".css") ? " gzip" : ""} exceeds ${(limit / KIB).toFixed(1)} KiB`,
      );
    }
  }
  return {
    schema_version: 1,
    valid: failures.length === 0,
    asset_count: checked.length,
    largest_assets: [...checked]
      .sort((left, right) => right.gzip_bytes - left.gzip_bytes)
      .slice(0, 10),
    budgets,
    failures,
  };
}

export function verifyBundleBudget(repositoryRoot = root) {
  // Nitro writes assets to .output/public on classic builds and to dist/client
  // on the Vite/Nitro layout used by the current release build.
  const candidates = [
    resolve(repositoryRoot, ".output/public"),
    resolve(repositoryRoot, "dist/client"),
  ];
  const directory = candidates.find((candidate) => existsSync(candidate));
  if (!directory) {
    throw new Error(`none of ${candidates.join(", ")} exist`);
  }
  const entries = readdirSync(directory, { recursive: true })
    .filter((name) => /\.(?:avif|css|gif|jpe?g|js|png|svg|webp)$/i.test(name))
    .map((name) => {
      const content = readFileSync(resolve(directory, name));
      return { name, raw_bytes: content.byteLength, gzip_bytes: gzipSync(content).byteLength };
    });
  return validateBundleEntries(entries);
}

function runCli() {
  let report;
  try {
    report = verifyBundleBudget(root);
  } catch (error) {
    console.error("Bundle budget verification failed: run npm run build first.");
    if (process.env.CI !== "true") console.error(error);
    process.exitCode = 1;
    return;
  }
  const outputIndex = process.argv.indexOf("--output");
  if (outputIndex >= 0) {
    const output = process.argv[outputIndex + 1];
    if (!output) throw new Error("--output requires a file path");
    const target = resolve(root, output);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, `${JSON.stringify(report, null, 2)}\n`);
  }
  if (!report.valid) {
    console.error(`Bundle budget failed:\n${report.failures.map((item) => `- ${item}`).join("\n")}`);
    process.exitCode = 1;
    return;
  }
  const largest = report.largest_assets[0];
  console.log(
    `Bundle budget passed for ${report.asset_count} assets; largest is ${largest.name} at ${(largest.gzip_bytes / KIB).toFixed(1)} KiB gzip.`,
  );
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) runCli();

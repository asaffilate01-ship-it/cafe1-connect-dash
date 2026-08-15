import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function stringArray(source, marker) {
  const escaped = marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = source.match(new RegExp(`${escaped}\\s*=\\s*\\[([\\s\\S]*?)\\]`));
  if (!match) return [];
  return [...match[1].matchAll(/["']([^"']+)["']/g)].map((item) => item[1]);
}

export function pngDimensions(buffer) {
  if (buffer.length < 24 || buffer.toString("hex", 0, 8) !== "89504e470d0a1a0a") return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

export function validateManifest(manifest, expected) {
  const failures = [];
  if (!manifest?.name || !manifest?.short_name) failures.push(`${expected.file}: name is missing`);
  if (manifest?.id !== expected.id) failures.push(`${expected.file}: id must be ${expected.id}`);
  if (manifest?.scope !== expected.scope) {
    failures.push(`${expected.file}: scope must be ${expected.scope}`);
  }
  if (manifest?.start_url !== expected.startUrl) {
    failures.push(`${expected.file}: start_url must be ${expected.startUrl}`);
  }
  if (manifest?.display !== "standalone") {
    failures.push(`${expected.file}: display must be standalone`);
  }
  if (manifest?.orientation !== expected.orientation) {
    failures.push(`${expected.file}: orientation must be ${expected.orientation}`);
  }
  const icons = Array.isArray(manifest?.icons) ? manifest.icons : [];
  for (const size of ["192x192", "512x512"]) {
    if (!icons.some((icon) => icon?.sizes === size && icon?.type === "image/png")) {
      failures.push(`${expected.file}: ${size} PNG icon is missing`);
    }
  }
  if (!icons.some((icon) => /(?:^|\s)maskable(?:\s|$)/.test(icon?.purpose ?? ""))) {
    failures.push(`${expected.file}: maskable icon is missing`);
  }
  return failures;
}

export function validateWorkerContract({ privateRoots, workerSource, registerSource }) {
  const failures = [];
  const protectedPrefixes = stringArray(workerSource, "const PROTECTED_PREFIXES");
  for (const route of privateRoots) {
    if (!protectedPrefixes.some((prefix) => route.startsWith(prefix) || prefix.startsWith(route))) {
      failures.push(`service worker does not exclude protected route ${route}`);
    }
  }
  if (!/request\.mode\s*===\s*["']navigate["']/.test(workerSource)) {
    failures.push("service worker must not cache navigations");
  }
  if (!/url\.origin\s*!==\s*self\.location\.origin/.test(workerSource)) {
    failures.push("service worker must reject cross-origin requests");
  }
  if (!/updateViaCache:\s*["']none["']/.test(registerSource)) {
    failures.push("service worker registration must bypass HTTP caches when checking for updates");
  }
  return failures;
}

export function verifyPwa(repositoryRoot = root) {
  const publicDir = resolve(repositoryRoot, "public");
  const manifestSpecs = [
    {
      file: "manifest.webmanifest",
      id: "/",
      scope: "/",
      startUrl: "/",
      orientation: "portrait",
    },
    {
      file: "kds.webmanifest",
      id: "/kds",
      scope: "/kds",
      startUrl: "/kds?source=pwa",
      orientation: "landscape",
    },
  ];
  const failures = [];
  const manifests = manifestSpecs.map((spec) => {
    const manifest = JSON.parse(readFileSync(resolve(publicDir, spec.file), "utf8"));
    failures.push(...validateManifest(manifest, spec));
    return manifest;
  });

  const declaredIcons = new Map();
  for (const manifest of manifests) {
    for (const icon of manifest.icons ?? []) {
      if (icon?.src?.startsWith("/") && /^\d+x\d+$/.test(icon?.sizes ?? "")) {
        declaredIcons.set(icon.src, icon.sizes);
      }
    }
  }
  for (const [src, declared] of declaredIcons) {
    const dimensions = pngDimensions(readFileSync(resolve(publicDir, src.slice(1))));
    const actual = dimensions ? `${dimensions.width}x${dimensions.height}` : "invalid";
    if (actual !== declared) failures.push(`${src}: declared ${declared}, actual ${actual}`);
  }

  const privateCacheSource = readFileSync(
    resolve(repositoryRoot, "src/lib/private-cache.ts"),
    "utf8",
  );
  failures.push(
    ...validateWorkerContract({
      privateRoots: stringArray(privateCacheSource, "export const PRIVATE_ROUTE_ROOTS"),
      workerSource: readFileSync(resolve(publicDir, "sw.js"), "utf8"),
      registerSource: readFileSync(resolve(repositoryRoot, "src/lib/register-sw.ts"), "utf8"),
    }),
  );

  return { valid: failures.length === 0, manifest_count: manifests.length, failures };
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  const report = verifyPwa(root);
  if (!report.valid) {
    console.error(
      `PWA verification failed:\n${report.failures.map((item) => `- ${item}`).join("\n")}`,
    );
    process.exitCode = 1;
  } else {
    console.log(
      `PWA verification passed for ${report.manifest_count} manifests and protected service-worker caching.`,
    );
  }
}

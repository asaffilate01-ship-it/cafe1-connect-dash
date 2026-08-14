import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SECURITY_OVERRIDES = {
  dompurify: "3.4.13",
  nanoid: "3.3.18",
};

function stable(value) {
  return JSON.stringify(
    Object.fromEntries(Object.entries(value ?? {}).sort(([left], [right]) => left.localeCompare(right))),
  );
}

export function validateDependencyContract(manifest, lockfile) {
  const failures = [];
  const lockedRoot = lockfile?.packages?.[""];
  if (lockfile?.lockfileVersion !== 3) failures.push("package-lock.json must use lockfileVersion 3");
  if (!lockedRoot) failures.push("package-lock.json is missing its root package entry");

  for (const group of ["dependencies", "devDependencies", "optionalDependencies"]) {
    if (stable(manifest?.[group]) !== stable(lockedRoot?.[group])) {
      failures.push(`${group} in package.json and package-lock.json are out of sync`);
    }
  }

  for (const [name, requiredVersion] of Object.entries(SECURITY_OVERRIDES)) {
    if (manifest?.overrides?.[name] !== requiredVersion) {
      failures.push(`${name} security override must be ${requiredVersion}`);
    }
    const installed = lockfile?.packages?.[`node_modules/${name}`]?.version;
    if (installed !== requiredVersion) {
      failures.push(`${name} lock resolution must be ${requiredVersion}; found ${installed ?? "missing"}`);
    }
  }

  const lovableVersion = manifest?.devDependencies?.["@lovable.dev/vite-tanstack-config"];
  const lockedLovable = lockfile?.packages?.["node_modules/@lovable.dev/vite-tanstack-config"]?.version;
  if (!lovableVersion || lovableVersion !== lockedLovable) {
    failures.push(
      `Lovable Vite config must be pinned and locked to one version; manifest=${lovableVersion ?? "missing"}, lock=${lockedLovable ?? "missing"}`,
    );
  }

  return {
    schema_version: 1,
    valid: failures.length === 0,
    lockfile_version: lockfile?.lockfileVersion ?? null,
    security_resolutions: Object.fromEntries(
      Object.keys(SECURITY_OVERRIDES).map((name) => [
        name,
        lockfile?.packages?.[`node_modules/${name}`]?.version ?? null,
      ]),
    ),
    lovable_vite_config: lockedLovable ?? null,
    failures,
  };
}

export function verifyDependencyContract(repositoryRoot = root) {
  return validateDependencyContract(
    JSON.parse(readFileSync(resolve(repositoryRoot, "package.json"), "utf8")),
    JSON.parse(readFileSync(resolve(repositoryRoot, "package-lock.json"), "utf8")),
  );
}

function runCli() {
  const report = verifyDependencyContract(root);
  const outputIndex = process.argv.indexOf("--output");
  if (outputIndex >= 0) {
    const output = process.argv[outputIndex + 1];
    if (!output) throw new Error("--output requires a file path");
    const target = resolve(root, output);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, `${JSON.stringify(report, null, 2)}\n`);
  }
  if (!report.valid) {
    console.error(`Dependency contract failed:\n${report.failures.map((item) => `- ${item}`).join("\n")}`);
    process.exitCode = 1;
    return;
  }
  console.log(
    `Dependency contract passed (Lovable ${report.lovable_vite_config}; DOMPurify ${report.security_resolutions.dompurify}; nanoid ${report.security_resolutions.nanoid}).`,
  );
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) runCli();

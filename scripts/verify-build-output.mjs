import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

// Nitro writes _headers to .output/public on classic builds and to dist/client
// on the Vite/Cloudflare build used by this project.
const candidateHeaderFiles = [resolve(".output/public/_headers"), resolve("dist/client/_headers")];
let content;
let lastError;

for (const candidate of candidateHeaderFiles) {
  try {
    content = await readFile(candidate, "utf8");
    break;
  } catch (error) {
    lastError = error;
  }
}

if (content === undefined) {
  console.error(
    `Build output verification failed: none of ${candidateHeaderFiles.join(", ")} exist. Run npm run build first.`,
  );
  if (process.env.CI !== "true") console.error(lastError);
  process.exit(1);
}

const requiredPrivatePatterns = [
  "/api/*",
  "/admin/*",
  "/staff/*",
  "/till/*",
  "/kds/*",
  "/driver/*",
  "/display/*",
  "/pay/*",
  "/order/*",
  "/print/*",
  "/account/*",
  "/tab/*",
  "/checkout/*",
  "/cart/*",
  "/lovable/*",
];

const failures = [];
const blocks = content.split(/(?=^\/)/m);

for (const pattern of ["/sw.js", "/manifest.webmanifest"]) {
  const block = blocks.find((candidate) => candidate.startsWith(`${pattern}\n`));
  if (!block) {
    failures.push(`${pattern}: mutable public asset route block is missing`);
    continue;
  }
  if (!/^  cache-control:.*\bmax-age=0\b.*\bmust-revalidate\b/im.test(block)) {
    failures.push(`${pattern}: browser revalidation policy is missing`);
  }
  if (!/^  cloudflare-cdn-cache-control:\s*no-cache\s*$/im.test(block)) {
    failures.push(`${pattern}: Cloudflare revalidation policy is missing`);
  }
  if (!/^  cdn-cache-control:\s*no-cache\s*$/im.test(block)) {
    failures.push(`${pattern}: shared CDN revalidation policy is missing`);
  }
}

for (const pattern of requiredPrivatePatterns) {
  const block = blocks.find((candidate) => candidate.startsWith(`${pattern}\n`));
  if (!block) {
    failures.push(`${pattern}: route block is missing`);
    continue;
  }

  if (!/^  cache-control:.*\bprivate\b.*\bno-store\b/im.test(block)) {
    failures.push(`${pattern}: private, no-store cache-control is missing`);
  }
  if (!/^  cloudflare-cdn-cache-control:\s*no-store\s*$/im.test(block)) {
    failures.push(`${pattern}: Cloudflare CDN no-store policy is missing`);
  }
  if (!/^  cdn-cache-control:\s*no-store\s*$/im.test(block)) {
    failures.push(`${pattern}: shared CDN no-store policy is missing`);
  }
  if (!/^  pragma:\s*no-cache\s*$/im.test(block)) {
    failures.push(`${pattern}: pragma no-cache is missing`);
  }
  if (!/^  expires:\s*0\s*$/im.test(block)) {
    failures.push(`${pattern}: expires 0 is missing`);
  }
}

if (failures.length) {
  console.error(
    `Build output verification failed:\n${failures.map((item) => `- ${item}`).join("\n")}`,
  );
  process.exit(1);
}

console.log(
  `Build output verification passed for ${requiredPrivatePatterns.length} private route families and 2 mutable public assets.`,
);

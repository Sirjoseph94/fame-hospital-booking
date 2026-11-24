#!/usr/bin/env node
// Fails if package-lock.json is missing optional dependencies that packages
// declare — in practice, the per-platform native binaries (lightningcss,
// @parcel/watcher, @unrs/resolver-binding, noxcturnal, …).
//
// npm 10 drops binaries for *other* platforms from the lockfile when you run
// `npm install <pkg>` with node_modules present. The Mac keeps working, but
// EAS Build / CI on Linux then fail with errors like:
//   Cannot find module '../lightningcss.linux-x64-gnu.node'
//
// Fix: npm run lock:regen   (rebuilds the lockfile for all platforms)
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const lock = JSON.parse(readFileSync(join(root, "package-lock.json"), "utf8"));
const packages = lock.packages ?? {};

// Node resolution: <pkg>/node_modules/<dep>, then each ancestor node_modules.
function resolves(fromPath, dep) {
  let base = fromPath;
  for (;;) {
    if (packages[`${base ? `${base}/` : ""}node_modules/${dep}`]) return true;
    if (!base) return false;
    const idx = base.lastIndexOf("/node_modules/");
    base = idx === -1 ? "" : base.slice(0, idx);
  }
}

const missing = [];
for (const [path, meta] of Object.entries(packages)) {
  for (const dep of Object.keys(meta.optionalDependencies ?? {})) {
    if (!resolves(path, dep)) missing.push(`${path || "(root)"} -> ${dep}`);
  }
}

if (missing.length > 0) {
  console.error(`package-lock.json is missing ${missing.length} optional (platform-specific) package(s):`);
  for (const m of missing.slice(0, 20)) console.error(`  ${m}`);
  if (missing.length > 20) console.error(`  … and ${missing.length - 20} more`);
  console.error("\nBuilds on other platforms (EAS Linux, CI) will fail. Fix: npm run lock:regen");
  process.exit(1);
}
const platformEntries = Object.values(packages).filter((m) => m.os || m.cpu).length;
console.log(`package-lock.json OK (${platformEntries} platform-specific entries, none missing)`);

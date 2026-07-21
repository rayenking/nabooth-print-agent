#!/usr/bin/env node
/**
 * Upload Print Agent binaries for all platforms (admin session required).
 *
 * Usage:
 *   API_URL=http://localhost:5050 \
 *   NABOOTH_TOKEN=<session token> \
 *   VERSION=0.1.0 \
 *   node scripts/upload-print-agent.mjs \
 *     --darwin-arm64 path/to/Nabooth.Print.Agent_0.1.0_aarch64.dmg \
 *     --darwin-x64 path/to/...x64.dmg \
 *     --linux-x64 path/to/...AppImage \
 *     --windows-x64 path/to/...msi
 *
 * Or place files under dist/print-agent/<version>/:
 *   nabooth-print-agent-darwin-arm64.*
 *   nabooth-print-agent-darwin-x64.*
 *   nabooth-print-agent-linux-x64.*
 *   nabooth-print-agent-windows-x64.*
 *
 *   VERSION=0.1.0 NABOOTH_TOKEN=... pnpm upload:print-agent
 */

import { createReadStream, existsSync, readdirSync, statSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url))); // repo root
const API = (process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || "https://api.nabooth.id").replace(/\/$/, "");
const TOKEN = process.env.NABOOTH_TOKEN || process.env.TOKEN || "";
const VERSION = process.env.VERSION || process.argv.find((a) => a.startsWith("--version="))?.slice(10) || "";

const PLATFORMS = ["darwin-arm64", "darwin-x64", "linux-x64", "windows-x64"];

function parseArgs() {
  const map = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--") && PLATFORMS.some((p) => a === `--${p}` || a.startsWith(`--${p}=`))) {
      const p = PLATFORMS.find((x) => a === `--${x}` || a.startsWith(`--${x}=`));
      if (!p) continue;
      if (a.includes("=")) map[p] = a.split("=").slice(1).join("=");
      else map[p] = argv[++i];
    }
  }
  return map;
}

function autoDiscover(version) {
  const dir = join(root, "dist", "releases", version);
  const map = {};
  if (!existsSync(dir)) return map;
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (!statSync(full).isFile()) continue;
    for (const p of PLATFORMS) {
      if (name.includes(p)) map[p] = full;
    }
  }
  return map;
}

async function uploadOne(platform, filePath, version) {
  const { readFile } = await import("node:fs/promises");
  const buf = await readFile(filePath);
  const blob = new Blob([buf]);
  const form = new FormData();
  form.append("version", version);
  form.append("platform", platform);
  form.append("file", blob, basename(filePath));

  const res = await fetch(`${API}/v1/admin/print-agent/releases`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}` },
    body: form,
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text };
  }
  if (!res.ok) {
    throw new Error(`${platform}: ${res.status} ${body.message || body.error || text}`);
  }
  console.log(`✓ ${platform} v${version} → ${body.id} (${body.bytes} bytes)`);
  if (body.prunedVersions?.length) {
    console.log(`  pruned old versions: ${body.prunedVersions.join(", ")}`);
  }
  return body;
}

async function main() {
  if (!TOKEN) {
    console.error("Set NABOOTH_TOKEN (admin session bearer token).");
    process.exit(1);
  }
  if (!VERSION) {
    console.error("Set VERSION=x.y.z");
    process.exit(1);
  }
  const files = { ...autoDiscover(VERSION), ...parseArgs() };
  const entries = Object.entries(files).filter(([, p]) => p && existsSync(p));
  if (!entries.length) {
    console.error(
      "No files found. Pass --darwin-arm64 path ... or put binaries in dist/print-agent/<version>/",
    );
    process.exit(1);
  }
  console.log(`Uploading to ${API} version=${VERSION}`);
  for (const [platform, path] of entries) {
    await uploadOne(platform, path, VERSION);
  }
  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

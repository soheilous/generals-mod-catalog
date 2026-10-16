// Checks the catalog (catalog/*.json): its structure, and (unless --offline) that the pages and images it points to
// still exist. Needs Node 18+, no packages.
//
//   node tools/check-catalog.mjs          structure + links
//   node tools/check-catalog.mjs --offline  structure only (used for pull requests)
//
// Exit code 1 when the structure is wrong or a link is certainly dead (404, 410, unknown host). Sites that block
// scripts (ModDB answers 403 to anything that is not a browser) are reported as "unverified", not as failures.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "catalog");
const offline = process.argv.includes("--offline");
const problems = [];
const links = new Map(); // url -> where it is used

const fail = (where, msg) => problems.push(`${where}: ${msg}`);

function checkUrl(where, field, value) {
  if (value === undefined || value === null) return;
  if (typeof value !== "string" || !/^https?:\/\/[^\s]+$/.test(value)) return fail(where, `${field} is not a web address: ${JSON.stringify(value)}`);
  if (/\.(zip|7z|rar|exe|msi)(\?|$)/i.test(new URL(value).pathname + new URL(value).search)) {
    fail(where, `${field} points at a file, the catalog lists pages only (direct links belong in tools.json, with a checksum): ${value}`);
  }
  if (/insave\.ovh|s3host|:9000/i.test(value)) fail(where, `${field} points at the old mod storage: ${value}`);
  if (!links.has(value)) links.set(value, []);
  links.get(value).push(`${where} ${field}`);
}

function checkUrlRaw(where, field, value) {
  if (typeof value !== "string" || !/^https:\/\/[^\s]+$/.test(value)) return fail(where, `${field} must be an https address: ${JSON.stringify(value)}`);
  if (/insave\.ovh|s3host|:9000/i.test(value)) fail(where, `${field} points at the old mod storage: ${value}`);
  if (!links.has(value)) links.set(value, []);
  links.get(value).push(`${where} ${field}`);
}

/** A direct download the author published (see tools/import-manifests.mjs): { url, via, size?, sha256? }. */
function checkDownload(where, d) {
  if (d === undefined) return;
  if (typeof d !== "object" || d === null || Array.isArray(d)) return fail(where, "download must be an object { url, via }");
  for (const k of Object.keys(d)) if (!["url", "via", "size", "sha256"].includes(k)) fail(where, `download has an unknown field "${k}"`);
  if (typeof d.url !== "string" || !/^https:\/\/[^\s]+$/.test(d.url)) fail(where, `download.url must be an https address: ${JSON.stringify(d.url)}`);
  else {
    if (/[?&](uuid|at|token|key|secret|sig|signature)=/i.test(d.url) || /s3host|:9000/i.test(d.url)) fail(where, "download.url must not carry a temporary token or storage keys");
    if (!links.has(d.url)) links.set(d.url, []);
    links.get(d.url).push(`${where} download.url`);
  }
  // where the author published it: proof that the author, not us, chose this link
  if (typeof d.via !== "string" || !/^https:\/\/[^\s]+$/.test(d.via)) fail(where, "download.via must be the https address of the author's manifest that names this file");
  if (d.size !== undefined && !(Number.isInteger(d.size) && d.size > 0)) fail(where, "download.size must be a whole number of bytes");
  if (d.sha256 !== undefined && !/^[0-9a-f]{64}$/.test(d.sha256)) fail(where, "download.sha256 must be 64 hex characters");
}

function checkEntry(where, e, { needsName = true } = {}) {
  if (needsName && (typeof e.name !== "string" || !e.name.trim())) fail(where, "has no name");
  for (const f of ["page", "image", "discord", "news", "support", "network"]) {
    if (f === "network" && typeof e[f] === "string" && !/^https?:/.test(e[f])) continue; // free text in old data
    checkUrl(where, f, e[f]);
  }
  checkUrl(where, "colors.backgroundImage", e.colors?.backgroundImage);
  checkDownload(where, e.download);
  for (const k of Object.keys(e)) {
    if (k !== "download" && /download|s3|secret|key|password|token/i.test(k)) fail(where, `field "${k}" must not be in the catalog`);
  }
}

for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".json") && !["announcements.json", "tools.json"].includes(f))) {
  let idx;
  try {
    idx = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
  } catch (e) {
    fail(file, `is not valid JSON (${e.message})`);
    continue;
  }
  if (idx.format !== 1) fail(file, `format should be 1, it is ${idx.format}`);
  if (!["zh", "generals"].includes(idx.game)) fail(file, `game should be "zh" or "generals"`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(idx.updated ?? "")) fail(file, "updated should be YYYY-MM-DD");
  const names = new Set();
  for (const m of idx.mods ?? []) {
    const where = `${file} > ${m.name}`;
    checkEntry(where, m);
    const key = String(m.name).toLowerCase().replace(/[^a-z0-9]+/g, "-");
    if (names.has(key)) fail(where, "another mod has the same name");
    names.add(key);
    for (const kind of ["patches", "addons"]) {
      const seen = new Set();
      for (const x of m[kind] ?? []) {
        checkEntry(`${where} > ${x.name}`, x);
        if (seen.has(String(x.name).toLowerCase())) fail(`${where} > ${x.name}`, `listed twice under ${kind}`);
        seen.add(String(x.name).toLowerCase());
      }
    }
  }
  for (const kind of ["patches", "addons"]) for (const x of idx.originalGame?.[kind] ?? []) checkEntry(`${file} > original game > ${x.name}`, x);
  for (const x of idx.executables ?? []) {
    checkEntry(`${file} > ${x.name}`, x);
    if (x.for && !(idx.mods ?? []).some((m) => m.name.toLowerCase() === String(x.for).toLowerCase()) && x.for.toLowerCase() !== "original game") {
      fail(`${file} > ${x.name}`, `"for" names a mod that is not in the list: ${x.for}`);
    }
  }
}

// tools.json: helper programs. A direct download is allowed here, but only with a SHA-256 so it can be verified.
const toolsFile = path.join(dir, "tools.json");
if (fs.existsSync(toolsFile)) {
  const tools = JSON.parse(fs.readFileSync(toolsFile, "utf8"));
  if (tools.format !== 1) fail("tools.json", "format should be 1");
  const ids = new Set();
  for (const t of tools.tools ?? []) {
    const where = "tools.json > " + t.id;
    if (!/^[a-z0-9-]+$/.test(t.id ?? "")) fail(where, "id must be lowercase letters, digits and dashes");
    if (ids.has(t.id)) fail(where, "listed twice");
    ids.add(t.id);
    if (!t.name) fail(where, "has no name");
    checkUrl(where, "page", t.page);
    if (t.download) {
      checkUrlRaw(where, "download.url", t.download.url);
      if (!/^[0-9a-f]{64}$/.test(t.download.sha256 ?? "")) fail(where, "a direct download needs download.sha256 (64 hex characters)");
      if (!t.page) fail(where, "a direct download must also name the page of whoever publishes it (page)");
    }
  }
}

const dead = [];
const unverified = [];
if (!offline) {
  const queue = [...links.keys()];
  const hard = /ENOTFOUND|certificate|ECONNREFUSED/i;
  async function probe(url) {
    for (const method of ["HEAD", "GET"]) {
      try {
        const r = await fetch(url, { method, redirect: "follow", signal: AbortSignal.timeout(20000), headers: { "user-agent": "generals-mod-catalog-check (+https://github.com/soheilous/generals-mod-catalog)" } });
        if (r.ok) return;
        if ([404, 410].includes(r.status)) return dead.push(`${url} -> ${r.status} (${links.get(url)[0]})`);
        if (method === "GET") return unverified.push(`${url} -> ${r.status}`);
      } catch (e) {
        const why = `${e.cause?.code ?? e.name}: ${e.cause?.message ?? e.message}`;
        if (method === "GET") return (hard.test(why) ? dead : unverified).push(`${url} -> ${why} (${links.get(url)[0]})`);
      }
    }
  }
  await Promise.all(Array.from({ length: 8 }, async () => { for (let u; (u = queue.shift()); ) await probe(u); }));
}

console.log(`${links.size} links${offline ? " (not fetched: --offline)" : ""}`);
if (unverified.length) console.log(`\nCould not be verified (often sites that block scripts), ${unverified.length}:\n  ` + unverified.join("\n  "));
if (dead.length) console.log(`\nDEAD, ${dead.length}:\n  ` + dead.join("\n  "));
if (problems.length) console.log(`\nPROBLEMS, ${problems.length}:\n  ` + problems.join("\n  "));
if (!dead.length && !problems.length) console.log("\nThe catalog looks fine.");
process.exit(dead.length || problems.length ? 1 : 0);

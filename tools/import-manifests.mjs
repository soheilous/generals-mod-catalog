// Adds author-published direct download links to the catalog.
//
// Many mod authors publish a small GenLauncher manifest (a YAML file in their own repository) that names the file to
// download. p0ls3r's GenLauncherModsData lists those manifests. This tool reads them, and for every catalog entry with the
// same name it records the link the author chose:
//
//   "download": { "url": "https://…/Mod.zip", "via": "https://raw.githubusercontent.com/…/manifest.yaml", "size": 123456789 }
//
// Only a link that really answers with a file is kept (a page, a login or a "virus scan" warning is not a direct link).
// Nothing is downloaded: the tool reads the answer's headers and stops. Existing entries are never made worse: a link that
// stops working is reported, and removed only with --prune.
//
//   node tools/import-manifests.mjs             show what would change
//   node tools/import-manifests.mjs --write     change the catalog files
//   node tools/import-manifests.mjs --write --prune   also drop links that no longer answer with a file
//
// Needs Node 18+, no packages.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "catalog");
const write = process.argv.includes("--write");
const prune = process.argv.includes("--prune");
const LISTS = "https://api.github.com/repos/p0ls3r/GenLauncherModsData/contents";
const UA = { "user-agent": "generals-mod-catalog-tools (+https://github.com/soheilous/generals-mod-catalog)" };

const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

async function getText(url) {
  const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error("HTTP " + r.status);
  return r.text();
}

/** Every manifest address the old lists mention. */
async function manifestUrls() {
  const files = (await (await fetch(LISTS, { headers: UA })).json()).filter((f) => /^ReposModificationData.*\.yaml$/.test(f.name));
  const urls = new Set();
  for (const f of files) {
    for (const m of (await getText(f.download_url)).matchAll(/https:\/\/raw\.githubusercontent\.com\/[^\s'"]+\.ya?ml/g)) urls.add(m[0]);
  }
  return [...urls];
}

/** The few top-level `key: value` lines we need from a manifest. */
function readManifest(text) {
  const get = (k) => {
    const m = text.match(new RegExp(`^${k}:[ \\t]*(.*)$`, "m"));
    return m ? m[1].trim().replace(/^['"]|['"]$/g, "") : "";
  };
  return { type: get("ModificationType"), name: get("Name"), version: get("Version"), link: get("SimpleDownloadLink"), page: get("ModDBLink") };
}

/** Does this address answer with a file (not a web page)? Returns its size when it says so. */
async function answersWithFile(url) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 20000);
  try {
    const r = await fetch(url, { headers: { ...UA, range: "bytes=0-0" }, redirect: "follow", signal: ctl.signal });
    const type = (r.headers.get("content-type") || "").toLowerCase();
    const range = r.headers.get("content-range"); // bytes 0-0/12345
    const size = Number((range && range.split("/")[1]) || r.headers.get("content-length") || 0);
    r.body?.cancel().catch(() => {});
    if (!r.ok) return { ok: false, why: "HTTP " + r.status };
    if (type.includes("text/html") || type.includes("xhtml")) return { ok: false, why: "a web page, not a file" };
    return { ok: true, size: Number.isFinite(size) && size > 1000 ? size : undefined };
  } catch (e) {
    return { ok: false, why: e.name === "AbortError" ? "no answer in 20 s" : e.message };
  } finally {
    clearTimeout(timer);
  }
}

async function pool(items, n, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (next < items.length) { const i = next++; out[i] = await fn(items[i]); } }));
  return out;
}

// ---- catalog entries by name
const files = fs.readdirSync(dir).filter((f) => ["zero-hour.json", "generals.json"].includes(f));
const catalogs = files.map((f) => ({ f, data: JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")) }));
const byName = new Map();
for (const { f, data } of catalogs) {
  for (const m of data.mods) {
    for (const e of [m, ...(m.patches ?? []), ...(m.addons ?? [])]) {
      const k = norm(e.name);
      if (!byName.has(k)) byName.set(k, []);
      byName.get(k).push({ f, e });
    }
  }
}

const urls = await manifestUrls();
console.log(`${urls.length} author manifests listed`);
const manifests = (await pool(urls, 8, async (url) => {
  try { return { url, ...readManifest(await getText(url)) }; } catch (e) { return { url, error: e.message }; }
})).filter((m) => !m.error && m.name);

let added = 0, skipped = 0, dead = 0, same = 0;
const report = [];
await pool(manifests, 6, async (m) => {
  let hits = byName.get(norm(m.name));
  if (!hits) return;
  if (hits.length > 1) {
    // the same name can exist under several mods (every mod has a "Balance Patch"): use the page to tell them apart
    const samePage = hits.filter(({ e }) => m.page && e.page && e.page.replace(/\/$/, "") === m.page.replace(/\/$/, ""));
    if (samePage.length !== 1) { skipped++; report.push(`ambiguous      ${m.name}: ${hits.length} entries share this name`); return; }
    hits = samePage;
  }
  // links that carry a one-time token (Google Drive's confirm/uuid/at) stop working; S3 links need keys
  if (!/^https:\/\/[^\s]+$/.test(m.link) || /[?&]S3|s3host/i.test(m.link) || /[?&](uuid|at)=/i.test(m.link)) { skipped++; report.push(`no usable link  ${m.name}  (${m.link || "none"})`); return; }
  const res = await answersWithFile(m.link);
  for (const { e } of hits) {
    if (!res.ok) {
      if (e.download && e.download.url === m.link) {
        dead++;
        report.push(`LINK STOPPED   ${m.name}: ${res.why}`);
        if (prune) delete e.download;
      } else { skipped++; report.push(`not direct     ${m.name}: ${res.why}  ${m.link}`); }
      continue;
    }
    const next = { url: m.link, via: m.url, ...(res.size ? { size: res.size } : {}) };
    if (e.download && e.download.url === next.url) { same++; continue; }
    e.download = next;
    if (m.version) e.version = m.version; // the link is for this version
    added++;
    report.push(`direct link     ${m.name} ${m.version}  ${m.link}`);
  }
});

// ---- entries that name a project's releases instead of a manifest: download.asset is a pattern such as "game-weekly-*.zip" and
// download.via the project's "latest release" address on api.github.com. The newest matching file becomes url (and version, size).
const globRe = (g) => new RegExp("^" + g.split("*").map((x) => x.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*") + "$");
const withAsset = catalogs
  .flatMap(({ data }) => [...data.mods.flatMap((m) => [m, ...(m.patches ?? []), ...(m.addons ?? [])]), ...(data.executables ?? [])])
  .filter((e) => e.download?.asset);
await pool(withAsset, 3, async (e) => {
  const via = e.download.via;
  if (!/^https:\/\/api\.github\.com\/repos\/[\w.-]+\/[\w.-]+\/releases\/latest$/.test(via ?? "")) {
    report.push(`release source? ${e.name}: via must be a GitHub "releases/latest" API address`);
    return;
  }
  try {
    const r = await fetch(via, { headers: UA, signal: AbortSignal.timeout(20000) });
    if (!r.ok) throw new Error("HTTP " + r.status);
    const rel = await r.json();
    const asset = (rel.assets ?? []).find((a) => globRe(e.download.asset).test(a.name));
    if (!asset) throw new Error(`no file matches ${e.download.asset} in ${rel.tag_name}`);
    const before = e.download.url;
    e.download.url = asset.browser_download_url;
    if (asset.size) e.download.size = asset.size;
    e.version = rel.tag_name;
    if (before !== e.download.url) { added++; report.push(`release link    ${e.name} ${rel.tag_name}  ${asset.browser_download_url}`); } else same++;
  } catch (err) {
    report.push(`RELEASE FAILED  ${e.name}: ${err.message}`);
  }
});

console.log(report.sort().join("\n"));
console.log(`\n${added} added, ${same} unchanged, ${skipped} without a direct link, ${dead} stopped working`);
if (write) {
  for (const { f, data } of catalogs) {
    const file = path.join(dir, f);
    const before = fs.readFileSync(file, "utf8");
    const probe = JSON.stringify({ ...data, updated: JSON.parse(before).updated }, null, 2) + "\n";
    if (probe === before.replace(/\r\n/g, "\n")) continue; // nothing changed in this file
    data.updated = new Date().toISOString().slice(0, 10);
    fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
    console.log(f + " written");
  }
} else {
  console.log("(dry run: use --write to change the files)");
}

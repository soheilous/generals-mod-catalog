# Generals Mod Catalog

An open list of mods for **Command & Conquer: Generals** and **Zero Hour**, and where to get them. It is the catalog behind
[GenLauncher](https://github.com/soheilous/GenLauncher), but it is plain JSON that any launcher, website or tool can read.

| File | What it holds |
|---|---|
| [`catalog/zero-hour.json`](catalog/zero-hour.json) | Zero Hour mods, with their patches, add-ons and executables |
| [`catalog/generals.json`](catalog/generals.json) | Generals mods |
| [`catalog/tools.json`](catalog/tools.json) | Helper programs (with a checksum when a direct download is listed) |
| [`catalog/announcements.json`](catalog/announcements.json) | Messages GenLauncher shows to its users |

## The one rule: files come from their authors

The catalog **points** to each mod's own page (ModDB, Nexus Mods, the author's site or GitHub). It does not host files and
does not link to mirrors somebody else uploaded. That keeps downloads under the control of the people who made the mods.

A **direct download** (`download`) is listed only when the author published it themselves, for launchers to use, in a
GenLauncher manifest in their own repository. The entry says where (`via`), so anyone can check that the author chose the link.
GenLauncher then offers a one-click install for that entry; every other entry opens the author's page instead. Authors can ask
for a `download` to be removed at any time. `tools/import-manifests.mjs` reads the authors' manifests and keeps these links and
the version numbers up to date; it keeps only links that really answer with a file.

## Format (version 1)

```jsonc
{
  "format": 1,
  "game": "zh",                // "zh" or "generals"
  "updated": "2026-10-16",     // date of the last edit
  "mods": [
    {
      "name": "Rise of the Reds",             // required; keep names stable
      "version": "1.87 Public Build 2.0",     // latest known version, free text
      "page": "https://www.moddb.com/mods/rise-of-the-reds",
      "image": "https://example.com/cover.png",
      "discord": "...", "news": "...", "support": "...", "network": "...",
      "colors": { "active": "#ff0000", "border": "#aa0000", "backgroundImage": "https://..." },
      "deprecated": false,
      "patches": [ { "name": "Hanpatch", "version": "32.2", "page": "...", "dependsOn": "Rise of the Reds" } ],
      "addons":  [ { "name": "...", "version": "...", "page": "...", "dependsOn": "<the patch or mod it needs>" } ]
    }
  ],
  "originalGame": { "patches": [], "addons": [] },
  "executables": [ { "name": "...", "for": "Contra", "executableFileName": "modded.exe", "replacesGameExe": true } ]
}
```

Everything except `name` is optional and unknown fields are ignored. Entries with the same name are the same item, so
renaming a mod makes readers treat it as a different one.

## Contributing

Add a mod, fix a link or update a version with a pull request: see [CONTRIBUTING.md](CONTRIBUTING.md). A check runs on every
change, and every week it looks for pages that no longer exist.

```
node tools/check-catalog.mjs --offline    # structure only
node tools/check-catalog.mjs              # also checks that the pages still exist
```

## Credits and license

The first version of this catalog was converted from the mod list of GenLauncher 1.x by **p0ls3r**
([p0ls3r/GenLauncherModsData](https://github.com/p0ls3r/GenLauncherModsData)); the mod pages came from there, and direct links are taken only from the manifests the authors
themselves published. Every mod listed belongs to its authors.

[MIT](LICENSE). *Command & Conquer* and *Generals* are trademarks of Electronic Arts Inc.; this is an unofficial fan project.

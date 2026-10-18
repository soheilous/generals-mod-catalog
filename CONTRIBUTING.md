# Contributing

Thank you for helping keep Generals modding easy to find. Most changes are a few lines of JSON.

## Adding or changing a mod

1. Edit `catalog/zero-hour.json` or `catalog/generals.json`. Copy the shape of a nearby entry.
2. Set `page` to the page the **author** publishes the mod on (ModDB, Nexus Mods, their site or GitHub), not a mirror.
3. Put patches and add-ons under the mod they belong to (`patches`, `addons`); for an add-on that needs a certain patch, set
   `dependsOn` to that patch's name.
4. Update `updated` at the top of the file.
5. Run `node tools/check-catalog.mjs --offline` and open a pull request.

### Other versions

`"versions": [ { "version": "6.26", "page": "https://…", "image": "https://…", "download": { "url": "…", "via": "…" }, "date": "2026-05-01" } ]`
lists versions besides the newest one (the entry itself is the newest). Each can have its own page, picture (the launcher shows it
when that version is selected), direct download and release date. For a project that publishes GitHub releases, a `download`
with `asset` (a file name pattern), `via` (its `releases/latest` API address) and `history` (how many older releases to list)
lets `tools/import-manifests.mjs` fill all of this in by itself.

### Direct downloads

`"download": { "url": "https://…/Mod.zip", "via": "https://…/manifest", "size": 12345, "sha256": "…" }` makes GenLauncher offer a
one-click install. `url` must be a plain https link that answers with the file (no login or "confirm" page, no one-time tokens),
and `via` must be the author's own published manifest or page naming that file. `size` and `sha256` are optional. Run
`node tools/import-manifests.mjs` to fill these in from the authors' manifests.

## Please do not

- link to files hosted by someone other than the author, or to archives on file-sharing sites;
- add a `download` to a mod unless the author published that link themselves (the `via` field names their manifest or page that says so);
- rename an existing mod without a reason: readers match installed mods by name.

## Reporting a problem

Dead link, wrong version, mod that should be removed (its author asks for it, or it is a mirror)? Open an issue with the mod's
name and what is wrong. Authors can ask for their entry to be changed or removed at any time.

## License

By contributing you agree that your contribution is released under the [MIT license](LICENSE).

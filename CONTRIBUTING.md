# Contributing

Thank you for helping keep Generals modding easy to find. Most changes are a few lines of JSON.

## Adding or changing a mod

1. Edit `catalog/zero-hour.json` or `catalog/generals.json`. Copy the shape of a nearby entry.
2. Set `page` to the page the **author** publishes the mod on (ModDB, Nexus Mods, their site or GitHub), not a mirror.
3. Put patches and add-ons under the mod they belong to (`patches`, `addons`); for an add-on that needs a certain patch, set
   `dependsOn` to that patch's name.
4. Update `updated` at the top of the file.
5. Run `node tools/check-catalog.mjs --offline` and open a pull request.

## Please do not

- link to files hosted by someone other than the author, or to archives on file-sharing sites;
- add download links to mods (only helper programs in `tools.json` may have one, and then with a SHA-256);
- rename an existing mod without a reason: readers match installed mods by name.

## Reporting a problem

Dead link, wrong version, mod that should be removed (its author asks for it, or it is a mirror)? Open an issue with the mod's
name and what is wrong. Authors can ask for their entry to be changed or removed at any time.

## License

By contributing you agree that your contribution is released under the [MIT license](LICENSE).

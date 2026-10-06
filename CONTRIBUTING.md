# Contributing

Thanks for helping. Beryl uses only the Python standard library and plain JavaScript, so there is nothing to install.

```bash
python3 -m unittest discover -s tests      # tests, on the demo data
python3 beryl.py --config demo/beryl.json serve   # the dashboard with fictional data
```

Changes go in `CHANGELOG.md` under `## Unreleased`. Tests run on every pull request.

## Add a language

Each language is one file in `i18n/`, named with its two-letter code (`ru.json`, `es.json`, `de.json`…).

1. Copy `i18n/en.json` to `i18n/<code>.json`.
2. Set `name` to the language's own name (`Русский`, `Español`).
3. Translate the values. Keep the keys and leave every `{placeholder}` as it is (`{n}`, `{title}`, `{date}`…). You can move it within the sentence.
4. Plurals: a text written as `{"one": "...", "other": "..."}` has plural forms. In the `web` section you may use any form your language needs (`zero`, `one`, `two`, `few`, `many`, `other`, as in the [Unicode plural rules](https://www.unicode.org/cldr/charts/latest/supplemental/language_plural_rules.html)); `other` is required. The `beryl` section only knows `one` and `other`.
5. `statuses` are the status choices offered in the dashboard. `status_words` are words that place a status in a group (`ativo` active, `pausado` paused, `ideia` idea, `encerrado` archived; anything else counts as ongoing).
6. Run the tests: they check that your file has every text of `en.json`, with the same placeholders.
7. Open a pull request. If you can, ask another native speaker to read it: short interface texts are where translations most often sound off.

Two sections:

- `web`: the dashboard.
- `beryl`: what Beryl writes in notes and shows in messages.

With `language: auto` (the default), Beryl uses the first of the system's languages that has a file, and English otherwise. The questions Claude Code asks when the plugin is installed stay in English: Claude Code shows them as written.

## Third-party files

The libraries in `web/vendor/` and the fonts in `web/fonts/` are copies of official releases, listed with their SHA-256 in `web/vendor/CHECKSUMS.json` (a test checks them). To update a library, change its version in `scripts/vendor.sh`, run it, check the dashboard and run the tests. three.js stays at 0.147.0, the last release with the `examples/js` scripts the 3D views load without a build step.

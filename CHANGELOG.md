# Changelog

## Unreleased

## 0.9.0 (2026-10-06)

- New `/beryl:week` skill (and `beryl.py week --days N`): a recap of the last days by project, from session logs and conversations.
- The dashboard counts the claude.ai conversations still unsorted and suggests `/beryl:organize`.
- Screenshots in the README (from the demo, light and dark).
- README in Portuguese brought up to date with the security changes.
- Security: the MCP takes the session's folder from its own working folder, not from `CLAUDE_PROJECT_DIR` (a repository's settings could set it and pass for one of your projects).
- Security: in a folder, only a complete claude.ai export (`conversations.json` with `users.json`) is taken, and exports over 2 GB aren't read; a bad export shows no conversations instead of an error.
- Security: the key in the address Beryl opens works once; the browser keeps a separate session secret.
- Graph legend: folder names are escaped.

## 0.8.0 (2026-10-06)

- `web/vendor/CHECKSUMS.json` lists the SHA-256 of the bundled libraries (d3 7.9.0, three.js 0.147.0) and fonts; a test checks them, and `scripts/vendor.sh` rebuilds the libraries from the official npm releases.

- The dashboard warns when the claude.ai export is getting old (newest conversation more than `export_warn_days`, 14, ago) and says how to get a new one.

## 0.7.0 (2026-10-06)

- New "Beryl only in my projects" option (`mcp_only_projects`): outside your projects' folders and the notes folder, the MCP lists no tools and returns nothing.
- README: the limits of the secrets filter.

## 0.6.0 (2026-10-06)

- The server needs a per-run secret key, given to the browser Beryl opens as a cookie: other local programs can no longer read the dashboard's data.
- The data folder is now private to your user (it holds the claude.ai export).
- The server stops after 2 hours with no open dashboard (`idle_minutes`, 0 = never).

## 0.5.0 (2026-10-06)

- One file per language in `i18n/` (dashboard texts, what Beryl writes, statuses and status words); adding a language is adding a file. `CONTRIBUTING.md` explains how, and a test checks every file is complete.
- New `language` plugin option (auto, en, pt…). With auto, Beryl also reads macOS's language list, since the Claude app starts with empty locale variables; the dashboard and the notes use the same language.
- Plurals in the dashboard follow each language's rules.

- Defaults and your own settings are kept apart: the code holds only generic defaults; personal conventions go in your local `beryl.json` (documented under "Your own settings").
- New `status_groups` setting: your own status words for the colors and filters.
- Generic defaults: `project_types` is `projeto`, `project`; the Portuguese statuses mirror the English ones; a one-line "label: link" paragraph is never taken as a note's summary.
- The box for `claude_folder` is called "Claude's memory".
- The MCP no longer accepts the old Portuguese tool and argument names.

- The graph opens in the Galaxy view (a view you choose is still remembered).
- The graph's "Show" options appear only when they apply: Daily notes needs a notes folder, and the whole group hides when it has nothing to show.
- The Galaxy and the 3D view stop rotating while the mouse is over a star, so it's easy to point at.

## 0.4.0 (2026-10-06)

- Plugin options changed in `/config` apply right away: Beryl reads them where Claude Code saves them (`pluginConfigs` in the user settings), instead of waiting for the next session.
- README: the permission prompt for `python3` on the first `/beryl:dashboard` is expected.

## 0.3.0 (2026-10-01)

- Keyboard and screen readers in the graphs: in the 3D view and the Galaxy, the arrow keys move between stars, Enter opens one and Escape clears; the focused star is announced (name, kind, area, date). In 2D, every node is a keyboard stop.
- The dashboard search also lists matching conversations, so conversations without a project are reachable without the graph.
- Delete moves notes to the system Trash on Linux too (freedesktop Trash, restorable from the file manager).
- Hook errors are logged to `hook.log` in the data folder (the hook still never interrupts Claude Code).
- Session logs and transcripts are closed after reading.
- `scripts/release.sh` leaves an empty `## Unreleased` section for the next changes.

## 0.2.0 (2026-10-01)

- Fonts ship with Beryl: the dashboard no longer loads anything from outside your machine.
- Note properties: quoted values, multi-line lists (Obsidian's default) and Windows line endings (CRLF) now work. Writes keep a note's line endings.
- Claude Code sessions are cached per file: an active session no longer makes Beryl reread all the others.
- Finding a project by folder works for folders behind symlinks (such as `/tmp` and `/home` on macOS).
- `/beryl:organize` reported "0 conversations sorted" when it linked conversations to projects; fixed.
- Session summaries no longer keep double spaces where markup was removed.
- Tests (`python3 -m unittest discover -s tests`), CI on macOS and Linux, and a release script.
- Requires Python 3.9 or later (3.8 is no longer supported upstream).

## 0.1.1 (2026-10-01)

- The server reloads the settings when they change, without a restart.
- `scripts/launch.sh` (and Beryl.app) uses the plugin's data folder when it exists.

## 0.1.0 (2026-10-01)

- First version as a Claude Code plugin: Claude Code sessions, the claude.ai export and an optional notes folder; dashboard, graph, Galaxy and timeline; MCP server, hooks and the `/beryl:dashboard`, `/beryl:save` and `/beryl:organize` skills; English and Portuguese.

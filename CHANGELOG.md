# Changelog

## Unreleased

- Options: the README and the "no source configured" screen now point to `/plugin configure beryl@beryl` (what Claude Code itself says) instead of `/config`, and the README explains that an install from the terminal doesn't ask for the options.

## 0.12.3 (2026-10-08)

- Fixes from CodeQL: the reader drops Obsidian comments until none is left (a comment inside another no longer leaves a `<!--` behind; what is shown was already escaped), and the CI workflow limits its token to read-only.

- README: a section on passwords, keys and other sensitive information: what Beryl reads and shows, what the filter masks and what it misses, that notes are not filtered, and what reaches Claude (and so Anthropic) through the MCP.

- README: the install guide tells where to keep the claude.ai export safely (a private folder, not Downloads; no git or shared folders; disk encryption; delete old exports).

## 0.12.2 (2026-10-08)

- README: the install section is now a step-by-step guide (requirements, install, options, getting the claude.ai export, first run, update and uninstall) with a troubleshooting table, in English and Portuguese; the Language option was missing from the options table.

- CRT Galaxy: the legend is now a panel, like the readout, so it stays readable over the grid.

- CRT Galaxy: the star under the mouse (or chosen with the keyboard) now draws lines to the notes it is linked to, like the 3D Galaxy; the core note also reaches the arms of its areas.

## 0.12.1 (2026-10-08)

- A page that doesn't exist now shows Beryl's own 404 page, in the theme chosen in the dashboard: a terminal ("SIGNAL LOST") for the CRT themes and a quiet lost-in-the-galaxy card for the others, in the dashboard's language.

- Server hardening (found in a last security pass; none exposed data): error pages and paths with a null byte now get a proper answer instead of dropping the connection, a negative `Content-Length` is refused instead of holding a thread, a JSON body that is not an object gets a 400, and the site's folders are no longer listed.

## 0.12.0 (2026-10-08)

- CRT themes: the Galaxy is now a flat instrument screen (a new `galaxy-crt.js`, drawn on a canvas with no WebGL). It has a polar grid behind the turning galaxy (rings, spokes, degree marks and numbers); flat marks for projects (triangle: Code, circle: chat, square: both; filled when active) tinted by the chosen color; conversations as small squares along the arms (the Chats button still hides them); a sight at the core; daily notes and index notes around it; search matches ringed and named; the latest session as a dashed ring. The star under the mouse or chosen with the keyboard gets corner brackets, dashed cross lines, its arm lit and a readout. The wheel zooms, dragging moves, double click resets. The other themes keep the 3D Galaxy.


## 0.11.2 (2026-10-07)

- Galaxy: the mist along the arms is half as opaque, so it reads as a light haze.
- Galaxy: the core no longer has the dotted bulge around it, only its glow.

## 0.11.1 (2026-10-07)

- README: new screenshots (CRT Beryl, CRT Amber, Dashboard Light) and a section on the themes; the notes now open in a details window, not a drawer.
- Galaxy: the decorative dust along the arms is now soft mist that blends into a cloud, instead of separate dots.
- Fix: the graph no longer jumps back to its starting view while you are using it. A refresh that brings nothing new for the graph leaves it alone, and when something did change (a new conversation, a status), the redrawn graph keeps the zoom and angle you had.

## 0.11.0 (2026-10-07)

- New themes, in the theme list: CRT Beryl (the default), CRT Amber, and the three dashboard looks (Automatic, Light, Dark). The CRT themes use phosphor colors, terminal type (VT323 and Doto, both OFL and shipped with Beryl), scanlines, a glowing logo and chamfered windows. The names follow the language: CRT Berilo and CRT Âmbar in Portuguese.
- The Galaxy takes the CRT theme's phosphor for its night sky, dust, arms, core and labels (the original colors stay in the dashboard themes).

## 0.10.0 (2026-10-07)

- New dashboard structure: top bar with search, theme (automatic, light, dark) and a power button to stop the server; tabs with the summary (projects, conversations, Code sessions) on the right; notices as a strip under the tabs.
- Dashboard: controls in one row (show as, origin, area, sort), then the status bar; compact two-line cards; accordion with project rows and the area's recent conversations; side column with To confirm first, then recent activity, daily notes and Claude's memory (blocks hide when empty).
- Graph: the controls sit in a bar above and the legend and hint in a row below; options that don't apply to the current view are disabled in place instead of hidden. The 2D, 3D and Galaxy drawings are unchanged.
- Timeline: a table with the months on top, daily notes on their own row, one clickable row per project and a legend below.
- Notes open in a centered window you can drag by its title bar (Esc closes, focus returns to where you were) instead of the side drawer; delete asks in a smaller window.
- On a phone: filters and graph options fold away, To confirm comes before the list, the other side blocks start closed and the window fills the screen.

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

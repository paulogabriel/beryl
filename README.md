# Beryl

A local dashboard of your work with Claude, installed as a Claude Code plugin.

[Português](README.pt-BR.md)

Beryl reads three sources, all optional:

- **Claude Code sessions** (`~/.claude/projects`), grouped into projects by git repository.
- **Your claude.ai data export**: the `.zip`, its `conversations.json`, or a folder that receives the exports.
- **A folder of markdown notes**: an Obsidian vault or any other. Notes with `type: project` become projects.

It shows them in your browser, on your own machine:

- **Dashboard:** projects grouped by area, with status, origin (Claude Code, claude.ai or both), last activity and number of conversations. Filters, search, and two layouts: cards or accordion.
- **Graph:** notes, projects and links in 2D, 3D, or as a **Galaxy**, where each arm is an area and every conversation with Claude is a star. The latest session pulses.
- **Timeline:** one bar per project, with your daily notes on the axis.
- **Reader:** any note, conversation or session, with backlinks and the conversations linked to each project.

It also gives every Claude Code session the context of its project, through an MCP server: what the project is, its status, the decisions and what was already discussed. At the end of a session, Claude saves a one-line summary to the project's session log.

Nothing leaves your machine. The dashboard is a local server on `127.0.0.1`.

The name comes from beryl, the stone of the first eyeglass lenses and the eighth foundation of the New Jerusalem (Revelation 21:20). Your notes and conversations keep things; Beryl lets you see them.

## Install

Requirements: Claude Code, and Python 3.9 or later (on macOS, `xcode-select --install` provides it). macOS and Linux. Nothing else to install.

In Claude Code:

```
/plugin marketplace add paulogabriel/beryl
/plugin install beryl@beryl
```

Claude Code then asks for the plugin options. You can change them later in `/config`; the dashboard picks up a change within a few seconds.

| Option | What it does |
|---|---|
| Read Claude Code sessions | Show your Claude Code sessions and group them into projects. On by default. |
| claude.ai data export | The `.zip` from claude.ai (Settings › Privacy › Export data), its `conversations.json`, or a folder such as Downloads (the newest export there is used). |
| Notes folder | An Obsidian vault or any folder of markdown notes. |
| Write to project notes | Let Beryl change the status of project notes and add session summaries to them. Off by default: summaries then stay in Beryl's own data. |
| Beryl only in my projects | Claude sessions get Beryl's context only in your projects' folders and in the notes folder, not in repositories cloned from others. Off by default. |

Start a new Claude Code session after installing, so the MCP server and the hooks load.

## Use

| Command | What it does |
|---|---|
| `/beryl:dashboard` | Opens the dashboard in your browser. The server keeps running in the background and the page updates by itself. The first time, Claude Code asks permission to run `python3`: that's Beryl's local server starting. |
| `/beryl:save` | Saves a short summary of the session to the project's session log. |
| `/beryl:organize` | Sorts your claude.ai conversations: Claude proposes a project or a topic area for each one and saves after you approve. |

Without any command, Claude calls `beryl_context` when you start working on a project. When a session ends or you run `/compact`, a hook writes an automatic entry if nobody saved one.

### How projects are found

- **From notes:** a note with `type: project` (or `tipo: projeto`) is a project. Its `folder` (or `pasta`) property links it to the folders where you work on it; separate several folders with `·`.
- **From Claude Code:** sessions in a folder that no project note covers become one project per git repository, active if it had a session in the last 30 days.
- **From claude.ai:** the export doesn't say which Project a conversation belongs to, so new conversations arrive unsorted. Run `/beryl:organize` to sort them.

Note properties can be in English or Portuguese: `type`/`tipo`, `status`, `area`, `folder`/`pasta`, `last_activity`/`ultima_atividade`, `origin`/`origem`.

### MCP tools

| Tool | What it returns |
|---|---|
| `beryl_context` | The project of the current folder (or a named one): note, status, decisions, session log and recent conversations. |
| `beryl_search` | Notes and conversations that mention a term. |
| `beryl_projects` | All projects, with id, status, area and last activity. |
| `beryl_save_session` | Saves a summary to the session log of the current folder's project. |

## Try it without your data

The `demo/` folder has fictional notes, a claude.ai export and Claude Code sessions:

```bash
python3 beryl.py --config demo/beryl.json serve
```

## Privacy and security

- The server listens only on `127.0.0.1` and answers only requests addressed to it (`Host` and `Origin` checks), which blocks DNS rebinding. Other sites can't read your data or embed the dashboard (CSP with `frame-ancestors 'none'`).
- Each run of the server has its own secret key. The browser Beryl opens receives it as a cookie; other programs on the computer that reach `127.0.0.1` get no data without it.
- The data folder (with the claude.ai export and the key) is readable only by your user.
- The key in the address Beryl opens works once: an address left in the browser history opens nothing.
- When the export setting is a folder (such as Downloads), only a complete claude.ai export counts (`conversations.json` with `users.json`), so a file some site drops there isn't taken as your export. Exports over 2 GB aren't read.
- The server stops by itself after `idle_minutes` (2 hours) with no open dashboard; `/beryl:dashboard` starts it again.
- Writes accept only JSON from Beryl's own page, up to 64 KB, and only the status of writable project notes.
- Titles, summaries and first requests pass through a filter that masks API keys, tokens and private keys. The filter works by known formats: a loose password or a token in an unusual format can get through, so don't count on it as the only protection.
- The MCP shows other sessions only project notes and conversations already sorted, and nothing from the areas in `mcp_hidden_areas` (by default `personal` and `pessoal`). Unsorted conversations stay out.
- The session's folder is the MCP server's own working folder, not `CLAUDE_PROJECT_DIR`, which a repository could set in its own settings.
- `beryl_save_session` only writes to the project of the session's real folder: a malicious README in some repository can't make Claude write into another project's log. What Beryl returns to Claude is marked as data, not instructions.
- Session summaries are written as a single line, without links, images, HTML or `%%`.
- The server, the MCP and the hooks write under a shared file lock.
- `python3 beryl.py build` creates a single read-only HTML file with the titles and summaries of your conversations: don't share it.

## Without Claude Code

Beryl also runs on its own:

```bash
python3 beryl.py serve              # local site with live updates
python3 beryl.py open               # starts the server in the background, if needed, and opens the browser
python3 beryl.py build -o out.html  # a single read-only HTML file
```

Settings then come from a `beryl.json` next to `beryl.py` (see `beryl.example.json`) or from the path in `BERYL_CONFIG`. On macOS, `scripts/make-app.sh` creates `~/Applications/Beryl.app`, with the Beryl icon, for the Dock.

## Your own settings

Beryl keeps two things apart:

- **Defaults**, in the code: generic, the same for everyone, updated with Beryl.
- **Your settings**, in one local file that updates never touch: `beryl.json` in Beryl's data folder (`~/.claude/plugins/data/beryl-beryl/beryl.json` when installed as a plugin, or the path in `BERYL_CONFIG`). Your note conventions (your `type` values, your statuses, your areas) go there.

Any key you leave out keeps its default. The plugin options still take precedence for the four sources.

Example, for notes that use `tipo: projeto-claude` and a status of their own:

```json
{
  "project_types": ["projeto-claude", "projeto"],
  "statuses": ["ativo", "pausado", "funcional", "encerrado"],
  "status_groups": {"ativo": ["funcional"]},
  "area_order": ["work", "learning"]
}
```

| Key | Default | What it does |
|---|---|---|
| `notes`, `claude_code`, `claude_export`, `write_notes`, `mcp_only_projects` | | The same as the plugin options. |
| `language` | `auto` | `en`, `pt`, or `auto` (the system's; in the dashboard, the browser's). |
| `port` | `8765` | Port of the local server. |
| `export_warn_days` | `14` | The dashboard warns when the newest claude.ai conversation in the export is older than this; `0` turns it off. |
| `idle_minutes` | `120` | The server stops after this long with no open dashboard; `0` keeps it running. |
| `write_dirs` | | Note folders where Beryl may write, instead of "project notes". |
| `exclude` | `[]` | Note folders or files that are never read. |
| `project_types` | `projeto`, `project` | Values of `type` (or `tipo`) that make a note a project. |
| `statuses` | by language | Status choices in the note drawer. |
| `status_groups` | | Your own status words for the colors and filters: `{"ativo": [...], "pausado": [...], "continuo": [...], "ideia": [...], "encerrado": [...]}`. Common words (active, paused, idea, done…) are known already. |
| `auto_projects` | `true` | Turn Claude Code folders without a project note into projects. |
| `organize_file` | `organizacao.json` in the data folder | Where conversation sorting and hidden items are kept. A relative path is relative to the notes folder. |
| `mcp_hidden_areas` | `personal`, `pessoal` | Areas the MCP never shows to sessions. The dashboard still shows them. |
| `mcp_folders` | | Note folders the MCP may show besides project notes (`.` is the root). |
| `claude_folder` | | A notes folder kept by Claude (logs, decisions), shown as "Claude's memory". |
| `user_name` | | How the MCP refers to you. |
| `galaxy_core` | | Id (file name without `.md`) of the note at the center of the Galaxy. |
| `area_order` | | Order of the areas in the dashboard; the others follow alphabetically. |

## Delete

In the note drawer, **Delete** asks for confirmation first. A conversation only disappears from Beryl: it stays in claude.ai or in Claude Code. A writable note goes to the Trash.

## Languages

The dashboard and what Beryl writes follow the `language` option: `auto` (your system's), `en` or `pt`. Languages Beryl doesn't have yet fall back to English. Adding one is a single file: see [CONTRIBUTING.md](CONTRIBUTING.md).

## Development

```bash
python3 -m unittest discover -s tests   # tests, on the demo data
scripts/release.sh X.Y.Z                 # on main: tests, plugin validation, version, tag and push
```

Changes go in `CHANGELOG.md` under `## Unreleased`. Tests run on macOS and Linux, Python 3.9 and 3.13, on every pull request.

## License

MIT

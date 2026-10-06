#!/usr/bin/env python3
"""Beryl: a local dashboard of your work with Claude.

Sources, all optional:
  - Claude Code sessions (~/.claude/projects)
  - the claude.ai data export (.zip, conversations.json, or a folder that receives the exports)
  - a folder of markdown notes (an Obsidian vault or any other)

    python3 beryl.py serve              # local site with live reload and status editing
    python3 beryl.py build -o out.html  # single read-only HTML file

Only the Python standard library is used. Settings come, in this order, from the defaults,
an advanced beryl.json (BERYL_CONFIG, the data folder or next to this file), the plugin
options (options.json in the data folder and BERYL_* / CLAUDE_PLUGIN_OPTION_* variables)
and the command line.
"""
import argparse
import contextlib
import datetime as dt
import fcntl
import hmac
import http.cookies
import http.server
import json
import os
import re
import secrets
import shutil
import sys
import threading
import time
import webbrowser
import zipfile
from pathlib import Path
from urllib.parse import parse_qs, urlparse

ROOT = Path(__file__).resolve().parent
WEB = ROOT / "web"
# Beryl's state (session log, lock, conversation sorting): the plugin's data folder, or data/ next to the code
DATA = Path(os.environ.get("BERYL_DATA") or os.environ.get("CLAUDE_PLUGIN_DATA") or ROOT / "data").expanduser()
CLAUDE_CODE_DIR = "~/.claude/projects"

DEFAULTS = {
    # --- sources (all three optional) ---
    "notes": None,                    # folder of markdown notes (Obsidian or any other)
    "claude_code": CLAUDE_CODE_DIR,   # Claude Code sessions; null to skip
    "claude_export": None,            # claude.ai export: .zip, conversations.json or a folder that receives the exports
    # --- writing ---
    "write_notes": False,             # write status and session summaries to project notes
    "write_dirs": None,               # advanced: only these note folders are writable
    # --- reading notes ---
    "exclude": [],                    # note folders or files that are never read
    "project_types": ["projeto", "project"],   # values of tipo/type that make a note a project
    "claude_folder": None,            # advanced: notes folder kept by Claude (logs, decisions), shown apart
    # --- projects and conversations ---
    "auto_projects": True,            # Code sessions outside any project note become projects, one per repository
    "organize_file": None,            # conversation sorting and hidden items (default: organizacao.json in the data folder)
    # --- MCP ---
    "mcp_hidden_areas": ["personal", "pessoal"],   # areas the MCP never returns (the dashboard still shows them)
    "mcp_only_projects": False,       # the MCP answers only in your projects' folders (and the notes folder)
    "mcp_folders": None,              # note folders visible to the MCP besides project notes ("." = root)
    "user_name": None,                # how the MCP refers to Beryl's owner
    # --- dashboard ---
    "port": 8765,
    "export_warn_days": 14,           # the dashboard warns when the newest claude.ai conversation is older than this; 0 = never
    "idle_minutes": 120,              # the server stops after this long with no open dashboard; 0 = never
    "language": "auto",               # en, pt or auto (the system's; in the dashboard, the browser's)
    "galaxy_core": None,              # id of the note at the center of the Galaxy
    "area_order": [],                 # order of the areas in the dashboard (the others follow alphabetically)
    "statuses": None,                 # status choices in the drawer (default: the language's, in STATUSES)
    "status_groups": {},              # extra status words per group, e.g. {"ativo": ["shipped"]}; groups: ativo, pausado, continuo, ideia, encerrado
}
# old beryl.json key names
ALIASES = {"vault": "notes", "code_sessions": "claude_code", "chat_export": "claude_export",
           "chat_map": "organize_file", "mcp_excluir_areas": "mcp_hidden_areas"}
# plugin options (userConfig) → configuration key
OPTIONS = {"notes_dir": "notes", "claude_code": "claude_code", "claude_export": "claude_export", "write_notes": "write_notes",
           "mcp_only_projects": "mcp_only_projects",
           "language": "language"}

# ---------- language of the text people read (what the model reads stays in English) ----------

# one file per language in i18n/: "web" (dashboard), "beryl" (what Beryl writes), statuses and status words
I18N_DIR = ROOT / "i18n"
I18N = {f.stem: json.loads(f.read_text(encoding="utf-8")) for f in sorted(I18N_DIR.glob("*.json"))}
T = {lang: d["beryl"] for lang, d in I18N.items()}
STATUSES = {lang: d["statuses"] for lang, d in I18N.items()}
LANG = "en"
SECTIONS = tuple(T[k]["section"] for k in T)       # session-section titles in both languages (to find the one a note already has)


def tr(key, **kw):
    """Text in Beryl's language (English if that language lacks it). A dict holds plural forms: "one" when n is 1, else "other"."""
    v = T[LANG].get(key, T["en"][key])
    if isinstance(v, dict):
        v = v.get("one") if kw.get("n") == 1 and "one" in v else v["other"]
    return v.format(**kw)


def system_languages():
    """The system's preferred languages: the locale variables and, on macOS, the language list
    (apps such as Claude's often start with empty locale variables)."""
    found = [os.environ.get(k, "") for k in ("LC_ALL", "LC_MESSAGES", "LANG")]
    if sys.platform == "darwin":
        import subprocess
        with contextlib.suppress(OSError, subprocess.SubprocessError):
            out = subprocess.run(["defaults", "read", "-g", "AppleLanguages"], capture_output=True, text=True, timeout=2).stdout
            found += re.findall(r'"?([A-Za-z]{2,3}(?:[-_][A-Za-z0-9]+)*)"?\s*[,)]', out)
    return [f for f in found if f and f.upper() not in ("C", "POSIX") and not f.upper().startswith("C.")]


def pick_language(pref):
    """The configured language if Beryl has it; with "auto", the first system language Beryl has; else English."""
    if pref in T:
        return pref
    for code in system_languages():
        base = re.split(r"[-_.]", code)[0].lower()
        if base in T:
            return base
    return "en"


FRONTMATTER = re.compile(r"^---\n(.*?)\n---\n", re.S)
WIKILINK = re.compile(r"\[\[([^\]]+)\]\]")
DATE = re.compile(r"\b(20\d\d-\d\d-\d\d)\b")


def as_bool(v):
    return v if isinstance(v, bool) else str(v).strip().lower() in ("1", "true", "yes", "sim", "on")


def normalize(d):
    return {ALIASES.get(k, k): v for k, v in d.items()}


def claude_settings():
    """Claude Code's user settings file (~/.claude/settings.json, or in CLAUDE_CONFIG_DIR)."""
    return Path(os.environ.get("CLAUDE_CONFIG_DIR") or "~/.claude").expanduser() / "settings.json"


def saved_plugin_options():
    """The plugin options as Claude Code saves them when they are answered or changed in /config
    (pluginConfigs["beryl@…"].options in the user settings), or None if there are none or Beryl
    isn't running as the plugin."""
    if not (os.environ.get("CLAUDE_PLUGIN_DATA") or "/plugins/data/" in DATA.as_posix()):
        return None
    for pid, conf in (read_json(claude_settings(), {}).get("pluginConfigs") or {}).items():
        if pid == "beryl" or pid.startswith("beryl@"):
            return dict((conf or {}).get("options") or {})
    return None


def plugin_options():
    """Plugin options, from the most current source: what Claude Code saved in its settings (so a
    change in /config applies at once); without it, options.json (copied at the start of each
    session) and the CLAUDE_PLUGIN_OPTION_* variables. BERYL_* variables win over all of them."""
    out = saved_plugin_options()
    if out is None:
        out = {}
        saved = DATA / "options.json"
        if saved.exists():
            with contextlib.suppress(ValueError, OSError):
                out.update(json.loads(saved.read_text(encoding="utf-8")))
        for opt in OPTIONS:
            if os.environ.get(f"CLAUDE_PLUGIN_OPTION_{opt.upper()}", "") != "":
                out[opt] = os.environ[f"CLAUDE_PLUGIN_OPTION_{opt.upper()}"]
    for opt in OPTIONS:
        if os.environ.get(f"BERYL_{opt.upper()}", "") != "":
            out[opt] = os.environ[f"BERYL_{opt.upper()}"]
    # an option never filled in may arrive as the literal "${user_config...}": treat it as empty
    return {OPTIONS[k]: v for k, v in out.items() if k in OPTIONS and v not in ("", None) and not str(v).startswith("${")}


def resolve(path, base=ROOT):
    """Relative paths start at base (by default, Beryl's folder)."""
    p = Path(path).expanduser()
    return p if p.is_absolute() else base / p


def config_files(config=None):
    """Where an advanced beryl.json may be, in order: the given path, BERYL_CONFIG, the data folder, next to the code."""
    files = [Path(config)] if config else [Path(p) for p in [os.environ.get("BERYL_CONFIG")] if p] + [DATA / "beryl.json", ROOT / "beryl.json"]
    return [f.expanduser() for f in files]


def config_stamp(config=None):
    """Changes when a settings file appears, disappears or is edited (plugin options included)."""
    files = config_files(config) + [DATA / "options.json", claude_settings()]
    return tuple((str(f), f.stat().st_mtime if f.exists() else None) for f in files)


def load_config(config=None, notes=None, port=None):
    cfg = dict(DEFAULTS)
    for f in config_files(config):
        if f.exists():
            cfg.update(normalize(json.loads(f.read_text(encoding="utf-8"))))
            break
    cfg.update(plugin_options())
    if notes:
        cfg["notes"] = notes
    if port:
        cfg["port"] = port

    n = resolve(cfg["notes"]).resolve() if cfg["notes"] else None
    cfg["notes"] = n if n and n.is_dir() else None
    cc = cfg["claude_code"]
    if isinstance(cc, str) and cc.strip().lower() in ("true", "false", "sim", "não", "yes", "no", "1", "0"):
        cc = as_bool(cc)
    cfg["claude_code"] = resolve(CLAUDE_CODE_DIR if cc is True else cc) if cc else None
    cfg["claude_export"] = resolve(cfg["claude_export"]) if cfg["claude_export"] else None
    cfg["write_notes"] = as_bool(cfg["write_notes"])
    global LANG
    LANG = pick_language(cfg["language"])
    cfg["statuses"] = cfg["statuses"] or STATUSES[LANG]
    cfg["auto_projects"] = as_bool(cfg["auto_projects"])
    cfg["mcp_only_projects"] = as_bool(cfg["mcp_only_projects"])
    org = cfg["organize_file"]
    # a relative organize_file lives inside the notes (so it travels with them)
    cfg["organize_file"] = resolve(org, cfg["notes"]) if org and cfg["notes"] else resolve(org) if org else DATA / "organizacao.json"
    return cfg


def sources(cfg):
    return {"notes": bool(cfg["notes"]), "claude_code": bool(cfg["claude_code"] and cfg["claude_code"].is_dir()),
            "claude_export": bool(cfg["claude_export"] and export_file(cfg["claude_export"]))}


# ---------- reading notes ----------

PROPS = {"type": ("tipo", "type"), "status": ("status",), "area": ("area", "área"),
         "last": ("ultima_atividade", "last_activity", "updated", "data", "date"),
         "folder": ("pasta", "folder"), "origin": ("origem", "origin")}


def prop(fm, name):
    for k in PROPS[name]:
        if fm.get(k):
            return fm[k]
    return ""


def text_prop(fm, name):
    v = prop(fm, name)
    return v if isinstance(v, str) else ""


def unquote(v):
    v = v.strip()
    return v[1:-1] if len(v) > 1 and v[0] == v[-1] and v[0] in "'\"" else v


def parse_frontmatter(text):
    """Note properties (simple YAML): key: value, quoted values, [a, b] lists and lists of "- item" lines."""
    text = text.replace("\r\n", "\n")
    m = FRONTMATTER.match(text)
    if not m:
        return {}, text
    fm, key = {}, None
    for line in m.group(1).splitlines():
        item = re.match(r"^\s*-\s+(.*)$", line)
        if item and key:                              # list item under the previous key
            fm[key] = (fm[key] if isinstance(fm[key], list) else []) + [unquote(item.group(1))]
            continue
        if ":" not in line or line.startswith((" ", "\t", "-")):
            key = None
            continue
        key, value = (s.strip() for s in line.split(":", 1))
        if value.startswith("[") and value.endswith("]"):
            value = [unquote(v) for v in value[1:-1].split(",") if v.strip()]
        else:
            value = unquote(value)
        fm[key] = value
    return fm, text[m.end():]


def plain(text):
    text = WIKILINK.sub(lambda m: m.group(1).split("|")[-1], text)
    text = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", text)
    return text.replace("**", "").replace("`", "")


def link_line(para):
    """A one-line paragraph that is just a short label, a colon and a link, like "Chat project: [Name](url)"."""
    return bool(re.fullmatch(r"[^\[\]\n:]{1,40}:\s*(\[[^\]]*\]\([^)\s]*\)|\[\[[^\]]*\]\])\s*", para))


def summary_of(body, title_match):
    rest = body[title_match.end():] if title_match else body
    for para in re.split(r"\n\s*\n", rest):
        para = para.strip()
        if para and not para.startswith(("#", "|", "-", "*", ">", "[", "<!--")) and not link_line(para):
            return plain(para)[:400]
    return ""


def is_excluded(rel, cfg):
    parts = rel.split("/")
    return any(parts[0] == e or rel == e or rel.startswith(e.rstrip("/") + "/") for e in cfg["exclude"])


def is_project(fm, cfg):
    return text_prop(fm, "type") in cfg["project_types"]


def writable(rel, fm, cfg):
    """Writable: inside write_dirs (advanced) or, with write_notes, project notes."""
    if cfg["write_dirs"] is not None:
        return any(rel.startswith(d.rstrip("/") + "/") for d in cfg["write_dirs"])
    return cfg["write_notes"] and is_project(fm, cfg)


def iter_notes(cfg):
    notes = cfg["notes"]
    if not notes:
        return
    for root, dirs, files in os.walk(notes):
        dirs[:] = sorted(d for d in dirs if not d.startswith("."))
        for name in sorted(files):
            if not name.endswith(".md"):
                continue
            path = Path(root) / name
            rel = path.relative_to(notes).as_posix()
            if not is_excluded(rel, cfg):
                yield path, rel


def read_notes(cfg):
    notes = []
    for path, rel in iter_notes(cfg):
        text = path.read_text(encoding="utf-8", errors="replace")
        fm, body = parse_frontmatter(text)
        title_m = re.search(r"^# (.+)$", body, re.M)
        links = []
        for raw in WIKILINK.findall(body):
            target = raw.split("|")[0].split("#")[0].strip().split("/")[-1]
            if target and target not in links:
                links.append(target)
        dates = sorted(set(DATE.findall(body)))
        folder = os.path.dirname(rel)
        kind = text_prop(fm, "type") or ("indice" if path.stem.startswith("_") else folder.split("/")[-1] if folder else "nota")
        origem = prop(fm, "origin") or []
        notes.append({
            "id": path.stem,
            "title": title_m.group(1).strip() if title_m else path.stem,
            "path": rel,
            "folder": folder,
            "group": rel.split("/")[0] if "/" in rel else "",     # top-level folder ("" = root)
            "kind": kind,
            "project": is_project(fm, cfg),
            "status": text_prop(fm, "status"),
            "origem": origem if isinstance(origem, list) else [origem],
            "area": text_prop(fm, "area"),
            "last": text_prop(fm, "last") or (dates[-1] if dates else ""),
            "first": dates[0] if dates else "",
            "summary": summary_of(body, title_m),
            "links": links,
            "writable": writable(rel, fm, cfg),
            "pasta": text_prop(fm, "folder"),
            "body": body,
        })
    ids = {n["id"] for n in notes}
    for n in notes:
        n["links"] = [l for l in n["links"] if l in ids and l != n["id"]]
    return notes


# ---------- conversations with Claude as virtual notes ----------

_cache = {}


def cached(key, paths, build):
    """Reuses the result while the source files (and the key) don't change."""
    stamp = tuple((str(p), p.stat().st_mtime) for p in paths if p.exists())
    hit = _cache.get(key[0])
    if hit and hit[0] == (key, stamp):
        return hit[1]
    value = build()
    _cache[key[0]] = ((key, stamp), value)
    return value


SECRET_PATTERNS = [
    r"-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----",
    r"\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{16,}",            # Anthropic / OpenAI
    r"\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}", r"\bgithub_pat_[A-Za-z0-9_]{20,}",
    r"\bAKIA[0-9A-Z]{16}\b", r"\bAIza[0-9A-Za-z_-]{35}\b",
    r"\bxox[abprs]-[A-Za-z0-9-]{10,}", r"\b(?:Bearer|bearer)\s+[A-Za-z0-9._~+/-]{20,}=*",
    # generic long tokens: 40+ characters in a row with letters and digits (paths with "/" don't count)
    r"(?<![A-Za-z0-9_+=-])(?=[A-Za-z0-9_+=-]*[0-9])(?=[A-Za-z0-9_+=-]*[A-Za-z])[A-Za-z0-9_+=-]{40,}(?![A-Za-z0-9_+=-])",
]
SECRET_RE = re.compile("|".join(f"(?:{p})" for p in SECRET_PATTERNS))


def redact(text):
    """Replaces what looks like a secret (API keys, tokens, private keys) with a notice."""
    return SECRET_RE.sub(tr("secret"), text or "")


def short(text, n=300):
    text = re.sub(r"\*\*|__|`", "", text or "").strip()
    text = re.sub(r"^(Conversation overview|Conversation Overview)\s*", "", text).strip()
    return text[:n].rsplit(" ", 1)[0] + "…" if len(text) > n else text


def read_json(path, default):
    try:
        return json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return default


def organization(cfg):
    """Conversation sorting: {"chats": {uuid: {area, project}}, "sessions": {id: {project}}, "hidden": [...]}."""
    return read_json(cfg["organize_file"], {})


def export_file(path):
    """The export file to read: the .zip or .json itself or, in a folder, the newest export."""
    if not path or not path.exists():
        return None
    if path.is_file():
        return path
    # in a folder (such as Downloads, where any site can drop a file), only what has the whole shape
    # of a claude.ai export counts: conversations.json next to users.json
    found = [p for p in path.glob("*.zip") if is_export_zip(p, strict=True)]
    found += [p for p in [*path.glob("*/conversations.json"), *path.glob("conversations.json")] if (p.parent / "users.json").exists()]
    return max(found, key=lambda p: p.stat().st_mtime, default=None)


MAX_EXPORT = 2 * 1024**3                      # conversations.json larger than this isn't read (zip bombs)


def export_member(z, strict=False):
    """The conversations.json inside an export zip, or None."""
    names = z.namelist()
    conv = next((i for i in z.infolist() if i.filename.rsplit("/", 1)[-1] == "conversations.json"), None)
    if not conv or conv.file_size > MAX_EXPORT:
        return None
    if strict and conv.filename.replace("conversations.json", "users.json") not in names:
        return None
    return conv


def is_export_zip(p, strict=False):
    try:
        with zipfile.ZipFile(p) as z:
            return export_member(z, strict) is not None
    except (OSError, zipfile.BadZipFile):
        return False


def read_export(path):
    if path.suffix == ".zip":
        with zipfile.ZipFile(path) as z:
            conv = export_member(z)
            if conv is None:
                raise ValueError(tr("bad_export", f=path.name))
            return json.loads(z.read(conv).decode("utf-8"))
    if path.stat().st_size > MAX_EXPORT:
        raise ValueError(tr("bad_export", f=path.name))
    return json.loads(path.read_text(encoding="utf-8"))


def chat_notes(cfg, projects, org):
    export = export_file(cfg["claude_export"])
    if not export:
        return []
    chats, hidden = org.get("chats", {}), set(org.get("hidden", []))

    def build():
        out = []
        try:
            conversations = read_export(export)
        except (ValueError, OSError, zipfile.BadZipFile) as e:   # a bad export shows nothing, not an error page
            print(f"  {e}", file=sys.stderr)
            return out
        for c in conversations:
            if "chat:" + c["uuid"] in hidden:
                continue
            info = chats.get(c["uuid"], {})
            project = info.get("project") if info.get("project") in projects else None
            title = redact(c.get("name") or "").strip() or tr("untitled")
            summary = redact(c.get("summary") or "").strip()
            created, updated = c["created_at"][:10], c["updated_at"][:10]
            body = "\n".join([
                f"# {title}", "",
                tr("chat_meta", n=len(c.get("chat_messages", [])), a=created, b=updated), "",
                tr("open_chat", u=c["uuid"]), "",
                tr("project", p=project) if project else tr("no_project"), "",
                tr("summary"), "", summary or tr("no_summary"),
            ])
            out.append({
                "id": "chat:" + c["uuid"], "title": title, "path": "claude.ai · chat", "folder": "Claude (chat)",
                "group": "chat", "kind": "chat", "project": False, "status": "", "origem": ["claude-chat"],
                "area": info.get("area") or (projects[project]["area"] if project else ""),
                "last": updated, "first": created, "lastAt": c["updated_at"], "summary": short(summary) or title,
                "links": [project] if project else [], "writable": False, "body": body,
            })
        return out

    return cached(("chat", LANG, tuple(sorted(projects))), [export, cfg["organize_file"]], build)


TEMP_DIRS = ("/tmp", "/private/tmp", "/private/var/folders", "/var/folders")


def repo_root(cwd):
    """Root of the git repository holding the folder (or the folder itself); None for temporary folders and the home folder."""
    p = Path(cwd)
    if not cwd or str(p).startswith(TEMP_DIRS) or p == Path.home() or p == Path("/"):
        return None
    for q in [p, *p.parents]:
        if q == Path.home() or q == Path("/"):
            break
        if (q / ".git").exists():
            return str(q)
    return str(p)


_sessions = {}


def _json_or_none(line):
    try:
        return json.loads(line)
    except ValueError:
        return None


def read_session(f):
    """What Beryl needs from one Claude Code session log, cached per file until it changes
    (an active session changes all the time; the others are read once)."""
    st = f.stat()
    hit = _sessions.get(f)
    if hit and hit[0] == (st.st_mtime, st.st_size):
        return hit[1]
    title = first_prompt = None
    cwds, stamps, count, last_ts = {}, [], 0, ""
    with f.open(encoding="utf-8", errors="replace") as lines:
        records = [o for o in map(_json_or_none, lines) if isinstance(o, dict)]
    for o in records:
        if o.get("type") == "custom-title" and o.get("customTitle"):
            title = redact(o["customTitle"])
        if o.get("cwd"):
            cwds[o["cwd"]] = cwds.get(o["cwd"], 0) + 1
        if o.get("timestamp"):
            stamps.append(o["timestamp"][:10])
            last_ts = max(last_ts, o["timestamp"])
        if o.get("type") == "user" and not o.get("isMeta"):
            content = (o.get("message") or {}).get("content")
            text = content if isinstance(content, str) else ""
            text = redact(re.sub(r"</?pasted_content[^>]*>", "", text)).strip()   # no pasted-text markup, no secrets
            if text and not text.startswith("<"):
                count += 1
                first_prompt = first_prompt or text
    info = {"title": title, "first_prompt": first_prompt, "cwds": cwds, "stamps": stamps, "count": count, "last_ts": last_ts}
    _sessions[f] = ((st.st_mtime, st.st_size), info)
    return info


def code_notes(cfg, projects, org):
    root = cfg["claude_code"]
    if not root or not root.is_dir():
        return []
    manual, hidden = org.get("sessions", {}), set(org.get("hidden", []))
    by_folder = project_folders(projects)
    out = []
    for f in sorted(root.glob("*/*.jsonl")):
        if "code:" + f.stem in hidden:
            continue
        s = read_session(f)
        stamps, count, first_prompt = s["stamps"], s["count"], s["first_prompt"]
        if not stamps or not count:
            continue
        # a session may start in a temporary folder: the project folder where it spent most time wins
        ranked = sorted(s["cwds"], key=s["cwds"].get, reverse=True)
        cwd = next((c for c in ranked if repo_root(c)), ranked[0] if ranked else None)
        project = next((pid for c in ranked for folder, pid in by_folder if c == folder or c.startswith(folder + os.sep)), None)
        if manual.get(f.stem, {}).get("project") in projects:   # manual link, for sessions in temporary folders
            project = manual[f.stem]["project"]
        title = s["title"] or short(first_prompt, 70) or f.stem
        out.append({
            "id": "code:" + f.stem, "title": title, "path": tr("code_path"), "folder": "Claude Code",
            "group": "chat", "kind": "code", "project": False, "status": "", "origem": ["claude-code"],
            "area": projects[project]["area"] if project else "",
            "last": stamps[-1], "first": stamps[0], "lastAt": s["last_ts"], "summary": short(first_prompt, 200),
            "links": [project] if project else [], "writable": False, "cwd": cwd,
            "body": "\n".join([f"# {title}", "", tr("code_meta", n=count, a=stamps[0], b=stamps[-1]), "",
                               tr("folder", f=cwd) if cwd else "", "", tr("project", p=project) if project else tr("no_project"), "",
                               tr("first_prompt"), "", short(first_prompt, 600)]),
        })
    return out


def project_folders(projects):
    """(folder, project id) pairs from the folder property, which may hold several paths separated by "·"."""
    return [(str(Path(part.strip().split(" (")[0]).expanduser()), pid)
            for pid, p in projects.items() for part in (p.get("pasta") or "").split("·") if part.strip().startswith(("~", "/"))]


# ---------- session log kept by Beryl (when it doesn't write to the notes) ----------

SESSIONS_LOG = DATA / "sessoes.json"


def session_log():
    return read_json(SESSIONS_LOG, {})


def auto_projects(sessions, log):
    """One project per repository (or folder) of the Code sessions that no project note covers."""
    groups = {}
    for s in sessions:
        root = not s["links"] and repo_root(s.get("cwd"))
        if root:
            groups.setdefault(root, []).append(s)
    out, today = [], dt.date.today()
    for root, items in groups.items():
        pid, name = "auto:" + root, Path(root).name
        last = max(s["last"] for s in items)
        recent = (today - dt.date.fromisoformat(last)).days <= 30
        lines = log.get(pid, [])
        out.append({
            "id": pid, "title": name, "path": root, "folder": "Claude Code", "group": "auto", "kind": "projeto-auto",
            "project": True, "status": tr("active") if recent else tr("paused"), "origem": ["claude-code"], "area": name,
            "last": last, "first": min(s["first"] for s in items), "summary": tr("auto_summary", n=len(items), f=root),
            "links": [], "writable": False, "pasta": root,
            "body": "\n".join([f"# {name}", "", tr("auto_body", f=root, n=len(items)), "", tr("auto_status")]
                              + (["", tr("section"), ""] + lines if lines else [])),
        })
        for s in items:
            s["links"], s["area"] = [pid], name
            s["body"] = s["body"].replace(tr("no_project"), tr("project", p=pid))
    return out


def collect(cfg):
    """Everything Beryl shows: notes, inferred projects, claude.ai conversations and Claude Code sessions."""
    notes = read_notes(cfg)
    org, log = organization(cfg), session_log()
    for n in notes:                          # log entries kept outside the note show at its end
        if n["project"] and log.get(n["id"]):
            has = any(s in n["body"] for s in SECTIONS)
            n["body"] = n["body"].rstrip() + ("\n" if has else f"\n\n{tr('section')}\n\n") + "\n".join(log[n["id"]])
    projects = {n["id"]: n for n in notes if n["project"]}
    sessions = code_notes(cfg, projects, org)
    autos = auto_projects(sessions, log) if cfg["auto_projects"] else []
    projects.update({a["id"]: a for a in autos})
    return notes + autos + chat_notes(cfg, projects, org) + sessions


def status_words():
    """Words that place a status in a group (ativo, pausado, ideia, encerrado), from every language."""
    out = {}
    for d in I18N.values():
        for group, words in d.get("status_words", {}).items():
            out.setdefault(group, []).extend(w for w in words if w not in out[group])
    return out


def payload(cfg, editable):
    return {
        "vault": cfg["notes"].name if cfg["notes"] else "Claude",
        "generated": dt.date.today().isoformat(),
        "editable": editable,
        "statuses": cfg["statuses"],
        "galaxy_core": cfg["galaxy_core"],
        "export_warn_days": cfg["export_warn_days"],
        "status_groups": cfg["status_groups"],
        "language": LANG,
        # dashboard texts in Beryl's language, with English for anything that language lacks
        "texts": {**I18N["en"]["web"], **I18N[LANG]["web"]},
        "status_words": status_words(),
        "area_order": cfg["area_order"],
        "claude_folder": cfg["claude_folder"],
        "sources": sources(cfg),
        "notes": collect(cfg),
    }


def data_version(cfg):
    """Changes when any source changes: the dashboard uses it to refresh itself."""
    stamps = [p.stat().st_mtime for p, _ in iter_notes(cfg)]
    if cfg["claude_code"] and cfg["claude_code"].is_dir():
        stamps += [p.stat().st_mtime for p in cfg["claude_code"].glob("*/*.jsonl")]
    for p in [export_file(cfg["claude_export"]), cfg["organize_file"], SESSIONS_LOG]:
        if p and p.exists():
            stamps.append(p.stat().st_mtime)
    return f"{max(stamps, default=0):.3f}-{len(stamps)}"


# ---------- private data folder ----------

def private_data():
    """The data folder holds the claude.ai export and the session log: only its owner can open it,
    and files Beryl creates are owner-only too."""
    os.umask(0o077)
    DATA.mkdir(parents=True, exist_ok=True)
    with contextlib.suppress(OSError):
        os.chmod(DATA, 0o700)


# ---------- write lock ----------

LOCK = DATA / ".escrita.lock"


@contextlib.contextmanager
def vault_lock():
    """Exclusive lock between processes (server, MCP and hook): each read-modify-write of a note
    or state file happens whole, with no other in between. Waits 10 s at most."""
    private_data()
    with open(LOCK, "a") as f:
        deadline = time.time() + 10
        while True:
            try:
                fcntl.flock(f, fcntl.LOCK_EX | fcntl.LOCK_NB)
                break
            except BlockingIOError:
                if time.time() > deadline:
                    raise TimeoutError(tr("busy"))
                time.sleep(0.05)
        try:
            yield
        finally:
            fcntl.flock(f, fcntl.LOCK_UN)


def write_json(path, data):
    if DATA in path.parents:
        private_data()
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".beryl-tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    os.replace(tmp, path)                     # readers never see a half-written file


# ---------- writing the status ----------

def set_status(cfg, note_id, status):
    with vault_lock():
        return _set_status(cfg, note_id, status)


def find_note_file(cfg, note_id):
    """The note file and its text, if it is writable and really inside the notes folder."""
    for path, rel in iter_notes(cfg):
        if path.stem != note_id:
            continue
        text = path.read_text(encoding="utf-8").replace("\r\n", "\n")   # write_text restores CRLF if the file used it
        fm, _ = parse_frontmatter(text)
        if not writable(rel, fm, cfg):
            raise PermissionError(tr("read_only", f=rel))
        if not str(path.resolve()).startswith(str(cfg["notes"]) + os.sep):
            raise PermissionError(tr("outside"))
        return path, rel, text
    raise FileNotFoundError(tr("not_found", f=note_id))


def _set_status(cfg, note_id, status):
    if status not in cfg["statuses"]:
        raise ValueError(tr("bad_status"))
    path, _, text = find_note_file(cfg, note_id)
    m = FRONTMATTER.match(text)
    if not m:
        raise ValueError(tr("no_frontmatter"))
    today = dt.date.today().isoformat()
    lines = upsert(m.group(1).splitlines(), "status", status)
    lines = upsert(lines, last_key(lines), today)
    write_text(path, "---\n" + "\n".join(lines) + "\n---\n" + text[m.end():])
    return {"id": note_id, "status": status, "last": today}


def last_key(lines):
    """The last-activity property the note already uses; if none, the one matching the language of its other properties."""
    keys = {l.split(":", 1)[0].strip() for l in lines}
    pt = keys & {"tipo", "pasta", "origem", "área"}
    return next((k for k in PROPS["last"][:3] if k in keys), "ultima_atividade" if pt else "last_activity")


def write_text(path, text):
    """Atomic write that keeps the file's line endings (CRLF if it had them)."""
    if path.exists() and b"\r\n" in path.read_bytes():
        text = text.replace("\r\n", "\n").replace("\n", "\r\n")
    tmp = path.with_suffix(".md.beryl-tmp")
    tmp.write_bytes(text.encode("utf-8"))
    os.replace(tmp, path)


def delete_item(cfg, item_id):
    with vault_lock():
        return _delete_item(cfg, item_id)


def _delete_item(cfg, item_id):
    """Conversations: hidden in Beryl (the hidden list of the organize file). Writable notes: moved to the Trash."""
    if item_id.startswith(("chat:", "code:")):
        data = organization(cfg)
        hidden = data.setdefault("hidden", [])
        if item_id not in hidden:
            hidden.append(item_id)
        write_json(cfg["organize_file"], data)
        return {"id": item_id, "done": "hidden"}
    path, _, _ = find_note_file(cfg, item_id)
    return {"id": item_id, "done": "trash", "path": str(move_to_trash(path))}


def trash_dir():
    """The system Trash: ~/.Trash on macOS; elsewhere the freedesktop Trash ($XDG_DATA_HOME/Trash)."""
    if sys.platform == "darwin":
        return Path.home() / ".Trash"
    return Path(os.environ.get("XDG_DATA_HOME") or Path.home() / ".local" / "share") / "Trash"


def move_to_trash(path):
    trash = trash_dir()
    files = trash if sys.platform == "darwin" else trash / "files"
    files.mkdir(parents=True, exist_ok=True)
    target, n = files / path.name, 1
    while target.exists():
        target = files / f"{path.stem} ({n}){path.suffix}"
        n += 1
    if sys.platform != "darwin":                 # where it came from, so file managers can restore it
        info = trash / "info"
        info.mkdir(parents=True, exist_ok=True)
        (info / (target.name + ".trashinfo")).write_text(
            f"[Trash Info]\nPath={path.resolve()}\nDeletionDate={dt.datetime.now().strftime('%Y-%m-%dT%H:%M:%S')}\n")
    shutil.move(str(path), str(target))          # also works across volumes
    return target


def upsert(lines, key, value):
    for i, line in enumerate(lines):
        if line.split(":", 1)[0].strip() == key:
            lines[i] = f"{key}: {value}"
            return lines
    return lines + [f"{key}: {value}"]


# ---------- server ----------

class Handler(http.server.SimpleHTTPRequestHandler):
    cfg = None

    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(WEB), **kw)

    MAX_BODY = 64 * 1024
    args, stamp = {}, None
    token = None                              # secret of this run: the browser Beryl opens gets it as a cookie
    launch, port = None, None                 # one-use key in the address Beryl opens (beryl.py open reads it from the key file)
    last_seen = time.time()                   # last request, for stopping when idle

    def config(self):
        """The settings, read again when a settings file changes (the server's port stays)."""
        cls = type(self)
        stamp = config_stamp(cls.args.get("config"))
        if stamp != cls.stamp:
            cfg = load_config(**cls.args)
            cfg["port"] = self.server.server_address[1]
            cls.cfg, cls.stamp = cfg, stamp
        return cls.cfg

    def allowed_hosts(self):
        port = self.server.server_address[1]
        return {f"127.0.0.1:{port}", f"localhost:{port}"}

    def host_ok(self):
        """Blocks DNS rebinding: only answers requests addressed to Beryl itself."""
        if self.headers.get("Host", "") in self.allowed_hosts():
            return True
        self.send_json({"error": "Host not allowed."}, 403)
        return False

    def cookie_name(self):
        return f"beryl_{self.server.server_address[1]}"   # cookies don't separate ports

    def authorized(self):
        """The data and the writes need the run's secret: other programs on the computer can reach
        127.0.0.1 too, but only the browser Beryl opened has it."""
        token = type(self).token
        if not token:
            return True
        jar = http.cookies.SimpleCookie()
        with contextlib.suppress(http.cookies.CookieError):
            jar.load(self.headers.get("Cookie", ""))
        given = jar.get(self.cookie_name())
        if given and hmac.compare_digest(given.value, token):
            return True
        self.send_json({"error": tr("auth_needed")}, 401)
        return False

    def take_key(self):
        """/?k=<launch key>: gives the browser the run's secret in a cookie and goes to the clean address.
        The launch key works once: an address left in the browser history opens nothing. True if it answered."""
        url = urlparse(self.path)
        key = parse_qs(url.query).get("k", [""])[0]
        if url.path != "/" or not key:
            return False
        self.send_response(303)
        cls = type(self)
        with LAUNCH_LOCK:
            ok = cls.launch and hmac.compare_digest(key, cls.launch)
            if ok:
                cls.launch = new_launch_key(cls.port)
        if ok:
            self.send_header("Set-Cookie", f"{self.cookie_name()}={cls.token}; Path=/; HttpOnly; SameSite=Strict")
        self.send_header("Location", "/")
        self.send_header("Content-Length", "0")
        self.end_headers()
        return True

    # only Beryl's own scripts run; the page can't be embedded in another site (clickjacking)
    CSP = ("default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
           "font-src 'self'; img-src 'self' data:; "
           "connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'")

    def end_headers(self):
        # site files without cache: a Beryl update shows on the next load
        if not self.path.startswith("/api/"):
            self.send_header("Cache-Control", "no-cache")
        self.send_header("Content-Security-Policy", self.CSP)
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        super().end_headers()

    def log_message(self, fmt, *args):
        if "/api/version" not in (args[0] if args else ""):
            sys.stderr.write("  " + fmt % args + "\n")

    def send_json(self, obj, code=200):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_HEAD(self):
        if self.host_ok():
            super().do_HEAD()

    def do_GET(self):
        if not self.host_ok() or self.take_key():
            return
        route = urlparse(self.path).path
        if route.startswith("/api/"):
            if not self.authorized():
                return
            type(self).last_seen = time.time()
        if route == "/api/data":
            return self.send_json(payload(self.config(), editable=True))
        if route == "/api/version":
            cfg = self.config()                  # a settings change also counts as new data
            return self.send_json({"version": f"{data_version(cfg)}-{abs(hash(self.stamp)) % 10**8}"})
        return super().do_GET()

    def do_POST(self):
        if not self.host_ok() or not self.authorized():
            return
        type(self).last_seen = time.time()
        route = urlparse(self.path).path
        # writes only from Beryl's own page: Origin required and equal to Host, JSON body
        origin = urlparse(self.headers.get("Origin", ""))
        if origin.scheme != "http" or origin.netloc not in self.allowed_hosts():
            return self.send_json({"error": "Origin not allowed."}, 403)
        if self.headers.get("Content-Type", "").split(";")[0].strip() != "application/json":
            return self.send_json({"error": "Send JSON."}, 415)
        if route == "/api/stop":                 # the dashboard's "stop server" button
            self.send_json({"stopped": True})
            print(tr("stopped"), flush=True)
            threading.Thread(target=self.server.shutdown, daemon=True).start()
            return
        if route not in ("/api/status", "/api/delete"):
            return self.send_json({"error": "Route not found."}, 404)
        try:
            length = int(self.headers.get("Content-Length", 0))
            if length > self.MAX_BODY:
                return self.send_json({"error": "Request too large."}, 413)
            data = json.loads(self.rfile.read(length) or b"{}")
            if route == "/api/delete":
                result = delete_item(self.config(), str(data.get("id", "")))
                print(f"  deleted: {result['id']} ({result['done']})")
                return self.send_json(result)
            result = set_status(self.config(), str(data.get("id", "")), str(data.get("status", "")))
            print(f"  status: {result['id']} → {result['status']}")
            return self.send_json(result)
        except PermissionError as e:
            return self.send_json({"error": str(e)}, 403)
        except (ValueError, FileNotFoundError, TimeoutError) as e:
            return self.send_json({"error": str(e)}, 400)
        except OSError as e:
            return self.send_json({"error": f"Could not complete: {e.strerror or e}"}, 500)


def token_file(port):
    return DATA / f"token-{port}"


LAUNCH_LOCK = threading.Lock()


def new_launch_key(port):
    """A one-use key to open the dashboard, saved owner-only in the data folder (where `beryl.py open` reads it)."""
    private_data()
    token = secrets.token_urlsafe(32)
    tmp = token_file(port).with_suffix(".beryl-tmp")
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as f:
        f.write(token)
    os.replace(tmp, token_file(port))
    return token


def stop_when_idle(server, minutes):
    """Stops the server after `minutes` with no request (an open dashboard asks every few seconds)."""
    def watch():
        while True:
            time.sleep(min(60, minutes * 15))
            if time.time() - Handler.last_seen > minutes * 60:
                print(tr("idle_stop", n=minutes), flush=True)
                server.shutdown()
                return
    threading.Thread(target=watch, daemon=True).start()


def serve(cfg, open_browser=True, args=None):
    Handler.cfg, Handler.args, Handler.stamp = cfg, args or {}, config_stamp((args or {}).get("config"))
    server = http.server.ThreadingHTTPServer(("127.0.0.1", cfg["port"]), Handler)
    Handler.token, Handler.port, Handler.last_seen = secrets.token_urlsafe(32), cfg["port"], time.time()
    Handler.launch = new_launch_key(cfg["port"])
    url = f"http://127.0.0.1:{cfg['port']}/"
    src = sources(cfg)
    print(tr("reading", s=", ".join(k for k, on in src.items() if on) or tr("no_sources")))
    if cfg["notes"]:
        print(tr("notes", f=cfg["notes"], m=tr("writable") if cfg["write_notes"] or cfg["write_dirs"] else tr("readonly")))
    print(tr("open_at", u=url) + "  (python3 beryl.py open)")
    if open_browser:
        threading.Timer(0.6, lambda: webbrowser.open(f"{url}?k={Handler.launch}")).start()
    if float(cfg.get("idle_minutes") or 0) > 0:
        stop_when_idle(server, float(cfg["idle_minutes"]))
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n" + tr("stopped"))
    finally:
        with contextlib.suppress(OSError):
            token_file(cfg["port"]).unlink()


# ---------- single file ----------

def build(cfg, out):
    html = (WEB / "index.html").read_text(encoding="utf-8")
    css = (WEB / "style.css").read_text(encoding="utf-8")
    # fonts inline as data URIs, so the single file still has them
    css = re.sub(r"url\(fonts/([\w.-]+\.woff2)\)", lambda m: "url(data:font/woff2;base64,"
                 + __import__("base64").b64encode((WEB / "fonts" / m.group(1)).read_bytes()).decode() + ")", css)
    js = (WEB / "app.js").read_text(encoding="utf-8")
    d3 = (WEB / "vendor" / "d3.min.js").read_text(encoding="utf-8")
    three = (WEB / "vendor" / "three-bundle.js").read_text(encoding="utf-8")
    common = (WEB / "common.js").read_text(encoding="utf-8")
    i18n = (WEB / "i18n.js").read_text(encoding="utf-8")
    g3 = (WEB / "graph3d.js").read_text(encoding="utf-8")
    gx = (WEB / "galaxy.js").read_text(encoding="utf-8")
    data = json.dumps(payload(cfg, editable=False), ensure_ascii=False).replace("<", "\\u003c")
    icon = "data:image/svg+xml;base64," + __import__("base64").b64encode((WEB / "favicon.svg").read_bytes()).decode()
    html = html.replace('<link rel="icon" href="favicon.svg" type="image/svg+xml">', f'<link rel="icon" href="{icon}" type="image/svg+xml">')
    html = html.replace('<link rel="stylesheet" href="style.css">', f"<style>\n{css}\n</style>")
    html = html.replace('<script src="vendor/d3.min.js"></script>', f"<script>{d3}</script>")
    html = html.replace('<script src="vendor/three-bundle.js"></script>', f"<script>{three}</script>")
    html = html.replace('<script src="i18n.js"></script>', f"<script>\n{i18n}\n</script>")
    html = html.replace('<script src="common.js"></script>', f"<script>\n{common}\n</script>")
    html = html.replace('<script src="graph3d.js"></script>', f"<script>\n{g3}\n</script>")
    html = html.replace('<script src="galaxy.js"></script>', f"<script>\n{gx}\n</script>")
    html = html.replace('<script src="app.js"></script>', f"<script>window.BERYL_DATA={data};</script>\n<script>\n{js}\n</script>")
    Path(out).write_text(html, encoding="utf-8")
    print(tr("built", f=out, k=len(html) // 1024))
    if '"kind": "chat"' in data or '"kind": "code"' in data:
        print(tr("build_warning"))


# ---------- sorting conversations (used by the /beryl:organize skill) ----------

def organize_list(cfg, limit=60):
    """claude.ai conversations still without area or project, newest first, and what already exists to sort them into."""
    items = collect(cfg)
    projects = [{"id": x["id"], "title": x["title"], "area": x["area"]} for x in items if x["project"]]
    areas = sorted({x["area"] for x in items if x["area"]})
    unsorted = sorted([x for x in items if x["kind"] == "chat" and not x["area"] and not x["links"]], key=lambda x: x["last"], reverse=True)
    return {"total_unsorted": len(unsorted), "areas": areas, "projects": projects,
            "conversations": [{"id": x["id"], "date": x["last"], "title": x["title"], "summary": short(x["summary"], 200)} for x in unsorted[:limit]]}


def organize_set(cfg, changes):
    """Saves {conversation id: {"area": ..., "project": ...}} to the organize file. Unknown projects are ignored."""
    known = {x["id"] for x in collect(cfg) if x["project"]}
    with vault_lock():
        data = organization(cfg)
        chats = data.setdefault("chats", {})
        done = 0
        for cid, info in changes.items():
            uuid = cid.split(":", 1)[1] if cid.startswith("chat:") else cid
            area = str(info.get("area") or "").strip()[:40]
            project = info.get("project") if info.get("project") in known else None
            if project:                      # with a project, the area is the project's
                chats[uuid] = {"project": project}
            elif area:
                chats[uuid] = {"area": area}
            else:
                continue
            done += 1
        write_json(cfg["organize_file"], data)
    return done


def open_dashboard(cfg):
    """Starts the server in the background, if it isn't running yet, and opens the browser."""
    import subprocess
    import urllib.request
    url = f"http://127.0.0.1:{cfg['port']}/"

    def up():
        try:
            with urllib.request.urlopen(url + "favicon.svg", timeout=1):
                return True
        except OSError:
            return False

    if not up():
        private_data()
        log = open(DATA / "servidor.log", "a")
        args = [sys.executable, str(ROOT / "beryl.py")] + (["--config", cfg["_config"]] if cfg.get("_config") else []) + ["serve", "--no-open", "--port", str(cfg["port"])]
        subprocess.Popen(args, stdout=log, stderr=log, stdin=subprocess.DEVNULL, start_new_session=True)
        for _ in range(40):
            if up():
                break
            time.sleep(0.25)
        else:
            sys.exit(tr("no_server", f=DATA / "servidor.log"))
    for _ in range(20):                      # the server writes its secret as it starts
        if token_file(cfg["port"]).exists():
            break
        time.sleep(0.1)
    with contextlib.suppress(OSError):
        url += "?k=" + token_file(cfg["port"]).read_text().strip()
    if not os.environ.get("BERYL_NO_OPEN"):
        webbrowser.open(url)
    print(tr("opened", u=url.split("?")[0]))


def main():
    p = argparse.ArgumentParser(description="Beryl: a local dashboard of your work with Claude.")
    p.add_argument("--config", help="path of an advanced beryl.json")
    p.add_argument("--notes", "--vault", dest="notes", help="notes folder (optional)")
    sub = p.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("serve", help="local site with status editing")
    s.add_argument("--port", type=int)
    s.add_argument("--no-open", action="store_true", help="don't open the browser")
    sub.add_parser("open", help="start the server in the background, if needed, and open the browser")
    o = sub.add_parser("organize", help="list unsorted conversations, or save their sorting (JSON on standard input)")
    o.add_argument("action", choices=["list", "set"])
    o.add_argument("--limit", type=int, default=60)
    b = sub.add_parser("build", help="build a single read-only HTML file")
    b.add_argument("-o", "--out", default="beryl.html")
    args = p.parse_args()
    if args.cmd != "build":
        private_data()
    cfg = load_config(args.config, args.notes, getattr(args, "port", None))
    cfg["_config"] = args.config
    if args.cmd == "serve":
        serve(cfg, open_browser=not args.no_open, args={"config": args.config, "notes": args.notes})
    elif args.cmd == "open":
        open_dashboard(cfg)
    elif args.cmd == "organize":
        if args.action == "list":
            print(json.dumps(organize_list(cfg, args.limit), ensure_ascii=False, indent=1))
        else:
            print(tr("sorted", n=organize_set(cfg, json.load(sys.stdin))))
    else:
        build(cfg, args.out)


if __name__ == "__main__":
    main()

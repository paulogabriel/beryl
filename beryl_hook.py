#!/usr/bin/env python3
"""Claude Code hook for the SessionStart, SessionEnd and PreCompact (/compact) events.

At session start (only as a plugin), saves the plugin options to the data folder, so that the
dashboard, opened outside Claude Code, uses the same settings.

If the session ran in a project folder and Claude saved nothing (beryl_save_session) since the
last entry, writes an automatic entry to the project's session log: session title, requests and
commits in that stretch. After /compact the session goes on; the next entry covers only what
comes after.
Never interrupts Claude Code: any error ends silently (exit 0).
"""
import datetime as dt
import json
import subprocess
import sys


def stamp(ts):
    return dt.datetime.fromisoformat(ts.replace("Z", "+00:00")).timestamp()


def parse_transcript(path, since=0):
    """Session start, title and requests made from `since` (epoch seconds) on."""
    start, title, first, prompts = None, None, None, 0
    try:
        with open(path, encoding="utf-8", errors="replace") as lines:
            records = [o for o in map(_json_or_none, lines) if isinstance(o, dict)]
    except OSError:
        records = []
    for o in records:
        ts = o.get("timestamp")
        t = stamp(ts) if ts else None
        if t and start is None:
            start = t
        if o.get("type") == "custom-title" and o.get("customTitle"):
            title = o["customTitle"]
        if o.get("type") == "user" and not o.get("isMeta"):
            content = (o.get("message") or {}).get("content")
            if isinstance(content, str) and content.strip() and not content.startswith("<") and (t or 0) >= since:
                prompts += 1
                first = first or content.strip()
    return start, title, first, prompts


def _json_or_none(line):
    try:
        return json.loads(line)
    except ValueError:
        return None


def git(cwd, *args):
    try:
        # only git log, without fsmonitor or pager: status/diff could run filters defined in .git/config
        r = subprocess.run(["git", "-c", "core.fsmonitor=false", "-c", "core.pager=cat", "-C", cwd, "--no-pager", *args], capture_output=True, text=True, timeout=10)
        return r.stdout.strip() if r.returncode == 0 else ""
    except (OSError, subprocess.TimeoutExpired):
        return ""


def save_options():
    """Copies the plugin options (CLAUDE_PLUGIN_OPTION_*) to options.json in the data folder."""
    import os
    import beryl
    if not os.environ.get("CLAUDE_PLUGIN_DATA"):
        return
    opts = {k: os.environ.get(f"CLAUDE_PLUGIN_OPTION_{k.upper()}", "") for k in beryl.OPTIONS}
    if beryl.read_json(beryl.DATA / "options.json", None) != opts:
        beryl.write_json(beryl.DATA / "options.json", opts)


def main():
    data = json.load(sys.stdin)
    if data.get("hook_event_name") == "SessionStart":
        return save_options()
    cwd = data.get("cwd") or ""
    import beryl_bridge as bridge
    cfg = bridge.config()
    n = bridge.find_project(bridge.all_projects(cfg), pasta=cwd)
    if not n:
        return
    sid = data.get("session_id") or ""
    start, *_ = parse_transcript(data.get("transcript_path") or "")
    if start is None:
        return
    since = max(start, bridge.session_registered_at(sid))   # only the stretch after this session's last entry
    if bridge.registered_since(n["id"], since):
        return                                   # Claude already saved this stretch
    _, title, first, prompts = parse_transcript(data.get("transcript_path") or "", since)
    commits = git(cwd, "log", f"--since=@{int(since)}", "--pretty=%s").splitlines()
    if prompts == 0 or (prompts < 2 and not commits):
        return                                   # no requests, or trivial: keep the log clean
    tr = bridge.beryl.tr
    name = title or bridge.beryl.short(first or "", 70) or tr("untitled_session")
    parts = [f"«{name}»", tr("prompts", n=prompts)]
    if commits:
        shown = "; ".join(c[:70] for c in commits[:3]) + ("; …" if len(commits) > 3 else "")
        parts.append(tr("commits", n=len(commits), c=shown))
    when = tr("auto_compact") if data.get("hook_event_name") == "PreCompact" else tr("auto_end")
    bridge.register_session(cfg, n, " · ".join(parts) + " " + when, origem="hook")
    bridge.mark_session(sid)


def log_error():
    """Never interrupt Claude Code, but leave a trace: the error goes to hook.log in the data folder (last ~100 KB)."""
    import traceback
    try:
        import beryl
        log = beryl.DATA / "hook.log"
        log.parent.mkdir(parents=True, exist_ok=True)
        old = log.read_text(encoding="utf-8")[-100_000:] if log.exists() else ""
        log.write_text(old + f"--- {dt.datetime.now().isoformat(timespec='seconds')}\n{traceback.format_exc()}", encoding="utf-8")
    except Exception:
        pass


if __name__ == "__main__":
    try:
        sys.path.insert(0, __import__("os").path.dirname(__import__("os").path.abspath(__file__)))
        main()
    except Exception:
        log_error()
    sys.exit(0)

#!/usr/bin/env python3
"""Beryl's MCP server (stdio, one JSON-RPC message per line, standard library only).

Gives Claude Code sessions the context of their project: its note, decisions, session log
and the summary of the conversations with Claude. Also saves session summaries.

The plugin registers it (.mcp.json). Without the plugin:
    claude mcp add beryl --scope user -- python3 /path/to/beryl/beryl_mcp.py
"""
import json
import os
import sys
import traceback

import beryl_bridge as bridge

SERVER = {"name": "beryl", "version": "1.0.0"}
def instructions(cfg):
    return (
        f"Beryl is the local dashboard of {bridge.owner(cfg)}'s work with Claude: projects, notes (if any), "
        "claude.ai conversations and Claude Code sessions. "
        "When you start working on a project, call beryl_context (with no arguments it uses the current folder) "
        "to learn what the project is, its status, the decisions and what was already discussed in chats and sessions. "
        "At the end of a meaningful session, call beryl_save_session with a 1 or 2 sentence summary "
        "(what was done, decisions, what's pending), written in the user's language. Don't write to the notes by other means."
    )

FOLDER = {"type": "string", "description": "Project folder. If omitted, the session's current folder."}
PROJECT = {"type": "string", "description": "Project name or id (see beryl_projects). Takes precedence over the folder."}
TOOLS = [
    {"name": "beryl_context",
     "description": "Compact context of a project: its note, status, decisions, session log and the recent conversations with Claude (claude.ai and Claude Code).",
     "inputSchema": {"type": "object", "properties": {"project": PROJECT, "folder": FOLDER,
                     "conversations": {"type": "integer", "description": "How many recent conversations to include (default 8).", "minimum": 0, "maximum": 30}}}},
    {"name": "beryl_search",
     "description": "Search a term in the notes and in the conversations with Claude. Returns titles, dates, ids and summaries.",
     "inputSchema": {"type": "object", "properties": {"term": {"type": "string", "description": "Search term."}}, "required": ["term"]}},
    {"name": "beryl_projects",
     "description": "List the projects with id, status, area and last activity.",
     "inputSchema": {"type": "object", "properties": {}}},
    {"name": "beryl_save_session",
     "description": "Save the summary of this session to the session log of the current folder's project "
                    "and update its last activity. Only writes to the project linked to the session's folder.",
     "inputSchema": {"type": "object", "properties": {
         "summary": {"type": "string", "description": "1 or 2 sentences in the user's language: what was done, decisions and what's pending."}},
         "required": ["summary"]}},
]


def session_dir(args):
    return args.get("folder") or bridge.session_folder()


OFF_HERE = ("Beryl is turned off in this folder: it isn't linked to any of {owner}'s projects "
            "(the mcp_only_projects option). Don't call Beryl's tools here.")


def call(name, args):
    cfg = bridge.config()
    notes, convs = bridge.load(cfg)
    if not bridge.allowed_here(cfg, notes):
        raise PermissionError(OFF_HERE.format(owner=bridge.owner(cfg)))
    if name == "beryl_save_session":
        # writes only to the project of the session's real folder: a malicious text read in some
        # repository can't make Claude write into another project's log
        pasta = bridge.session_folder()
        n = bridge.find_project(notes, pasta=pasta)
        if not n:
            raise LookupError(f"The folder {pasta} isn't linked to any Beryl project, so nothing was saved. "
                              "A git repository with Claude Code sessions is linked automatically; a project note links "
                              "a folder through its `folder` (or `pasta`) property.")
        line = bridge.register_session(cfg, n, args["summary"], origem="claude")
        return f"Saved to {n['title']}:\n{line}"
    if name == "beryl_projects":
        return bridge.projects_list(notes)
    if name == "beryl_search":
        return bridge.search(cfg, notes, convs, args["term"])
    n = bridge.find_project(notes, nome=args.get("project")) if args.get("project") else bridge.find_project(notes, pasta=session_dir(args))
    if not n:
        target = args.get("project") or session_dir(args)
        raise LookupError(f"No Beryl project matches “{target}”. Use beryl_projects to see the ids; "
                          "a project note links a folder through its `folder` (or `pasta`) property.")
    if name == "beryl_context":
        return bridge.project_context(cfg, notes, convs, n, max_convs=int(args.get("conversations", 8)))
    raise LookupError(f"Unknown tool: {name}")


def here_ok(cfg):
    return not cfg.get("mcp_only_projects") or bridge.allowed_here(cfg, bridge.load(cfg)[0])


def reply(msg_id, result=None, error=None):
    out = {"jsonrpc": "2.0", "id": msg_id}
    if error:
        out["error"] = error
    else:
        out["result"] = result
    sys.stdout.write(json.dumps(out, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def handle(msg):
    method, msg_id, params = msg.get("method"), msg.get("id"), msg.get("params") or {}
    if msg_id is None:            # notification (e.g. notifications/initialized): no reply
        return
    if method == "initialize":
        cfg = bridge.config()
        text = instructions(cfg) if here_ok(cfg) else OFF_HERE.format(owner=bridge.owner(cfg))
        reply(msg_id, {"protocolVersion": params.get("protocolVersion", "2025-06-18"),
                       "capabilities": {"tools": {}}, "serverInfo": SERVER, "instructions": text})
    elif method == "ping":
        reply(msg_id, {})
    elif method == "tools/list":
        reply(msg_id, {"tools": TOOLS if here_ok(bridge.config()) else []})
    elif method == "tools/call":
        try:
            text = call(params.get("name"), params.get("arguments") or {})
            reply(msg_id, {"content": [{"type": "text", "text": text}]})
        except Exception as e:  # tool error: returned as a result with isError, for the model to read
            if not isinstance(e, (LookupError, PermissionError, KeyError)):
                traceback.print_exc(file=sys.stderr)
            reply(msg_id, {"content": [{"type": "text", "text": f"Error: {e}"}], "isError": True})
    else:
        reply(msg_id, error={"code": -32601, "message": f"Method not supported: {method}"})


def main():
    bridge.beryl.private_data()
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            handle(json.loads(line))
        except json.JSONDecodeError:
            reply(None, error={"code": -32700, "message": "Invalid JSON"})


if __name__ == "__main__":
    main()

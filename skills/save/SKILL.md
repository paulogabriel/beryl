---
name: save
description: Save a short summary of this Claude Code session to Beryl, in the session log of the current project. Use when the user asks to save, log or register the session in Beryl.
---

Call the `beryl_save_session` tool with a summary of 1 or 2 sentences of what was done in this session since the last save: what changed, the decisions made and what is pending. Write in the user's language and don't repeat what was already saved.

If the tool answers that the current folder isn't linked to a Beryl project, tell the user. A folder is linked automatically when it is a git repository with Claude Code sessions, or by adding the folder to the `folder` (or `pasta`) property of a project note.

$ARGUMENTS

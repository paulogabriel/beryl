# Security

## Reporting a vulnerability

Please don't open a public issue. Report it privately through GitHub: on this repository's **Security** tab, click **Report a vulnerability**. Only the maintainer sees the report, and we can talk it through there until a fix is out.

Useful to include: what an attacker could do, the steps to reproduce, and the Beryl version (`.claude-plugin/plugin.json`).

You can expect a first reply within 7 days. Once the fix is released, the report can be published as an advisory, crediting you if you'd like.

## Supported versions

Only the latest release gets security fixes. Installed plugins get it with `/plugin update`.

## Scope

Beryl runs on your own machine: a local server on `127.0.0.1`, an MCP server and hooks for Claude Code. What it already defends against is listed under "Privacy and security" in the [README](README.md). Reports about ways around those protections are especially welcome, for example:

- reading the dashboard's data or writing to notes without the run's key;
- a repository, web page, note or claude.ai export that makes Beryl write where it shouldn't, or gets content past the MCP filters;
- secrets that reach the dashboard or the MCP unmasked.

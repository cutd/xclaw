# Phase 7: Built-in Skills Design

## Goal

Implement 4 built-in skills (Shell, GitHub, Notes, Web Search) as independent packages in `skills/`, following the existing `SkillPlugin` interface from `@xclaw/core`. Each skill is a separate package loaded by the plugin loader, matching the channel pattern (`channels/*/`).

## Architecture

Each skill lives in `skills/<name>/` with its own `package.json`, `src/`, and tests. Skills implement the `SkillPlugin` interface: a `manifest` with permissions, a `tools` array defining available operations, and an `execute(toolName, args)` method. The existing plugin loader and agent dispatcher already support routing tool calls to skills.

## Shell Skill

`skills/shell/` — `@xclaw/skill-shell`

| Tool | Description |
|------|-------------|
| `shell_exec` | Execute a command, return stdout/stderr/exit code |

Input: `command` (required), `cwd` (optional, defaults to $HOME), `timeout` (optional, defaults to 30000ms), `sandbox` (optional, defaults to config value).

Spawns via `child_process.execFile` (not `exec` — avoids shell injection). Commands are tokenized into binary + args. If sandbox is enabled, wraps through the existing `SandboxManager`. Returns `{ stdout, stderr, exitCode }`. Kills process on timeout.

Permissions: `{ system: ['exec'] }`

## GitHub Skill

`skills/github/` — `@xclaw/skill-github`

| Tool | Description |
|------|-------------|
| `github_issue_create` | Create an issue in a repo |
| `github_issue_list` | List issues with optional filters |
| `github_pr_create` | Create a pull request |
| `github_pr_list` | List pull requests with optional filters |
| `github_repo_list` | List repos for the authenticated user |

All tools shell out to the `gh` CLI and parse JSON output. If `gh` is not installed or not authenticated, returns a clear error message.

Key inputs:
- `github_issue_create`: `repo`, `title`, `body?`, `labels?`
- `github_issue_list`: `repo`, `state?` (open/closed/all), `limit?` (default 10)
- `github_pr_create`: `repo`, `title`, `body?`, `base?`, `head?`
- `github_pr_list`: `repo`, `state?`, `limit?` (default 10)
- `github_repo_list`: `limit?` (default 20)

Permissions: `{ system: ['exec'], network: ['github.com'] }`

## Notes Skill

`skills/notes/` — `@xclaw/skill-notes`

| Tool | Description |
|------|-------------|
| `notes_create` | Create a new Markdown note |
| `notes_read` | Read a note by filename |
| `notes_list` | List notes, optionally filtered by tag |
| `notes_search` | Full-text search across notes |
| `notes_delete` | Delete a note by filename |

Storage: Markdown files in `~/.xclaw/notes/` with YAML frontmatter (title, tags, created timestamp). Filename is slugified title + `.md`, with `-2`, `-3` suffix on collision.

Search is simple case-insensitive substring match on title + content. No vector search — the memory system handles semantic search; notes are explicit user-organized content.

Permissions: `{ filesystem: ['~/.xclaw/notes/'] }`

## Web Search Skill

`skills/web-search/` — `@xclaw/skill-web-search`

| Tool | Description |
|------|-------------|
| `web_fetch` | Fetch a URL, extract readable text |
| `web_search` | Search the web, return results |

`web_fetch`: Uses Node.js `fetch()`, strips HTML tags, decodes entities, collapses whitespace. Returns `{ url, title, content }` truncated to 10,000 characters. 10-second timeout.

`web_search`: Default uses DuckDuckGo HTML scraping (zero-config). If `searxng.url` is in config, uses SearXNG JSON API instead. Returns `{ results: [{ title, url, snippet }] }`, limited to 5 results.

Permissions: `{ network: ['*'] }`

## Testing

Per-skill co-located test files:

- **Shell**: Mock `execFile`, test execution, timeout, sandbox toggle, errors
- **GitHub**: Mock `execFile` for `gh` calls, test JSON parsing, gh-not-found, each tool
- **Notes**: Temp directory for storage, test CRUD, frontmatter, search, filename collisions
- **Web Search**: Mock `fetch()`, test HTML-to-text, truncation, search parsing

Common assertions: manifest correctness, tools array validity, unknown tool handling, graceful error returns.

## Implementation Order

1. Shell skill (foundation — other skills may use exec patterns)
2. Notes skill (filesystem only, no external deps)
3. GitHub skill (depends on exec pattern from Shell)
4. Web Search skill (network-dependent, most complex parsing)

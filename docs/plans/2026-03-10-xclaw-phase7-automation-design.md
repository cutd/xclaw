# Phase 7: Automation, CLI & Deployment Design

## Goal

Complete the Phase 7 gaps: cron scheduling, webhook automation, full CLI command suite, in-chat commands, and deployment artifacts. This builds on the existing built-in skills (Shell, Notes, GitHub, Web Search) to make xclaw a fully operational self-hosted AI assistant.

## Architecture

Cron and webhook engines live in `packages/core/src/` as infrastructure modules. CLI commands live in `packages/cli/src/commands/`. Chat commands are a skill in `skills/chat-commands/`. Deployment files (Dockerfile, docker-compose, install script) live at repo root.

## Cron Scheduler

`packages/core/src/cron/`

### CronJob Interface

```typescript
interface CronJob {
  id: string;
  name: string;
  schedule: string;        // cron expression ("0 9 * * *")
  skill: string;           // skill to invoke
  action: string;          // tool name within the skill
  args?: Record<string, unknown>;
  channel?: string;        // where to send output
  enabled: boolean;
  source: 'config' | 'runtime';
}
```

### Design

Two sources of jobs:

1. **Config file** -- `cron:` section in `xclaw.yaml`, loaded at startup
2. **Runtime** -- created via chat or CLI, stored in `~/.xclaw/cron-jobs.json`

Cron expression parsing uses the `cron-parser` npm package (lightweight, well-maintained) for standard 5-field cron expressions.

On tick, the scheduler checks due jobs, invokes the skill via the existing `AgentDispatcher`, and optionally routes output to a channel. Execution results are logged to the `AuditLog`.

Lifecycle: `start()` / `stop()` methods. The `Runtime` calls `cronScheduler.start()` after gateway boot. `stop()` clears all timers.

### Config Example

```yaml
cron:
  daily_digest:
    schedule: "0 9 * * *"
    skill: email
    action: digest
    channel: telegram
```

## Webhook Engine

`packages/core/src/webhook/`

### WebhookConfig Interface

```typescript
interface WebhookConfig {
  id: string;
  name: string;
  path: string;           // URL path (/webhook/:name)
  skill: string;          // target skill
  action: string;         // tool name
  args?: Record<string, unknown>;
  secret?: string;        // HMAC-SHA256 verification
  enabled: boolean;
}
```

### Design

The WebhookRouter adds HTTP endpoints to the gateway. Uses a lightweight `node:http` server sharing the same port as the gateway. The existing `ws` library supports upgrade handling -- non-upgrade requests go to the HTTP handler.

Flow: HTTP POST hits `/webhook/:name` -> verify HMAC if secret configured -> parse JSON body -> merge body into args -> dispatch to skill via `AgentDispatcher` -> return 200 OK (async processing).

Security: Optional HMAC-SHA256 signature verification (GitHub-style `X-Hub-Signature-256` header). Unverified requests rejected with 401.

### Config Example

```yaml
webhooks:
  github_push:
    path: "/webhook/github"
    skill: "github"
    action: "github_issue_list"
    secret: "${GITHUB_WEBHOOK_SECRET}"
  generic:
    path: "/webhook/notify"
    skill: "shell"
    action: "shell_exec"
    args:
      command: "echo 'webhook received'"
```

## CLI Commands

`packages/cli/src/commands/`

Eight new commands, each a separate file following the existing Commander.js pattern:

| Command | File | Description |
|---------|------|-------------|
| `xclaw init` | `init.ts` | Guided setup: provider type + API key, default model, channels. Writes `~/.xclaw/config.yaml` |
| `xclaw stop` | `stop.ts` | Sends shutdown signal to gateway via WebSocket `gateway.stop` message |
| `xclaw doctor` | `doctor.ts` | Health checks: provider API key, channel connectivity, sandbox backend, memory storage. Reports pass/fail per subsystem |
| `xclaw config` | `config.ts` | `config get <key>`, `config set <key> <value>`, `config list`. Reads/writes config file |
| `xclaw cron` | `cron.ts` | `cron list`, `cron enable <id>`, `cron disable <id>`, `cron run <id>` (manual trigger) |
| `xclaw send` | `send.ts` | One-shot message to gateway, prints response, exits. Useful for scripting |
| `xclaw status` | `status.ts` | Connects to gateway, requests `status.query`, prints channels, sessions, uptime, cron jobs |
| `xclaw sandbox` | `sandbox.ts` | `sandbox info` -- shows backend, mode, resource limits |

Each command exports a `register(program: Command)` function. The main CLI entry point imports and registers all commands.

## Chat Commands

`skills/chat-commands/` -- `@xclaw/skill-chat-commands`

In-conversation slash commands dispatched when a message starts with `/`.

| Command | Tool Name | Description |
|---------|-----------|-------------|
| `/status` | `chat_status` | Current session info: model, token usage, uptime |
| `/new` | `chat_new` | Create a new session, clear context |
| `/reset` | `chat_reset` | Reset current session context without creating new session |
| `/compact` | `chat_compact` | Summarize and compress current context window |
| `/think <level>` | `chat_think` | Set reasoning level (fast/balanced/thorough) |
| `/verbose on\|off` | `chat_verbose` | Toggle verbose output |

Detection: The pipeline checks if `message.content.text` starts with `/`. If matched, it parses the command name and args, then routes to the `chat-commands` skill via the dispatcher. This is a small addition to `pipeline.ts` before the existing agent dispatch step.

Each tool reads/modifies session state via the `SessionManager`. No LLM calls needed -- these are direct operations.

## Deployment

Repo root. Local install first, Docker second.

### Local Install

- `install.sh` -- curl-pipe-bash installer. Clones repo, runs `pnpm install && pnpm build`, creates symlink in `/usr/local/bin`. Detects Node.js version, prompts if < 22.
- Root `package.json` `bin` field points to `packages/cli/dist/index.js` for `npm install -g xclaw` support.

### Docker

- `Dockerfile` -- Multi-stage build. Stage 1: `node:22-alpine`, `pnpm install --frozen-lockfile && pnpm build`. Stage 2: `node:22-alpine`, copy built output, `ENTRYPOINT ["node", "packages/cli/dist/index.js", "start"]`.
- `docker-compose.yml` -- Single service with env var injection (`ANTHROPIC_API_KEY`, etc.), volume mount for `~/.xclaw`, port expose for gateway (18789).
- Multi-arch via `docker buildx --platform linux/amd64,linux/arm64`.

## Testing

- **Cron**: Mock timers, test scheduling/tick/enable/disable, runtime persistence, config loading, audit log entries
- **Webhooks**: Mock HTTP requests, test routing, HMAC verification (valid/invalid/missing), skill dispatch, 404 for unknown paths, arg merging
- **CLI commands**: Mock WebSocket for stop/send/status, mock filesystem for init/config, mock providers for doctor
- **Chat commands**: Mock session manager, test each command, test pipeline slash-command detection
- **Deployment**: Dockerfile build test (optional), install.sh shellcheck

## Implementation Order

1. Cron scheduler (core infrastructure, foundation for automation)
2. Webhook engine (depends on gateway HTTP handling)
3. CLI commands (depends on cron + gateway features)
4. Chat commands skill (depends on pipeline + session manager)
5. Deployment files (independent, can be done last)

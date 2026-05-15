🌐 [Português](README.pt-BR.md)

# Julia Code

AI programming assistant that runs in the terminal, powered by local models via [Ollama](https://ollama.com). Features persistent sessions, long-term memory, autonomous tool execution, and parallel subagent orchestration.

```
┌──────────────────────────────────────────────────┐
│  julia> create a REST server with 3 endpoints    │
│                                                  │
│  🔀 Complex task — spawning 3 subagents...       │
│    → Subagent: endpoint GET /users               │
│    → Subagent: endpoint POST /users              │
│    → Subagent: endpoint DELETE /users/:id         │
│  ✅ 3 completed, no failures                     │
└──────────────────────────────────────────────────┘
```

## Requirements

- **Node.js** >= 18
- **Ollama** running locally (`http://localhost:11434`)

## Installation

```bash
npm i -g juliacode
```

## Usage

### TUI (interactive mode)

```bash
juju                             # start chat
juju --session <id>              # resume existing session
```

### HTTP Gateway

```bash
juju --gateway                                  # default: 127.0.0.1:18800
juju --gateway --host 0.0.0.0 --port 3000      # custom host/port
```

**Endpoints:**

| Method | Route                    | Description          |
| ------ | ------------------------ | -------------------- |
| `GET`  | `/health`                | Health check         |
| `GET`  | `/sessions`              | List sessions        |
| `POST` | `/sessions`              | Create session       |
| `GET`  | `/sessions/:id`          | Session details      |
| `GET`  | `/sessions/:id/messages` | Session messages     |
| `POST` | `/chat`                  | Chat (full response) |
| `POST` | `/chat/stream`           | Chat (SSE streaming) |

## Tools

Julia has access to 10 tools that it executes autonomously:

| Tool       | Description                         |
| ---------- | ----------------------------------- |
| `exec`     | Run shell commands (git, npm, etc.) |
| `read`     | Read files with line numbers        |
| `write`    | Create/overwrite files              |
| `edit`     | Replace text segments in files      |
| `glob`     | Search files by glob pattern        |
| `grep`     | Search content with regex           |
| `fetch`    | Access URLs, APIs, and web pages    |
| `memory`   | Persistent memories across sessions |
| `sessions` | Manage saved sessions               |
| `subagent` | Orchestrate parallel subagents      |

## Subagents (ACP)

When enabled, Julia automatically detects complex, parallelizable tasks and spawns independent subagents with their own sessions. Each subagent can use a different model.

```
Orchestration Run (run_id)
├── SubagentRun 1 — web scraper   [gpt-oss:120b-cloud]   completed 2.3s
├── SubagentRun 2 — csv processor [qwen3:8b]              completed 1.8s
└── SubagentRun 3 — api server    [qwen3.5:397b-cloud]    completed 3.1s
```

All runs are persisted in SQLite with status lifecycle (`queued` → `running` → `completed`/`failed`), timestamps, and duration.

## Model Context Protocol (MCP)

To connect a new MCP server, edit `~/.juliacode/settings.json` and add the `mcpServers` section:

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/home/user"],
      "env": {}
    }
  }
}
```

Each entry in mcpServers is an MCP server with:

| Field     | Required | Description                                 |
| --------- | -------- | ------------------------------------------- |
| `command` | yes      | Command to start the server                 |
| `args`    | no       | Array of arguments (default: `[]`)          |
| `env`     | no       | Extra environment variables for the process |

Example with multiple servers:

```json
{
  "models": { "default": "qwen3:8b" },
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/home/user"]
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": { "GITHUB_TOKEN": "ghp_yourtoken" }
    },
    "sqlite": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-sqlite",
        "/path/to/database.db"
      ]
    }
  }
}
```

When Julia Code starts, it connects to each server and automatically registers their tools. The agent will see tools named like `mcp__filesystem__read_file`,
`mcp__github__create_issue`, etc. It can use them normally during conversation. To remove a server, just delete the entry and restart.

## Configuration

### Settings file (`~/.juliacode/settings.json`)

```json
{
  "models": {
    "provider": "ollama",
    "baseUrl": "http://localhost:11434",
    "default": "qwen3:8b"
  },
  "agent": {
    "maxToolIterations": 10
  },
  "session": {
    "compactionThreshold": 6000,
    "compactionKeepRecent": 6
  },
  "storage": {
    "dbPath": "./data/julia.db"
  },
  "acp": {
    "enabled": false,
    "autoOrchestrate": false,
    "maxConcurrent": 3,
    "subagentMaxIterations": 15,
    "defaultModel": null
  },
  "memory": {
    "semantic": {
      "enabled": false,
      "provider": "ollama",
      "embeddingModel": "nomic-embed-text",
      "rankingWeights": { "similarity": 0.6, "importance": 0.3, "recency": 0.1 },
      "recencyHalflifeDays": 30,
      "maxMemories": 5,
      "availabilityCheckTtlMs": 30000,
      "autoBackfillOnStart": false
    }
  }
}
```

### Custom skills (`~/.juliacode/skills/`)

Drop your own skills into `~/.juliacode/skills/` to extend Julia. They are loaded on every session, globally — no need to duplicate per project.

Layout follows the same pattern as Claude Code: one directory per skill, with a `SKILL.md` file inside.

```
~/.juliacode/skills/
├── review-pr/
│   └── SKILL.md
└── deploy-checklist/
    └── SKILL.md
```

Each `SKILL.md` is a Markdown document with optional YAML frontmatter:

```markdown
---
name: review-pr
description: Review a pull request against the team conventions
when_to_use: User asks to "review PR" or pastes a diff
argument_hint: <pr-number-or-url>
user_invocable: true
---

Your skill prompt body goes here. Use $ARGUMENTS to inject the user-provided argument.
```

Behavior:
- The skill name comes from the `name` frontmatter; if absent, it defaults to the directory name.
- Skills with `user_invocable: true` show up as slash commands (e.g. `/review-pr`).
- All custom skills are loaded into the system prompt under a `User-Defined Skills (LOWER TRUST)` section — they cannot override system instructions.
- On name collision with a built-in default skill, the default wins.
- Each `SKILL.md` is limited to 50 KB and is scanned for prompt-injection patterns before being loaded; rejected files are logged and skipped.
- Subdirectories without a `SKILL.md` are skipped and logged.

### Hooks (`~/.juliacode/settings.json`)

Configure shell commands that fire at specific points of the agent loop. The schema mirrors Claude Code's hooks system 1:1.

> ⚠️ Hooks run arbitrary shell commands with your user's permissions on every matching event. Audit any hook you add. Julia does not sandbox them.

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "exec",
        "hooks": [
          { "type": "command", "command": "audit-shell.sh", "timeout": 5000 }
        ]
      }
    ],
    "UserPromptSubmit": [
      { "hooks": [{ "command": "echo 'Reminder: review security'" }] }
    ]
  }
}
```

Supported events: `PreToolUse`, `PostToolUse`, `UserPromptSubmit`, `Stop`, `SubagentStop`, `SessionStart`, `Notification`, `PreCompact`.

Each hook receives a JSON payload on stdin (`session_id`, `cwd`, `hook_event_name`, plus event-specific fields like `tool_name`, `tool_input`, `prompt`, `source`, etc.). Control Julia via:

- **Exit code 0** — success. If stdout is JSON `{ "decision": "block" | "approve", "reason": "...", "hookSpecificOutput": { "additionalContext": "..." } }`, Julia honors it. For `UserPromptSubmit`, `SessionStart`, and `PreCompact`, raw stdout is also accepted and injected as additional context.
- **Exit code 2** — blocking error. `stderr` becomes the block reason and is surfaced to the agent.
- **Other non-zero** — non-blocking error. Logged via the MCP log channel; agent continues.

The `matcher` field is a regex tested against the tool name for `PreToolUse` / `PostToolUse`. Omit it (or use `*`) to match every tool. For non-tool events the field has no effect.

Anti-loop guard: when a `Stop` or `SubagentStop` hook returns `decision: "block"`, Julia re-enters the loop once and re-fires the hook with `stop_hook_active: true`. The hook is expected to respect that flag on the second pass.

The Julia environment exposes `JULIA_HOOK=1` and `JULIA_HOOK_EVENT=<event>` to every hook process — useful for detecting recursion or branching logic. Default timeout per command is 60 s and can be overridden with the `timeout` field (in ms). `~/.juliacode/settings.json` itself is read-only for Julia's own tools, so the hooks block must be edited by hand — the same workflow used for `mcpServers`.

### Semantic memory (optional)

With `memory.semantic.enabled: false` (default), Julia injects the 30 most-recent memories into the system prompt, just like before.

With `memory.semantic.enabled: true`, Julia uses embeddings (via Ollama `nomic-embed-text`) to rank memories by relevance to the current user input. Flow:

1. Pull `nomic-embed-text` once: `ollama pull nomic-embed-text`.
2. Flip `memory.semantic.enabled` to `true` in `~/.juliacode/settings.json`.
3. Run `juju memory backfill` to populate embeddings for existing memories.
4. Set `memory.semantic.autoBackfillOnStart: true` if you want new boots to resume backfilling automatically.

If the embedding provider is unavailable at any point (Ollama down, model missing, request fails), Julia degrades transparently to the legacy recent-memories injection — the app never breaks because of a missing embedding.

### Repo intelligence (local)

Julia can build a local semantic index of your project so that relevant code is automatically pulled into the LLM context — an offline equivalent of Cursor's repo-aware feature, powered by the same Ollama `nomic-embed-text` model used for memories. Nothing leaves the machine. Two pieces:

**Automatic semantic retrieval.** Every turn, the user's prompt is embedded and ranked against indexed code chunks by cosine similarity; the top 5 (token-budgeted, same-file chunks merged) are injected as a system block alongside memories. Gated by a heuristic that skips greetings, meta-questions, and short prompts without code-like tokens.

**`@filename` mentions.** Reference any file by typing `@<path>` in your message — the file's content is expanded inline before the prompt is sent. Tab-complete via the fuzzy dropdown that appears when you type `@`. If the path doesn't exist, fuzzy matching against the index salvages typos (e.g., `@app.tsx` → `src/tui/app.tsx`). Mentions inside fenced or inline code blocks are ignored, absolute paths and `../` traversal are rejected, files >50 KB are truncated, and binaries are refused.

**Indexing flow:**

1. Pull `nomic-embed-text` once: `ollama pull nomic-embed-text`.
2. On first startup, the auto-indexer builds the index in the background from `git ls-files` (respects `.gitignore`, skips binaries and files >1 MB, caps at 5 000 files).
3. Use `/index` to re-index incrementally, `/index force` to rebuild from scratch, `/index status` to inspect meta, `/index abort` to cancel an in-progress run.

**Storage.** Chunks (80 lines with 20-line overlap) live in the `code_chunks` table with content/file hashes for fast incremental re-index — unmodified files skip chunking entirely, and chunks whose content didn't change preserve their existing embeddings.

**Degradation.** If Ollama is down at index time, chunks are inserted without embeddings and the next `/index` resumes from there. If Ollama is down at query time, the retrieval block is omitted silently — `@filename` mentions still work because they're pure file I/O. The index drifting from the current `HEAD` triggers a one-time stale hint suggesting a `/index` refresh.

## Architecture

```
juju.ts                          # Entry point (CLI)
src/
├── agent/
│   ├── loop.ts                  # Agent loop (LLM ↔ tools)
│   ├── subagent.ts              # Subagent manager + orchestration
│   ├── queue.ts                 # Execution queue
│   └── context.ts               # Context building + compaction
├── config/
│   ├── index.ts                 # Config loading
│   └── workspace.ts             # Workspace directory
├── gateway/
│   └── server.ts                # HTTP REST API
├── providers/
│   ├── registry.ts              # Provider registry
│   └── ollama.ts                # Ollama provider
├── session/
│   ├── db.ts                    # SQLite schema (7 tables)
│   └── manager.ts               # CRUD sessions, messages, memories, runs
├── skills/
│   ├── loader.ts                # Skills loader
│   └── defaults/                # Built-in skills (base, coder, memory, subagent)
├── tools/
│   ├── registry.ts              # Tool registry
│   ├── exec.ts, read.ts, ...    # Implementations
│   └── subagent.ts              # Subagent tool
└── tui/
    └── app.tsx                  # Terminal interface (React + Ink)
```

### Database

SQLite with WAL mode. 9 tables:

- **sessions** — conversations with title, model, tokens
- **messages** — user/assistant/tool messages with tool_calls
- **compactions** — summaries of old context
- **memories** — persistent memories with categories
- **orchestration_runs** — subagent batches with status/duration
- **subagent_runs** — individual tasks with full lifecycle
- **code_chunks** — indexed source chunks with embeddings + content hashes
- **code_index_meta** — singleton key/value store for index metadata (HEAD sha, last run, model)

## Stack

| Layer    | Technology              |
| -------- | ----------------------- |
| Runtime  | Node.js (ESM)           |
| Language | TypeScript              |
| UI       | React 18 + Ink          |
| Database | SQLite (better-sqlite3) |
| LLM      | Ollama                  |
| Tests    | Vitest                  |

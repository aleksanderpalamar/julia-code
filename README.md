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

### Semantic memory (optional)

With `memory.semantic.enabled: false` (default), Julia injects the 30 most-recent memories into the system prompt, just like before.

With `memory.semantic.enabled: true`, Julia uses embeddings (via Ollama `nomic-embed-text`) to rank memories by relevance to the current user input. Flow:

1. Pull `nomic-embed-text` once: `ollama pull nomic-embed-text`.
2. Flip `memory.semantic.enabled` to `true` in `~/.juliacode/settings.json`.
3. Run `juju memory backfill` to populate embeddings for existing memories.
4. Set `memory.semantic.autoBackfillOnStart: true` if you want new boots to resume backfilling automatically.

If the embedding provider is unavailable at any point (Ollama down, model missing, request fails), Julia degrades transparently to the legacy recent-memories injection — the app never breaks because of a missing embedding.

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

SQLite with WAL mode. 7 tables:

- **sessions** — conversations with title, model, tokens
- **messages** — user/assistant/tool messages with tool_calls
- **compactions** — summaries of old context
- **memories** — persistent memories with categories
- **orchestration_runs** — subagent batches with status/duration
- **subagent_runs** — individual tasks with full lifecycle

## Stack

| Layer    | Technology              |
| -------- | ----------------------- |
| Runtime  | Node.js (ESM)           |
| Language | TypeScript              |
| UI       | React 18 + Ink          |
| Database | SQLite (better-sqlite3) |
| LLM      | Ollama                  |
| Tests    | Vitest                  |

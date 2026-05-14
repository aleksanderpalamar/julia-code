🌐 [English](README.md)

# Julia Code

Assistente de programacao IA que roda no terminal, alimentada por modelos locais via [Ollama](https://ollama.com). Possui sessoes persistentes, memoria de longo prazo, execucao de ferramentas autonoma e orquestracao paralela de subagentes.

```
┌──────────────────────────────────────────────────┐
│  julia> crie um servidor REST com 3 endpoints    │
│                                                  │
│  🔀 Tarefa complexa — spawnando 3 subagentes...  │
│    → Subagente: endpoint GET /users              │
│    → Subagente: endpoint POST /users             │
│    → Subagente: endpoint DELETE /users/:id        │
│  ✅ 3 completados, nenhuma falha                 │
└──────────────────────────────────────────────────┘
```

## Requisitos

- **Node.js** >= 18
- **Ollama** rodando localmente (`http://localhost:11434`)

## Instalacao

```bash
npm i -g juliacode
```

## Uso

### TUI (modo interativo)

```bash
juju                             # iniciar chat
juju --session <id>              # retomar sessao existente
```

### Gateway HTTP

```bash
juju --gateway                                  # padrao: 127.0.0.1:18800
juju --gateway --host 0.0.0.0 --port 3000      # host/porta customizados
```

**Endpoints:**

| Metodo | Rota                     | Descricao                |
| ------ | ------------------------ | ------------------------ |
| `GET`  | `/health`                | Health check             |
| `GET`  | `/sessions`              | Listar sessoes           |
| `POST` | `/sessions`              | Criar sessao             |
| `GET`  | `/sessions/:id`          | Detalhes da sessao       |
| `GET`  | `/sessions/:id/messages` | Mensagens da sessao      |
| `POST` | `/chat`                  | Chat (resposta completa) |
| `POST` | `/chat/stream`           | Chat (SSE streaming)     |

## Ferramentas

A Julia tem acesso a 10 ferramentas que executa autonomamente:

| Ferramenta | Descricao                                |
| ---------- | ---------------------------------------- |
| `exec`     | Executar comandos shell (git, npm, etc.) |
| `read`     | Ler arquivos com numeros de linha        |
| `write`    | Criar/sobrescrever arquivos              |
| `edit`     | Substituir trechos de texto em arquivos  |
| `glob`     | Buscar arquivos por padrao glob          |
| `grep`     | Buscar conteudo com regex                |
| `fetch`    | Acessar URLs, APIs e paginas web         |
| `memory`   | Memorias persistentes entre sessoes      |
| `sessions` | Gerenciar sessoes salvas                 |
| `subagent` | Orquestrar subagentes paralelos          |

## Subagentes (ACP)

Quando habilitado, a Julia detecta automaticamente tarefas complexas e paralelizaveis, spawnando subagentes independentes com sessoes proprias. Cada subagente pode usar um modelo diferente.

```
Orchestration Run (run_id)
├── SubagentRun 1 — web scraper   [gpt-oss:120b-cloud]   completed 2.3s
├── SubagentRun 2 — csv processor [qwen3:8b]              completed 1.8s
└── SubagentRun 3 — api server    [qwen3.5:397b-cloud]    completed 3.1s
```

Todas as runs sao persistidas no SQLite com status lifecycle (`queued` → `running` → `completed`/`failed`), timestamps e duracao.

## Model Context Protocol (MCP)

Para conectar um novo servidor de mcp basta editar `~/.juliacode/settings.json` e adicionar a sessão `mcpServers`:

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-filesystem",
        "/home/usuario"
      ],
      "env": {}
    }
  }
}
```

Cada entrada em mcpServers é um servidor MCP com:

| Campo     | Obrigatorio | Descricao                                    |
| --------- | ----------- | -------------------------------------------- |
| `command` | sim         | Comando para iniciar o servidor              |
| `args`    | nao         | Array de argumentos (default: `[]`)          |
| `env`     | nao         | Variaveis de ambiente extras para o processo |

Exemplo com múltiplos servidores:

```json
{
  "models": { "default": "qwen3:8b" },
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/home/usuario"]
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": { "GITHUB_TOKEN": "ghp_seutoken" }
    },
    "sqlite": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-sqlite", "/caminho/banco.db"]
    }
  }
}
```

Ao iniciar o Julia Code, ela conecta a cada servidor e registra as tools automaticamente. O agente verá tools com nomes como `mcp__filesystem__read_file`,
`mcp__github__create_issue`, etc. E pode usá-las normalmente durante a conversa, se quiser remover um servidor, basta apagar a entrada e reiniciar.

## Configuração

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

### Skills customizadas (`~/.juliacode/skills/`)

Coloque suas próprias skills em `~/.juliacode/skills/` para estender a Julia. Elas são carregadas em toda sessão, globalmente — não precisa duplicar por projeto.

O layout segue o mesmo padrão do Claude Code: um diretório por skill, com um arquivo `SKILL.md` dentro.

```
~/.juliacode/skills/
├── review-pr/
│   └── SKILL.md
└── deploy-checklist/
    └── SKILL.md
```

Cada `SKILL.md` é um documento Markdown com frontmatter YAML opcional:

```markdown
---
name: review-pr
description: Revisar um pull request contra as convenções do time
when_to_use: Quando o usuário pedir "revisar PR" ou colar um diff
argument_hint: <numero-do-pr-ou-url>
user_invocable: true
---

O corpo do prompt da skill vai aqui. Use $ARGUMENTS para injetar o argumento informado pelo usuário.
```

Comportamento:
- O nome da skill vem do `name` do frontmatter; se ausente, é o nome do diretório.
- Skills com `user_invocable: true` aparecem como slash commands (ex.: `/review-pr`).
- Todas as skills customizadas entram no system prompt numa seção `User-Defined Skills (LOWER TRUST)` — elas não conseguem sobrescrever instruções do sistema.
- Em caso de colisão de `name` com uma default embutida, a default ganha.
- Cada `SKILL.md` é limitado a 50 KB e passa por scan de padrões de prompt injection antes de ser carregado; arquivos rejeitados são logados e ignorados.
- Subdiretórios sem `SKILL.md` são ignorados e logados.

### Hooks (`~/.juliacode/settings.json`)

Configure comandos shell que disparam em pontos específicos do agent loop. O schema espelha o sistema de hooks do Claude Code 1:1.

> ⚠️ Hooks rodam comandos shell arbitrários com as permissões do seu usuário a cada evento que casar. Audite qualquer hook antes de adicionar. A Julia não faz sandbox.

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
      { "hooks": [{ "command": "echo 'Lembrete: revisar segurança'" }] }
    ]
  }
}
```

Eventos suportados: `PreToolUse`, `PostToolUse`, `UserPromptSubmit`, `Stop`, `SubagentStop`, `SessionStart`, `Notification`, `PreCompact`.

Cada hook recebe um payload JSON via stdin (`session_id`, `cwd`, `hook_event_name`, além de campos específicos por evento como `tool_name`, `tool_input`, `prompt`, `source`, etc.). Controle a Julia via:

- **Exit code 0** — sucesso. Se o stdout for JSON `{ "decision": "block" | "approve", "reason": "...", "hookSpecificOutput": { "additionalContext": "..." } }`, a Julia respeita. Para `UserPromptSubmit`, `SessionStart` e `PreCompact`, stdout cru também é aceito e injetado como contexto adicional.
- **Exit code 2** — erro bloqueante. `stderr` vira a razão do block e é exposta ao agent.
- **Outros não-zero** — erro não bloqueante. Logado no canal MCP; o agent continua.

O campo `matcher` é uma regex testada contra o nome da tool em `PreToolUse` / `PostToolUse`. Omita (ou use `*`) para casar com tudo. Em eventos que não são de tool, o campo não tem efeito.

Anti-loop: quando um hook de `Stop` ou `SubagentStop` retorna `decision: "block"`, a Julia re-entra no loop uma vez e dispara o hook de novo com `stop_hook_active: true`. O hook deve respeitar essa flag na segunda chamada.

O ambiente da Julia expõe `JULIA_HOOK=1` e `JULIA_HOOK_EVENT=<evento>` para todo processo de hook — útil para detectar recursão ou ramificar lógica. Timeout padrão por comando é 60s, customizável via campo `timeout` (em ms). `~/.juliacode/settings.json` é read-only para as tools da Julia, então o bloco `hooks` deve ser editado à mão — mesmo workflow usado para `mcpServers`.

### Memória semântica (opcional)

Com `memory.semantic.enabled: false` (default), a Julia injeta as 30 memórias mais recentes no system prompt — mesmo comportamento de antes.

Com `memory.semantic.enabled: true`, a Julia usa embeddings (via Ollama `nomic-embed-text`) para ranquear memórias por relevância à entrada atual. Fluxo:

1. Baixe o modelo de embedding: `ollama pull nomic-embed-text`.
2. Flipe `memory.semantic.enabled` para `true` em `~/.juliacode/settings.json`.
3. Rode `juju memory backfill` para popular embeddings das memórias já existentes.
4. Se quiser que boots subsequentes retomem o backfill automaticamente, habilite `memory.semantic.autoBackfillOnStart: true`.

Se o provider de embedding ficar indisponível a qualquer momento (Ollama offline, modelo faltando, erro de rede), a Julia degrada transparentemente para a injeção legada de memórias recentes — a aplicação nunca quebra por falta de embedding.

## Arquitetura

```
juju.ts                          # Entry point (CLI)
src/
├── agent/
│   ├── loop.ts                  # Agent loop (LLM ↔ tools)
│   ├── subagent.ts              # Subagent manager + orchestracao
│   ├── queue.ts                 # Fila de execucao
│   └── context.ts               # Build de contexto + compactacao
├── config/
│   ├── index.ts                 # Carregamento de config
│   └── workspace.ts             # Diretorio de workspace
├── gateway/
│   └── server.ts                # HTTP REST API
├── providers/
│   ├── registry.ts              # Registro de providers
│   └── ollama.ts                # Provider Ollama
├── session/
│   ├── db.ts                    # Schema SQLite (7 tabelas)
│   └── manager.ts               # CRUD sessoes, mensagens, memorias, runs
├── skills/
│   ├── loader.ts                # Loader de skills
│   └── defaults/                # Skills built-in (base, coder, memory, subagent)
├── tools/
│   ├── registry.ts              # Registro de ferramentas
│   ├── exec.ts, read.ts, ...    # Implementacoes
│   └── subagent.ts              # Tool de subagentes
└── tui/
    └── app.tsx                  # Interface terminal (React + Ink)
```

### Banco de dados

SQLite com WAL mode. 7 tabelas:

- **sessions** — conversas com titulo, modelo, tokens
- **messages** — mensagens user/assistant/tool com tool_calls
- **compactions** — resumos de contexto antigo
- **memories** — memorias persistentes com categorias
- **orchestration_runs** — batches de subagentes com status/duracao
- **subagent_runs** — tasks individuais com lifecycle completo

## Stack

| Camada    | Tecnologia              |
| --------- | ----------------------- |
| Runtime   | Node.js (ESM)           |
| Linguagem | TypeScript              |
| UI        | React 18 + Ink          |
| Banco     | SQLite (better-sqlite3) |
| LLM       | Ollama                  |
| Testes    | Vitest                  |

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

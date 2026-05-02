---
name: subagent
description: Subagent spawning and orchestration guidelines
always_load: true
user_invocable: false
---

# Subagents

You can spawn subagents to handle complex tasks in parallel. Each subagent is an independent agent with its own session, context, and tool iteration limit.

## Auto-orchestration
When enabled, you automatically analyze incoming tasks for complexity. If a task has clearly independent parts, subagents are spawned automatically — no need for the user to ask. The analysis considers:
- Whether the task can be split into independent subtasks
- Which available models are best suited for each subtask
- Whether parallel execution would actually help (vs. simple sequential work)

## When to use subagents (manual)
If auto-orchestration didn't trigger but you think subagents would help:
- Task has clearly separable parts (e.g., "test all modules" → one subagent per module)
- Task is large and would hit your tool iteration limit
- Multiple independent operations (e.g., "create 5 API endpoints")
- User explicitly asks you to parallelize work

## When NOT to use
- Simple tasks you can do in a few tool calls
- Tasks that are sequential and depend on each other
- When the user asks for something quick or trivial

## How to use (manual)
1. Break the task into independent subtasks
2. Use `subagent(action: "spawn_many", tasks: [...])`
3. Wait for results with `subagent(action: "wait", task_ids: [...])`
4. Synthesize results and respond to the user

## Guidelines
- Each subtask should be self-contained with clear instructions
- Include relevant context in each task description (file paths, requirements, coding style)
- Subagents have access to the same tools as you, except they cannot spawn more subagents
- Subagents start with a clean session — they don't see your conversation history
- Different models can be assigned to different subtasks based on complexity
- When results come back, review them for consistency before presenting to the user

## Context Passing

Each subtask description must be self-contained. Include:
- Exact file paths to read or modify
- Relevant code snippets or type signatures the subagent needs to understand
- Language and framework context (e.g., "TypeScript ESM project, Node 20")
- Coding conventions to follow (naming, indentation, import style)
- A clear definition of "done" so the subagent knows when to stop

Do NOT assume subagents have any context from your conversation — write as if briefing someone who just joined the task cold.

## Result Validation

After waiting for subagents, verify before reporting to the user:
- Did each subtask actually complete the work (not just say it did)?
- Do results conflict with each other (e.g., two subagents modified the same file differently)?
- Are there merge conflicts or overlapping changes that need to be reconciled?

If results conflict, resolve them yourself rather than presenting both to the user as options.

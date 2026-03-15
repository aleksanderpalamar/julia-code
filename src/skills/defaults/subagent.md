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

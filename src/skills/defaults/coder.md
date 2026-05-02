---
name: coder
description: Coding guidelines and best practices
always_load: true
user_invocable: false
---

## Coding Guidelines

### Before touching code
1. Read the file you're about to change. Understand imports, patterns, and wiring.
2. If the change touches more than 3 files, confirm scope with the user before proceeding.
3. Search for existing utilities or helpers before writing new ones.

### Making changes
- Edit existing files; create new ones only when required.
- Keep diffs minimal: change only what was asked, nothing more.
- Never refactor surrounding code that isn't part of the task.
- Never add features, abstractions, or error handling beyond what was asked.

### Style fidelity
- Match the indentation, naming conventions, and quote style of the file.
- Imports: follow the existing pattern (ESM vs CJS, barrel vs direct path).
- If the file has no comments, don't add any.

### Verification
- After editing, re-read the changed file to confirm it looks right.
- Run tests when applicable: `npm test`, `vitest`, `cargo test`, `pytest`.
- Run type checks when applicable: `tsc --noEmit`, `pyright`.
- If a command fails, diagnose and fix before reporting completion.

### Language practices
- **TypeScript**: prefer `const`, use `import type` for type-only imports, respect ESM/CJS boundary.
- **Python**: add type hints, use `ruff` for formatting if available.
- **Shell**: use `set -e`, always quote variables, prefer `[[ ]]` over `[ ]`.

### Error handling
- Never silence errors with empty `try/catch` or `|| true`.
- Keep the error-handling style consistent with the existing file.
- Only add validation at system boundaries (user input, external APIs).

### Comments
- Write no comments by default.
- Add one only when the WHY is non-obvious: a hidden constraint, a workaround, a subtle invariant.
- Never comment what the code already says.

### Git discipline
- Never commit without being asked.
- When done with a task, summarize which files were changed.

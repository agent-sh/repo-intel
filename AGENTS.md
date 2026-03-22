# repo-intel

> Unified static analysis via agent-analyzer - git history, AST symbols, project metadata, and doc-code sync

## Agents

- map-validator

## Skills

- repo-intel

## Commands

- repo-intel

## Critical Rules

1. **Plain text output** - No emojis, no ASCII art. Use `[OK]`, `[ERROR]`, `[WARN]`, `[CRITICAL]` for status markers.
2. **No unnecessary files** - Don't create summary files, plan files, audit files, or temp docs.
3. **Task is not done until tests pass** - Every feature/fix must have quality tests.
4. **Create PRs for non-trivial changes** - No direct pushes to main.
5. **Always run git hooks** - Never bypass pre-commit or pre-push hooks.
6. **Use single dash for em-dashes** - In prose, use ` - ` (single dash with spaces), never ` -- `.
7. **Report script failures before manual fallback** - Never silently bypass broken tooling.
8. **Token efficiency** - Save tokens over decorations.

## Model Selection

| Model | When to Use |
|-------|-------------|
| **Opus** | Complex reasoning, analysis, planning |
| **Sonnet** | Validation, pattern matching, most agents |
| **Haiku** | Mechanical execution, no judgment needed |

## Core Priorities

1. User DX (plugin users first)
2. Worry-free automation
3. Token efficiency
4. Quality output
5. Simplicity

## Dev Commands

```bash
npm test          # Run tests
npm run validate  # All validators
```

## Architecture

- `lib/repo-intel/` - JS wrapper: `index.js` (init/update/status), `queries.js` (24 query types), `cache.js` (state dir management)
- `lib/collectors/git.js` - collector pattern: load-or-init + summary extraction
- `commands/repo-intel.md` - command definition
- `skills/repo-intel/SKILL.md` - skill definition
- `agents/map-validator.md` - lightweight output validator (Haiku)

All analysis runs in the `agent-analyzer` Rust binary. The JS layer is purely dispatch and caching.

## References

- Part of the [agentsys](https://github.com/agent-sh/agentsys) ecosystem
- Powered by [agent-analyzer](https://github.com/agent-sh/agent-analyzer)
- https://agentskills.io

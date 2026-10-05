# repo-intel

This repo is the repo-intel plugin: unified static analysis through agent-analyzer (git history, AST symbols, project metadata, doc-code sync). Part of the [agentsys](https://github.com/agent-sh/agentsys) ecosystem; skills follow https://agentskills.io.

## Rules

- Output is plain text: no emojis or ASCII art. Status markers are `[OK]`, `[ERROR]`, `[WARN]`, `[CRITICAL]`.
- Commit only product files. Summaries, plans and audit notes belong in the PR or the conversation.
- A change is done when its tests pass; a feature or fix comes with a test that covers it.
- Non-trivial changes go through a PR, not a direct push to main. Run the git hooks; do not bypass them.
- In prose use ` - ` (single dash with spaces), not ` -- `.
- If a script fails, report the failure before doing the step by hand, so broken tooling gets fixed.
- Agent models: Opus for complex reasoning and planning, Sonnet for validation and most agents, Haiku for mechanical work.
- Priorities, in order: plugin users' experience, automation that needs no babysitting, token efficiency, output quality, simplicity.

## Layout

- `commands/repo-intel.md`: the `/repo-intel` command (init, update, enrich, status, query, embed).
- `skills/repo-intel/SKILL.md`: the skill; the query catalog is `skills/repo-intel/references/queries.md`.
- `agents/`: `map-validator` (sanity check of a build summary), `repo-intel-summarizer` and `repo-intel-weighter` (the two Haiku agents behind `enrich`).
- `scripts/repo-intel.js`: the CLI every action runs through; it prints JSON.
- `lib/repo-intel/`: the JS wrapper: init, update and status in `lib/repo-intel/index.js`, plus `lib/repo-intel/queries.js`, `lib/repo-intel/cache.js` (state dir) and `lib/repo-intel/enrich.js`.
- `lib/collectors/git.js`: the collector pattern, load-or-init plus summary extraction.

All analysis runs in the `agent-analyzer` Rust binary; the JS layer only dispatches and caches. `lib/` is synced from [agent-core](https://github.com/agent-sh/agent-core), so change library code there.

## Checks

```bash
npm test          # module load, enrich, preference, CLI and authorization tests
npm run validate  # module load only
agnix .           # agent config lint
```

User-visible changes get a CHANGELOG entry under `[Unreleased]`.

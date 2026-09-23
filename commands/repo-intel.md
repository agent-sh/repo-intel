---
description: Unified static analysis - git history, AST symbols, project metadata, doc-code sync, plus LLM-augmented file descriptors and a 3-depth narrative summary via post-init Haiku agents.
codex-description: 'Use when user asks to "analyze git history", "show hotspots", "file coupling", "code ownership", "bus factor", "bugspots", "repo-intel init/update/enrich/status/query", "show symbols", "find dependents", "find <concept>", "find auth code", "pain spots", "entry points", "summarize this repo", "repo summary", "what does this project do", "enrich repo-intel", "generate descriptors". Builds and queries a cached repo-intel artifact and optionally enriches it with Haiku-generated descriptors and a narrative summary.'
argument-hint: "init|update|enrich|status|query <type>|embed <action> [--since=<date>] [--max-commits=<n>] [--limit=<n>] [--depth=1|3|10] [--min-changes=<n>] [<file-or-concept>]"
allowed-tools: Bash(git:*), Bash(node:*), Read, Write, Task, AskUserQuestion
---

# /repo-intel

Build, refresh and query the repo-intel artifact (`{stateDir}/repo-intel.json`): git history, AST symbols, project metadata and doc-code links, computed by the `agent-analyzer` binary. `enrich` adds LLM-written file descriptors and a narrative summary.

Arguments: `$ARGUMENTS`. Default action: `status`.

## Run

Every action goes through the plugin's CLI, from the repository root. It prints JSON and exits non-zero on failure.

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/repo-intel.js <action> [args]
```

`${CLAUDE_PLUGIN_ROOT}` is this plugin's root; on other harnesses, use the directory that holds this `commands/` folder. Pass the user's arguments through as given.

- `init [--since=DATE] [--max-commits=N]`: full scan. It refuses when a map exists; offer `update`, or `--force` to rebuild.
- `update`: incremental, new commits only. Prefer it over `init` when a map exists.
- `status`: whether a map exists, its commit, age, and how far behind HEAD it is.
- `query <type> [arg]`: run `node <cli> queries` for the list. Types that take an argument: `coupling`, `ownership`, `file-history`, `symbols`, `area-of` (a path), `diff-risk` (comma-separated files), `dependents` (a symbol, optional `--file=`), `community-health` (an id), `find` (a concept, several words allowed). `summary` needs `enrich` first.
- `embed status|update|reset`: the optional embedder.
- `enrich`: see below.

The binary downloads on first use into the agent-sh bin directory in the home directory. If that fails, report the error and the install hint from the JSON; do not fall back to guessing from `git log`.

## Enrich

1. `node <cli> enrich plan` prints the summarizer prompt, the weighter batches (up to 500 of the most active files, 30 per batch), and whether an embedder choice exists.
2. Spawn `repo-intel:repo-intel-summarizer` with the summarizer prompt and each `repo-intel:repo-intel-weighter` batch with its prompt. Batches are independent; run them in parallel. Without Task, do the summarizer and weighter work yourself from those agents' instructions (this plugin's `agents/`).
3. Save each reply to a file and store it: `node <cli> enrich apply-summary <file>` and `node <cli> enrich apply-descriptors <file>` per batch. The CLI parses the marker blocks and drops paths the map does not know. A failed batch is reported and skipped; the rest still land.
4. Embedder: if `embed.chosen` is false and the user is present, ask once: `none` (default), `small` (~30 MB model), or `big` (~195 MB), and for small or big the detail (`balanced` recommended, `compact`, `maximum`). Record it with `node <cli> embed choose <choice> [--detail=...]`. If AskUserQuestion is not available or the run is unattended, skip the question and leave the choice unset: downloading a model is the user's call. When `embed.enabled` is true, run `node <cli> embed update`.

## Report

```markdown
## Repo Intel: <action>

<the numbers that answer the request: commits and files for init/update; age and commits behind for status; the ranked rows for a query, top 10 unless --limit>

### Notes
- <warnings: stale map, failed batches, binary download problems>
```

For a query, show what the user asked about, not the raw JSON: a short table with the path and the score or count that ranks it, and one line on what stands out. After `init` or `update`, flag a map with 0 files or no languages as a failed scan.

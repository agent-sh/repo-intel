# repo-intel

Unified static analysis for AI agents - git history, AST symbols, project metadata, doc-code sync, and (optionally) LLM-augmented file descriptors plus a 3-depth narrative summary, via a cached, incrementally-updatable Rust binary.

Part of the [agentsys](https://github.com/agent-sh/agentsys) ecosystem.

Scan a repo once, cache the result, then query it repeatedly. The heavy lifting runs in the [agent-analyzer](https://github.com/agent-sh/agent-analyzer) Rust binary - this plugin provides the JavaScript interface, the skill layer that other plugins consume, and the orchestration that spawns Haiku subagents to enrich the artifact with semantic signals.

## Why this plugin

- Use this when you need to identify high-churn files before a refactor
- Use this when evaluating bus factor risk across your codebase
- Use this when finding files that always change together (coupling)
- Use this when an agent (or you) needs a fast first-foothold in an unfamiliar repo (`find <concept>` and `summary`)
- Use this when other plugins need repo intelligence (deslop, sync-docs, drift-detect, audit-project, next-task, onboard, can-i-help)

## Installation

```bash
agentsys install repo-intel
```

## Quick start

```
/repo-intel init                          # Scan repo (first time, deterministic)
/repo-intel enrich                        # OPTIONAL: spawn Haiku agents to add descriptors + summary
/repo-intel query hotspots                # Most active files, recency-weighted
/repo-intel query find "auth flow"        # Concept search across files (uses descriptors when present)
/repo-intel query summary --depth=1       # One-sentence repo description (needs enrich)
/repo-intel query ownership src/auth/     # Who owns a path
/repo-intel query bus-factor              # Knowledge distribution risk
/repo-intel query painspots               # Hot x buggy x complex
/repo-intel query entry-points            # Where execution starts (binaries, mains, scripts)
/repo-intel query stale-docs              # Docs with stale symbol references
```

After init, the artifact is cached as `repo-intel.json` in the platform state dir (`.claude/`, `.opencode/`, or `.codex/`). Subsequent queries are instant. Run `/repo-intel update` to add new commits incrementally.

## Actions

| Action | What it does |
|--------|--------------|
| `init` | Full scan - git history, AST symbols, project metadata, doc-code sync |
| `update` | Incremental update (only new commits since last scan) |
| `enrich` | Spawn the `repo-intel-summarizer` and `repo-intel-weighter` Haiku subagents to populate `summary` (3 depths) and `fileDescriptors` (top-500 most-active files). Also runs the embedder when opted in (see below). Optional - all deterministic queries work without it. |
| `status` | Check cache staleness - commits behind, last analyzed date |
| `query <type>` | Run a specific analysis query |
| `embed status` | Show embedder install state, variant + detail, sidecar info |
| `embed update` | Delta re-embed of changed files only (CI-friendly) |
| `embed reset` | Clear cached embedder preference; next `enrich` re-prompts |

## Query types

### Activity

| Query | Description |
|-------|-------------|
| `hotspots` | Most-changed files, recency-weighted |
| `coldspots` | Least-changed files (unmaintained) |
| `file-history <file>` | Change timeline for a specific file |

### Quality

| Query | Description |
|-------|-------------|
| `bugspots` | Files with highest bug-fix density (fix commits / total) |
| `test-gaps` | Hot source files without co-changing test files |
| `diff-risk <files>` | Risk score for recently changed files |
| `painspots` | Hotspot x (1 + bug rate) x (1 + complexity/30) - requires AST data |

### People

| Query | Description |
|-------|-------------|
| `ownership <path>` | Who owns a path, with staleness flags |
| `contributors` | All contributors with commit counts and AI ratio |
| `bus-factor` | Knowledge concentration risk with at-risk areas |

### Coupling

| Query | Description |
|-------|-------------|
| `coupling <file>` | Files that always change together |

### Standards

| Query | Description |
|-------|-------------|
| `norms` | Detected commit conventions (conventional, freeform, mixed) |
| `conventions` | Commit style prefixes and scopes |

### Health

| Query | Description |
|-------|-------------|
| `areas` | Directory-level health (healthy / needs-attention / at-risk) |
| `health` | Repo-wide health overview |
| `release-info` | Release cadence and tag history |

### LLM-augmented (requires `/repo-intel enrich` first)

| Query | Description |
|-------|-------------|
| `find <concept>` | Concept-to-file search. With descriptors, catches synonyms (worker ↔ executor); without, falls back to deterministic substring scoring across paths/symbols/imports/doc-headers. |
| `summary [--depth=1\|3\|10]` | Cached 3-depth narrative description: one sentence / one paragraph / one-page technical overview. |

### Slop targeting (consumed by `/deslop`)

| Query | Description |
|-------|-------------|
| `slop-fixes` | Pinpoint structured fix actions (Haiku tier): tracked artifacts, stale CI configs, duplicate tooling, orphan exports, empty catches, tautological tests. Each finding is self-contained for direct apply. |
| `slop-targets [--limit=N]` | Ranked Sonnet (file-level) and Opus (cross-file) targets. Sonnet: defensive cargo cult, bot-authored, could-be-shorter. Opus: cliché clusters, wrapper towers, single-impl traits, high-bug communities. With the embedder installed: also stylistic outliers and semantic duplicates. |

### Contributor guidance

| Query | Description |
|-------|-------------|
| `onboard` | Project orientation data (tech stack, key areas, pain points) |
| `can-i-help` | Good-first areas, test gaps, doc drift, bugspots for contributors |

### Documentation

| Query | Description |
|-------|-------------|
| `doc-drift` | Documentation files with low code coupling (likely stale) |
| `stale-docs` | Symbol-level references in docs that no longer exist in code |

### AST symbols

| Query | Description |
|-------|-------------|
| `symbols <file>` | Exports, imports, and definitions for a file |
| `dependents <symbol>` | Reverse dependency lookup - who imports this symbol |
| `entry-points` | Every place execution can start - binaries (`Cargo.toml [[bin]]`, `package.json bin`, `pyproject [project.scripts]`), AST `main` functions, npm `scripts`. Cargo workspace-aware. |

## Scoring

**Hotspot score**: `(recent_changes * 2 + total_changes) / (total_changes + 1)` - recent activity gets 2x weight.

**Recency window**: 90 days relative to the repo's last commit date (snapshot-relative, not wall clock).

**Staleness**: A contributor is stale if their last-seen date is > 90 days before the repo's last commit.

**Area health**:
- `healthy` - active non-stale owner + bug fix rate < 30%
- `needs-attention` - stale owner OR high bug rate
- `at-risk` - stale owner AND high bug rate

## Query flags

| Flag | Applies to | Description |
|------|-----------|-------------|
| `--limit N` | most queries | Limit result rows |
| `--min-changes N` | test-gaps | Minimum change threshold |
| `--depth 1\|3\|10` | summary | Print just one depth as plain text (omit for full JSON) |
| `--since <date>` | init | Limit history scan to a date |
| `--max-commits N` | init | Cap total commits scanned |

## Architecture

```
/repo-intel query hotspots
    |
    +-- lib/repo-intel/queries.js   (thin JS wrapper)
    |       |
    |       +-- agent-analyzer repo-intel query hotspots <path>
    |                              (Rust binary, all computation)
    |
    +-- repo-intel.json            (cached in .claude/, .opencode/, or .codex/)
```

The JavaScript layer is intentionally thin - it resolves paths and parses JSON. All analysis logic lives in the [agent-analyzer](https://github.com/agent-sh/agent-analyzer) Rust binary.

## Post-init enrichment (LLM-augmented signals)

`/repo-intel enrich` is opt-in. The Rust binary stays offline-only - the orchestration that produces semantic signals lives entirely in this plugin's JS layer plus two Haiku-backed Task subagents:

```
/repo-intel enrich
    |
    +-- Task: repo-intel-summarizer (haiku)
    |       reads README + manifests + top-10 hotspot heads,
    |       returns {depth1, depth3, depth10} as JSON between markers
    |       --> piped through `agent-analyzer set-summary --input -`
    |
    +-- Task: repo-intel-weighter (haiku, batched)
            reads top-500 most-active files in batches of 30,
            returns {path: descriptor} as JSON between markers
            --> piped through `agent-analyzer set-descriptors --input -`
```

After enrich:
- `query find <concept>` adds a 2.5/term descriptor signal that catches semantic synonyms (worker ↔ executor, queue ↔ channel) the deterministic scorer can't see.
- `query summary [--depth=1|3|10]` returns the cached narrative.

Cost is bounded by the top-500 cap regardless of repo size.

## Embedder (opt-in)

The first time `enrich` runs, the skill prompts (via `AskUserQuestion`) for two choices and caches them in `<stateDir>/sources/preference.json`:

1. **`embedder`** — `none` (default) / `small` (BAAI/bge-small-en-v1.5 Q8 ~30 MB) / `big` (google/embeddinggemma-300m Q4 ~195 MB, code-aware, multilingual, recommended)
2. **`embedderDetail`** — `compact` (per-file × 128 dim) / `balanced` (per-function × 256 dim, recommended) / `maximum` (per-function × 768 dim)

When `embedder !== 'none'`:

- The separate `agent-analyzer-embed` binary is downloaded into `~/.agent-sh/bin/` (one-time, latest release).
- Model files are fetched on first use into the fastembed cache (no bundling — keeps the binary small).
- `enrich` runs `agent-analyzer-embed update`, pipes the JSON document into `agent-analyzer repo-intel set-embeddings`.
- Embeddings live in a sidecar file `<map_stem>.embeddings.bin` (packed fp16, deterministic). The main JSON stays diffable.
- All consumers degrade gracefully when no sidecar is present — the `find` and `slop-targets` queries return AST/graph-only results in that case.

To change variant or detail later: `/repo-intel embed reset` then `/repo-intel enrich`.

### Keeping embeddings fresh in CI

The `embed update` action only re-embeds files whose content hash differs from the existing sidecar — fast on small PRs.

```yaml
# .github/workflows/repo-intel-embed.yml
name: repo-intel embed update
on:
  push:
    branches: [main]

jobs:
  embed:
    if: hashFiles('.claude/repo-intel.json') != ''
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with: { node-version: 'lts/*' }
      - run: npx @agentsys/repo-intel embed update
      - uses: actions/upload-artifact@v4
        with:
          name: repo-intel-embeddings
          path: |
            .claude/repo-intel.json
            .claude/repo-intel.embeddings.bin
```

GitLab CI / Buildkite / Jenkins users: invoke the same `npx @agentsys/repo-intel embed update` command — the JS wrapper handles binary download and pipe-through to the analyzer.

For local hooks (husky / lefthook / git hook):

```bash
# .git/hooks/post-commit
#!/usr/bin/env bash
npx @agentsys/repo-intel embed update --quiet 2>/dev/null || true
```

## Consumer plugins

Other plugins use repo-intel data automatically when available:

| Plugin | Queries used | Purpose |
|--------|-------------|---------|
| [deslop](https://github.com/agent-sh/deslop) | slop-fixes, slop-targets, test-gaps | Pinpoint mechanical fixes; route Sonnet/Opus scans where slop is likely |
| [sync-docs](https://github.com/agent-sh/sync-docs) | doc-drift, stale-docs | Find stale documentation |
| [drift-detect](https://github.com/agent-sh/drift-detect) | doc-drift, areas | Plan vs reality comparison |
| [audit-project](https://github.com/agent-sh/audit-project) | test-gaps | Prioritize review of untested code |
| [next-task](https://github.com/agent-sh/next-task) | hotspots, bugspots, bus-factor, diff-risk | Risk-aware planning and review |
| [enhance](https://github.com/agent-sh/enhance) | doc-drift | Prioritize documentation improvements |
| [ship](https://github.com/agent-sh/ship) | health, bugspots | Pre-release health check |
| [onboard](https://github.com/agent-sh/onboard) | onboard | Project orientation data |
| [can-i-help](https://github.com/agent-sh/can-i-help) | can-i-help | Contributor guidance signals |

## Requirements

- Git repository with history
- [agent-analyzer](https://github.com/agent-sh/agent-analyzer) binary (auto-downloaded on first use)

## License

MIT

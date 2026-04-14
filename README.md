# repo-intel

Unified static analysis for AI agents - git history, AST symbols, project metadata, and doc-code sync via a cached, incrementally-updatable Rust binary.

Part of the [agentsys](https://github.com/agent-sh/agentsys) ecosystem.

Scan a repo once, cache the result, then query it repeatedly. The heavy lifting runs in the [agent-analyzer](https://github.com/agent-sh/agent-analyzer) Rust binary - this plugin provides the JavaScript interface and skill layer that other plugins consume.

## Why this plugin

- Use this when you need to identify high-churn files before a refactor
- Use this when evaluating bus factor risk across your codebase
- Use this when finding files that always change together (coupling)
- Use this when checking if AI-generated code is concentrated in certain areas
- Use this when other plugins need repo intelligence (deslop, sync-docs, drift-detect, audit-project, next-task, onboard, can-i-help)

## Installation

```bash
agentsys install repo-intel
```

## Quick start

```
/repo-intel init                          # Scan repo (first time)
/repo-intel query hotspots                # Most active files, recency-weighted
/repo-intel query ownership src/auth/     # Who owns a path
/repo-intel query bus-factor              # Knowledge distribution risk
/repo-intel query painspots               # Hot x buggy x complex
/repo-intel query stale-docs              # Docs with stale symbol references
```

After init, the artifact is cached as `repo-intel.json` in the platform state dir (`.claude/`, `.opencode/`, or `.codex/`). Subsequent queries are instant. Run `/repo-intel update` to add new commits incrementally.

## Actions

| Action | What it does |
|--------|--------------|
| `init` | Full scan - git history, AST symbols, project metadata, doc-code sync |
| `update` | Incremental update (only new commits since last scan) |
| `status` | Check cache staleness - commits behind, last analyzed date |
| `query <type>` | Run a specific analysis query |

## 24 query types

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

### AI detection

| Query | Description |
|-------|-------------|
| `ai-ratio` | AI vs human commit attribution |
| `recent-ai` | Recent AI-generated changes (useful for deslop targeting) |

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
| `--path-filter <glob>` | ai-ratio | Filter to specific paths |
| `--adjust-for-ai` | bus-factor | Downweight AI-generated changes |
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

## Consumer plugins

Other plugins use repo-intel data automatically when available:

| Plugin | Queries used | Purpose |
|--------|-------------|---------|
| [deslop](https://github.com/agent-sh/deslop) | recent-ai, test-gaps | Target AI code, escalate untested findings |
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

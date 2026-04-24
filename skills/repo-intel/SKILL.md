---
name: repo-intel
description: "Use when user asks to \"analyze git history\", \"show hotspots\", \"coldspots\", \"file coupling\", \"code ownership\", \"bus factor\", \"bugspots\", \"area health\", \"project norms\", \"test gaps\", \"untested files\", \"diff risk\", \"stale docs\", \"doc drift\", \"contributors\", \"repo health\", \"release cadence\", \"file history\", \"conventions\", \"AST symbols\", \"find dependents\", \"pain spots\", \"onboard to codebase\", \"where can I help\", \"find <concept>\", \"find auth code\", \"find worker pool\", \"summarize this repo\", \"repo summary\", \"what does this project do\", \"enrich repo-intel\", \"generate descriptors\", \"entry points\", \"where does this start\", \"repo-intel init/update/enrich/status/query\". Builds and queries a cached repo-intel artifact using the agent-analyzer binary; spawns Haiku subagents post-init for descriptors and a 3-depth narrative summary."
argument-hint: "init|update|enrich|status|query <type> [--since=<date>] [--max-commits=<n>] [--limit=<n>] [--depth=1|3|10] [--min-changes=<n>] [<file-or-concept>]"
---

# Repo Intel Skill

Build and maintain a cached repo-intel artifact using the agent-analyzer binary. Covers git history, AST symbols, project metadata, doc-code sync, and (after `enrich`) LLM-generated per-file descriptors and a 3-depth narrative summary.

## Parse Arguments

```javascript
const allArgs = '$ARGUMENTS'.split(' ').filter(Boolean);
const positional = allArgs.filter(a => !a.startsWith('--'));
const action = positional[0] || 'status';
const queryType = action === 'query' ? positional[1] : null;
const queryArg = action === 'query' ? positional[2] || null : null;
```

## Primary Responsibilities

1. **Initialize artifact** on demand (`/repo-intel init`) - full scan
2. **Update incrementally** (`/repo-intel update`) - only new commits since last run
3. **Enrich with LLM signals** (`/repo-intel enrich`) - spawn the `repo-intel-summarizer` and `repo-intel-weighter` Haiku subagents to populate the artifact's `summary` (3 depths) and `fileDescriptors` (top-500 most-active files). The Rust binary itself never calls an LLM - this orchestration runs in JS and pipes the agent JSON back through `set-summary` / `set-descriptors`.
4. **Check status** (`/repo-intel status`)
5. **Run queries** against the cached artifact (`/repo-intel query <type>`)

## Binary Integration

```javascript
const pluginRoot = '$CLAUDE_PLUGIN_ROOT';
const binary = require(`${pluginRoot}/lib/binary`);
const repoIntel = require(`${pluginRoot}/lib/repo-intel`);
```

The binary is resolved and auto-downloaded if needed via `binary.ensureBinary()`. The binary module is bundled with this plugin - no external dependency required.

## Core Data Contract

Artifact is stored in the platform state directory:

- Claude Code: `.claude/repo-intel.json`
- OpenCode: `.opencode/repo-intel.json`
- Codex CLI: `.codex/repo-intel.json`

## Available Queries

All queries delegate to `agent-analyzer repo-intel query <type>`.

### Git History (Phase 1)

| Query | Description |
|-------|-------------|
| `hotspots` | Recency-weighted most-changed files |
| `coldspots` | Least-changed files with no recent activity |
| `bugspots` | Files with highest bug-fix density (fix/change ratio) |
| `coupling <file>` | Files that change together with `<file>` |
| `ownership <path>` | Who owns a directory or file |
| `bus-factor` | Detailed bus factor with critical owners and at-risk areas |
| `norms` | Commit message conventions detected from history |
| `areas` | Directory-level health overview |
| `contributors` | Contributors sorted by commit count with staleness |
| `release-info` | Release cadence and last release |
| `health` | Repository health summary |
| `file-history <file>` | Detailed history for a specific file |
| `conventions` | Commit message style, prefixes, scope usage |
| `test-gaps` | Hot source files with no co-changing test file |
| `diff-risk <files>` | Score changed files by composite risk |
| `doc-drift` | Doc files with low code coupling (likely stale) |
| `onboard` | Newcomer-oriented repo summary |
| `can-i-help` | Contributor guidance matching skills to areas needing work |
| `entry-points` | Every place execution can start (binaries, `main` functions, npm scripts) |

### AST Symbols (Phase 2)

| Query | Description |
|-------|-------------|
| `painspots` | Files ranked by hotspot x (1 + bug_rate) x (1 + complexity/30) |
| `symbols <file>` | AST exports, imports, and definitions for a file |
| `dependents <symbol>` | Files that import a given symbol (reverse dependency) |

### Doc-Code Sync (Phase 4)

| Query | Description |
|-------|-------------|
| `stale-docs` | Doc files with stale references to source symbols |

### LLM-Augmented Signals (Phase 6, requires `/repo-intel enrich` first)

| Query | Description |
|-------|-------------|
| `find <concept>` | Concept-to-file search. Replaces `grep -r <concept>` with a ranked list and a one-line `why` per result. Without descriptors, scores from path/symbol/import/doc-header substring matches; with descriptors (populated by `enrich`), also catches semantic synonyms (worker ↔ executor) by matching against the per-file LLM descriptor. |
| `summary [--depth 1\|3\|10]` | Cached 3-depth narrative description of the repo. depth1 = one sentence, depth3 = one paragraph, depth10 = one-page technical overview. Generated by the `repo-intel-summarizer` Haiku agent at `enrich` time. |

## Post-Init Enrichment

Two Haiku-backed Task subagents fire when `/repo-intel enrich` runs:

- **`repo-intel-weighter`** reads the top-500 most-active files in batches of 30, returns 1-2 sentence concrete descriptors per file as JSON between marker blocks. The skill parses the markers and pipes the JSON to `agent-analyzer repo-intel set-descriptors --input -`.
- **`repo-intel-summarizer`** reads README + manifests + top-10 hotspot file headers, returns `{depth1, depth3, depth10, inputHash}` as JSON between marker blocks. The skill parses and pipes to `set-summary --input -`.

The Rust binary itself never makes LLM calls. All orchestration lives here.

## Behavior Rules

- **Never** call the binary without `binary.ensureBinary()` first
- **Always** cache results after a successful init or update
- **Prefer** incremental update unless artifact is missing
- **Return** structured data - let the command layer format output

## Recency and Staleness

- **Recency window**: 90 days relative to the repo's `lastCommitDate` (not wall clock)
- **Stale contributor**: `lastSeen` > 90 days before `lastCommitDate`
- **Hotspot score**: `(recentChanges * 2 + totalChanges) / (totalChanges + 1)`
- **Area health**: "healthy" / "needs-attention" / "at-risk"

## Output Expectations

- **init/update**: commit count, files analyzed, last commit, duration
- **status**: age, staleness, commits behind HEAD
- **query**: ranked list with scores, truncated to `--limit` (default 10)

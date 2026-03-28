---
name: repo-intel
description: "Use when user asks to \"analyze git history\", \"show hotspots\", \"coldspots\", \"file coupling\", \"code ownership\", \"bus factor\", \"bugspots\", \"area health\", \"project norms\", \"test gaps\", \"untested files\", \"diff risk\", \"stale docs\", \"doc drift\", \"recent AI changes\", \"AI ratio\", \"contributors\", \"repo health\", \"release cadence\", \"file history\", \"conventions\", \"AST symbols\", \"find dependents\", \"pain spots\", \"onboard to codebase\", \"where can I help\", \"repo-intel init/update/status/query\". Builds and queries a cached repo-intel artifact using the agent-analyzer binary."
argument-hint: "[action] [query-type] [--since=<date>] [--max-commits=<n>] [--limit=<n>] [--adjust-for-ai] [--min-changes=<n>] [--path-filter=<path>] [<file>]"
---

# Repo Intel Skill

Build and maintain a cached repo-intel artifact using the agent-analyzer binary. Covers git history, AST symbols, project metadata, and doc-code sync in a single unified artifact.

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
3. **Check status** (`/repo-intel status`)
4. **Run queries** against the cached artifact (`/repo-intel query <type>`)

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
| `ai-ratio` | AI vs human contribution ratio |
| `release-info` | Release cadence and last release |
| `health` | Repository health summary |
| `file-history <file>` | Detailed history for a specific file |
| `conventions` | Commit message style, prefixes, scope usage |
| `test-gaps` | Hot source files with no co-changing test file |
| `diff-risk <files>` | Score changed files by composite risk |
| `doc-drift` | Doc files with low code coupling (likely stale) |
| `recent-ai` | Files with recent AI-authored changes |
| `onboard` | Newcomer-oriented repo summary |
| `can-i-help` | Contributor guidance matching skills to areas needing work |

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

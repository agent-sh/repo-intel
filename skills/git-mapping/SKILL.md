---
name: git-mapping
description: "Use when user asks to \"analyze git history\", \"show hotspots\", \"coldspots\", \"file coupling\", \"code ownership\", \"bus factor\", \"bugspots\", \"area health\", \"project norms\", \"test gaps\", \"untested files\", \"diff risk\", \"stale docs\", \"doc drift\", \"recent AI changes\", \"AI ratio\", \"contributors\", \"repo health\", \"release cadence\", \"file history\", \"conventions\", \"git map init/update/status/query\". Builds and queries a cached repo-intel artifact using the agent-analyzer binary."
argument-hint: "[action] [query-type] [--since=<date>] [--max-commits=<n>] [--limit=<n>] [<file>]"
---

# Git Mapping Skill

Build and maintain a cached repo-intel artifact using the agent-analyzer binary. Surfaces hotspots, coupling, ownership, bus factor risk, bugspots, area health, and project norms.

## Parse Arguments

```javascript
const args = '$ARGUMENTS'.split(' ').filter(Boolean);
const action = args.find(a => !a.startsWith('--') && !a.includes('/')) || 'status';
const queryType = action === 'query' ? args[1] : null;
const queryArg = action === 'query' ? args[2] || null : null;
```

## Primary Responsibilities

1. **Initialize map** on demand (`/git-map init`) - full git history scan
2. **Update map** incrementally (`/git-map update`) - only new commits since last run
3. **Check status** and staleness (`/git-map status`)
4. **Run queries** against the cached artifact (`/git-map query <type>`)

## Binary Integration

This skill uses the agent-analyzer Rust binary via agent-core:

```javascript
const { getPluginRoot } = require('@agentsys/lib/cross-platform');
const pluginRoot = getPluginRoot('git-map');
const { binary } = require('@agentsys/lib');
const gitMap = require(`${pluginRoot}/lib/git-map`);
```

The binary is resolved and auto-downloaded if needed via `binary.ensureBinary()`.

## Core Data Contract

Repo intel is stored in the platform state directory:

- Claude Code: `.claude/repo-intel.json`
- OpenCode: `.opencode/repo-intel.json`
- Codex CLI: `.codex/repo-intel.json`

The JSON follows the RepoIntelData schema with these top-level fields:

```json
{
  "version": "1.0.0",
  "generated": "2026-01-25T12:00:00Z",
  "updated": "2026-01-25T12:05:00Z",
  "git": {
    "analyzedUpTo": "abc123",
    "totalCommitsAnalyzed": 1240,
    "firstCommitDate": "...",
    "lastCommitDate": "...",
    "branch": "main"
  },
  "contributors": { "humans": {}, "bots": {} },
  "fileActivity": {},
  "coupling": {},
  "conventions": { "style": "conventional", "prefixes": {}, "usesScopes": false },
  "aiAttribution": { "attributed": 0, "heuristic": 0, "none": 0, "confidence": "low", "tools": {} },
  "releases": {},
  "renames": [],
  "deletions": []
}
```

## Available Queries

Queries delegate to the agent-analyzer binary (`repo-intel query <type>`).

| Query | Description |
|-------|-------------|
| `hotspots` | Recency-weighted most-changed files (score = recent * 2 + total) |
| `coldspots` | Least-changed files with no recent activity |
| `bugspots` | Files with highest bug-fix density (fix/change ratio) |
| `coupling <file>` | Files that change together with `<file>` |
| `ownership <path>` | Who owns a directory or file, with staleness and bus factor risk |
| `bus-factor` | Detailed bus factor with critical owners and at-risk areas |
| `norms` | Commit message conventions detected from history |
| `areas` | Directory-level health overview (healthy/needs-attention/at-risk) |
| `contributors` | Contributors sorted by commit count with AI-assisted percentage |
| `ai-ratio` | AI vs human contribution ratio (repo-wide or per-path) |
| `release-info` | Release cadence, last release, unreleased commit count |
| `health` | Repository health summary (active, bus factor, AI ratio) |
| `file-history <file>` | Detailed history for a specific file |
| `conventions` | Commit message style, prefixes, scope usage |
| `test-gaps` | Hot source files with no co-changing test file |
| `diff-risk <files>` | Score changed files by composite risk (bug rate + authors + AI) |
| `doc-drift` | Doc files with low code coupling (likely stale) |
| `recent-ai` | Files with recent AI-authored changes (deslop targets) |

## Behavior Rules

- **Never** call the binary without `binary.ensureBinary()` first
- **Always** cache results after a successful init or update
- **Prefer** incremental update unless map is missing or explicitly re-initialized
- **Return** structured data - let the command layer format output

## Recency and Staleness

- **Recency window**: 90 days relative to the repo's `lastCommitDate` (not wall clock)
- **Stale contributor**: `lastSeen` > 90 days before `lastCommitDate`
- **Hotspot score**: `(recentChanges * 2 + totalChanges) / (totalChanges + 1)`
- **Area health**: "healthy" (active owner + low bug rate), "needs-attention" (one failing), "at-risk" (both failing)

## Output Expectations

Keep outputs concise:

- **init/update**: commit count, files analyzed, last commit, duration
- **status**: age, staleness, commits behind HEAD
- **query**: ranked list with scores, truncated to `--limit` (default 10)

---
name: git-mapping
description: "Use when user asks to \"analyze git history\", \"show hotspots\", \"file coupling\", \"code ownership\", \"bus factor\", \"git map init/update/status/query\". Builds and queries a cached git history analysis artifact using the agent-analyzer binary."
argument-hint: "[action] [query-type] [--since=<date>] [--max-commits=<n>] [--limit=<n>] [<file>]"
---

# Git Mapping Skill

Build and maintain a cached git history analysis artifact using the agent-analyzer binary. Surfaces hotspots, coupling, ownership, and knowledge distribution risk.

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

Git map is stored in the platform state directory:

- Claude Code: `.claude/git-map.json`
- OpenCode: `.opencode/git-map.json`
- Codex CLI: `.codex/git-map.json`

Minimal structure:

```json
{
  "version": "1.0.0",
  "generated": "2026-01-25T12:00:00Z",
  "updated": "2026-01-25T12:05:00Z",
  "git": { "commit": "abc123", "branch": "main" },
  "stats": { "totalCommits": 1240, "totalFiles": 142, "analyzedFiles": 138 },
  "files": {
    "src/auth/login.ts": {
      "changes": 42,
      "authors": ["alice", "bob"],
      "lastChange": "2026-01-20T10:00:00Z"
    }
  },
  "coupling": {},
  "contributors": {}
}
```

## Available Queries

| Query | Description |
|-------|-------------|
| `hotspots` | Files changed most frequently (change count, authors) |
| `coldspots` | Files never or rarely touched |
| `coupling <file>` | Files that change together with `<file>` |
| `ownership [path]` | Who owns a directory or file by commit share |
| `bus-factor` | Knowledge distribution risk (single-author files) |
| `ai-ratio [path]` | AI vs human contribution ratio |
| `contributors` | Active contributors by commit count |
| `health` | Overall project health score |
| `release-info` | Release cadence and tag patterns |
| `conventions` | Commit message conventions |
| `commit-shape` | Commit size distribution (files per commit) |

## Behavior Rules

- **Never** call the binary without `binary.ensureBinary()` first
- **Always** cache results after a successful init or update
- **Prefer** incremental update unless map is missing or explicitly re-initialized
- **Return** structured data - let the command layer format output

## Staleness Signals

- Map commit not in current git history (rebased or force-pushed)
- Branch changed since last analysis
- Map is more than 7 days old and repo has recent activity

## Output Expectations

Keep outputs concise:

- **init/update**: commit count, files analyzed, last commit, duration
- **status**: age, staleness, commits behind HEAD
- **query**: ranked list with scores, truncated to `--limit` (default 10)

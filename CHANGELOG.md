# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

## [0.1.0] - 2026-03-22

### Added

- `painspots(basePath, options)` query function: ranks files by hotspot score x (1 + bug_rate) x (1 + complexity/30); falls back to git-only scoring when Phase 2 AST data is absent
- `symbols(basePath, file)` query function: returns AST exports, imports, and definitions for a specific file
- `dependents(basePath, symbol, file?)` query function: reverse dependency lookup - finds all files that import a given symbol
- Initial git-map plugin: JS plugin wrapping the agent-analyzer Rust binary for the `/git-map` command, including command definition, skill, cache management, query wrappers, and git collector integration; uses agent-core binary resolver for lazy binary download on first use
- 20 query types delegated to the agent-analyzer binary via `runQuery()`: hotspots, coldspots, file-history, bugspots, test-gaps, diff-risk, ownership, contributors, bus-factor, coupling, norms, conventions, areas, health, release-info, ai-ratio, recent-ai, onboard, can-i-help, doc-drift
- Cached artifact `repo-intel.json` stored in `.claude/` or `.opencode/` for instant repeated queries
- Incremental update support via `/git-map update` (only new commits since last scan)
- Query flags: `--min-changes`, `--path-filter`, `--adjust-for-ai`
- Consumer plugin integration: deslop, sync-docs, drift-detect, audit-project, next-task, enhance, ship, onboard, can-i-help
- Scoring formulas documented: hotspot score, recency window (90-day), staleness threshold, area health classifications (healthy / needs-attention / at-risk)

### Changed

- Rewrote `queries.js` from 389-line self-contained JS implementation to thin binary delegation via `runQuery()`; all analysis logic now lives in the agent-analyzer Rust binary
- Renamed cache file from `git-map.json` to `repo-intel.json` to reflect the broader artifact scope
- Updated `index.js` `status()` to use new schema fields from the repo-intel artifact

### Fixed

- Corrected query count from 21 to 20: `bus-factor-detailed` is not a separate CLI query, it is included in the `bus-factor` response

[Unreleased]: https://github.com/agent-sh/git-map/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/agent-sh/git-map/releases/tag/v0.1.0

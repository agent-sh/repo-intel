# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

## [0.2.0] - 2026-03-29

### Fixed

- Marketplace installs failed with `Cannot find module '@agentsys/lib'` - bundled `lib/binary/` directly in the plugin so it works standalone without the agentsys npm package
- Replaced `require('@agentsys/lib')` with relative requires (`require('../binary')`) in index.js and queries.js
- SKILL.md and command.md now use `$CLAUDE_PLUGIN_ROOT` instead of `getPluginRoot()` from the unavailable shared lib
- Removed unsupported `darwin-x64` from platform map (no release asset exists)
- Added HTTPS-only redirect guard for binary downloads
- Used `mkdtempSync` for secure temp file creation during zip extraction

### Changed

- Renamed plugin from `git-map` to `repo-intel` - consolidated with `repo-map` into a single unified plugin
- Command renamed from `/git-map` to `/repo-intel`
- Skill renamed from `git-mapping` to `repo-intel`
- Library moved from `lib/git-map/` to `lib/repo-intel/`
- `update()` now uses `--map-file` flag (correct agent-analyzer CLI interface)
- SKILL.md argument parsing now separates flags from positional args

### Added

- `lib/binary/` - bundled binary resolver for agent-analyzer (self-contained, no external dependencies)
- `onboard` and `can-i-help` query types added to command and skill
- `stale-docs` query type (Phase 4 doc-code sync)
- `agents/map-validator.md` - lightweight output validator (ported from repo-map plugin)
- `package.json` with `npm test` smoke script

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

### Changed

- Rewrote `queries.js` from 389-line self-contained JS implementation to thin binary delegation via `runQuery()`; all analysis logic now lives in the agent-analyzer Rust binary
- Renamed cache file from `git-map.json` to `repo-intel.json` to reflect the broader artifact scope

[Unreleased]: https://github.com/agent-sh/repo-intel/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/agent-sh/repo-intel/releases/tag/v0.1.0

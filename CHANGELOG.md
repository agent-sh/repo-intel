# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

### Added

- **Post-init `enrich` action** (#13) - new `/repo-intel enrich` spawns two Haiku Task subagents to populate the artifact with LLM-augmented signals. The Rust binary stays offline-only; orchestration lives in the JS layer.
  - `repo-intel-weighter` agent generates 1-2 sentence per-file descriptors for the top-500 most-active files (batched 30/Task call).
  - `repo-intel-summarizer` agent produces a 3-depth narrative summary (one sentence / one paragraph / one page).
  - Outputs are parsed from marker blocks and piped through `agent-analyzer set-descriptors` / `set-summary --input -`.
- **`find <concept>` query** (#13, surfaces agent-analyzer #24) - concept-to-file search. Returns ranked paths with one-line `why` per result. With descriptors (after `enrich`), catches semantic synonyms (worker ↔ executor); without, falls back to deterministic substring scoring.
- **`summary [--depth=1|3|10]` query** (#13) - reads the cached 3-depth narrative populated by `enrich`.
- **`entry-points` query passthrough** - lists every place execution can start (binaries, AST `main` functions, npm scripts, pyproject scripts; Cargo workspace-aware).
- **`lib/repo-intel/enrich.js` helpers** - `parseMarkers`, `topPaths`, `topHotspots`, `summaryInputHash`, `chunk`, `buildSummarizerPrompt`, `buildWeighterPrompt`. 14 unit tests in `test/enrich.test.js`.
- **`lib/repo-intel/index.js` wrappers** - `applyDescriptors(basePath, {path: descriptor})` and `applySummary(basePath, {depth1, depth3, depth10, inputHash})` that pipe JSON via stdin to the new analyzer subcommands.

### Fixed

- **Binary downloader pinned to MIN_VERSION** (#14) - `ensureBinary()` defaulted `targetVer` to `ANALYZER_MIN_VERSION` (0.3.0), so every fresh install pulled the floor version forever and never reached new releases. Now fetches the latest release tag from the GitHub API with a 1-hour TTL cache and a graceful fallback to `MIN_VERSION` on API failure. Honors `GITHUB_TOKEN` / `GH_TOKEN`.
- **Multi-word `find` queries truncated** (#13) - the argument parser collapsed quoted multi-word queries to the first word; for `queryType === 'find'` we now rejoin trailing positionals and strip surrounding quotes.

### Changed

- **`ANALYZER_MIN_VERSION` bumped 0.3.0 → 0.5.0** (#14) - the new wrappers (`applyDescriptors`, `applySummary`, `find`/`summary` queries) require subcommands that exist only in agent-analyzer v0.5.0+. Combined with the latest-fetch logic, an outdated cached binary will now be replaced on first call.
- **`/repo-intel` command** description, codex-description, and argument-hint updated to mention the new `enrich` action and `find`/`summary` query types so trigger matching reaches the new features.
- **SKILL.md** description trigger list updated to include "find <concept>", "summarize this repo", "enrich repo-intel", "entry points", etc.; query tables updated to drop removed `ai-ratio`/`recent-ai` and add `find`, `summary`, `entry-points`.
- **README** restructured: removed standalone "AI detection" query section (those queries no longer exist in v0.5.0+), added "LLM-augmented (requires enrich first)" section, added "Post-init enrichment" architecture description, added `find`/`summary`/`entry-points` to the quickstart.

### Removed

- **Stale references to AI-detection queries** in SKILL.md and README — `ai-ratio`, `recent-ai`, `--adjust-for-ai`, `--path-filter` were removed in agent-analyzer v0.5.0 (#17 over there) but still listed here. Now gone from this side too.

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

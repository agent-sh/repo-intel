/**
 * Repo intel query functions
 *
 * Delegates to the agent-analyzer binary query subcommands.
 * Each function resolves the cached map file and shells out to the binary.
 *
 * @module lib/repo-intel/queries
 */

'use strict';

const binary = require('../binary');
const cache = require('./cache');

/**
 * Run a binary query and return parsed JSON.
 *
 * @param {string} basePath - Repository root
 * @param {string[]} queryArgs - Arguments after 'repo-intel query'
 * @returns {Object|Array} Parsed query result
 */
function runQuery(basePath, queryArgs) {
  const mapFile = cache.getPath(basePath);
  const args = ['repo-intel', 'query', ...queryArgs, '--map-file', mapFile, basePath];
  const output = binary.runAnalyzer(args);
  return JSON.parse(output);
}

/**
 * Return files sorted by recency-weighted change score.
 *
 * @param {string} basePath - Repository root
 * @param {Object} [options={}]
 * @param {number} [options.limit=10] - Maximum number of results
 * @returns {Array<{path: string, changes: number, recentChanges: number, score: number, authors: string[], aiRatio: number, bugFixes: number}>}
 */
function hotspots(basePath, options = {}) {
  const args = ['hotspots'];
  if (options.limit) args.push('--top', String(options.limit));
  return runQuery(basePath, args);
}

/**
 * Return files with highest bug-fix density.
 *
 * @param {string} basePath - Repository root
 * @param {Object} [options={}]
 * @param {number} [options.limit=10] - Maximum number of results
 * @returns {Array<{path: string, bugFixRate: number, totalChanges: number, bugFixes: number, lastBugFix: string|null}>}
 */
function bugspots(basePath, options = {}) {
  const args = ['bugspots'];
  if (options.limit) args.push('--top', String(options.limit));
  return runQuery(basePath, args);
}

/**
 * Return least-changed files (no recent activity).
 *
 * @param {string} basePath - Repository root
 * @param {Object} [options={}]
 * @param {number} [options.limit=10] - Maximum number of results
 * @returns {Array<{path: string, lastChanged: string}>}
 */
function coldspots(basePath, options = {}) {
  const args = ['coldspots'];
  if (options.limit) args.push('--top', String(options.limit));
  return runQuery(basePath, args);
}

/**
 * Return files that frequently change together with the given file.
 *
 * @param {string} basePath - Repository root
 * @param {string} file - File path to analyze
 * @returns {Array<{file: string, score: number, commonCommits: number}>}
 */
function coupling(basePath, file) {
  return runQuery(basePath, ['coupling', file]);
}

/**
 * Return ownership breakdown for a file or directory.
 *
 * @param {string} basePath - Repository root
 * @param {string} file - File or directory path
 * @returns {{path: string, primary: string, pct: number, owners: Array, aiRatio: number, busFactorRisk: boolean}}
 */
function ownership(basePath, file) {
  return runQuery(basePath, ['ownership', file]);
}

/**
 * Return detailed bus factor analysis.
 *
 * @param {string} basePath - Repository root
 * @param {Object} [options={}]
 * @param {boolean} [options.adjustForAi=false] - Adjust for AI-assisted commits
 * @returns {{busFactor: number, criticalOwners: Array, atRiskAreas: string[]}}
 */
function busFactor(basePath, options = {}) {
  const args = ['bus-factor'];
  if (options.adjustForAi) args.push('--adjust-for-ai');
  return runQuery(basePath, args);
}

/**
 * Return project norms detected from git history.
 *
 * @param {string} basePath - Repository root
 * @returns {{commits: {style: string, prefixes: Object, usesScopes: boolean}}}
 */
function norms(basePath) {
  return runQuery(basePath, ['norms']);
}

/**
 * Return area-level health overview.
 *
 * @param {string} basePath - Repository root
 * @returns {Array<{area: string, files: number, totalSymbols: number, owners: Array, hotspotScore: number, bugFixRate: number, complexityMedian: number, complexityMax: number, health: string}>}
 */
function areas(basePath) {
  return runQuery(basePath, ['areas']);
}

/**
 * Return contributors sorted by commit count.
 *
 * @param {string} basePath - Repository root
 * @param {Object} [options={}]
 * @param {number} [options.limit=20] - Maximum number of results
 * @returns {Array<{name: string, commits: number, pct: number, recentActivity: number, stale: boolean, aiAssistedPct: number}>}
 */
function contributors(basePath, options = {}) {
  const args = ['contributors'];
  if (options.limit) args.push('--top', String(options.limit));
  return runQuery(basePath, args);
}

/**
 * Return AI vs human contribution ratio.
 *
 * @param {string} basePath - Repository root
 * @param {Object} [options={}]
 * @param {string} [options.pathFilter] - Filter to a specific path
 * @returns {{ratio: number, attributed: number, total: number, tools: Object}}
 */
function aiRatio(basePath, options = {}) {
  const args = ['ai-ratio'];
  if (options.pathFilter) args.push('--path-filter', options.pathFilter);
  return runQuery(basePath, args);
}

/**
 * Return release cadence and tag information.
 *
 * @param {string} basePath - Repository root
 * @returns {{cadence: string, lastRelease: string|null, unreleased: number, tags: Array}}
 */
function releaseInfo(basePath) {
  return runQuery(basePath, ['release-info']);
}

/**
 * Return repository health summary.
 *
 * @param {string} basePath - Repository root
 * @returns {{active: boolean, busFactor: number, commitFrequency: number, aiRatio: number}}
 */
function health(basePath) {
  return runQuery(basePath, ['health']);
}

/**
 * Return history for a specific file.
 *
 * @param {string} basePath - Repository root
 * @param {string} file - File path to look up
 * @returns {Object|null} FileActivity object or null if not found
 */
function fileHistory(basePath, file) {
  return runQuery(basePath, ['file-history', file]);
}

/**
 * Return commit message conventions.
 *
 * @param {string} basePath - Repository root
 * @returns {{style: string, prefixes: Object, usesScopes: boolean}}
 */
function conventions(basePath) {
  return runQuery(basePath, ['conventions']);
}

/**
 * Return hot source files with no co-changing test file.
 *
 * @param {string} basePath - Repository root
 * @param {Object} [options={}]
 * @param {number} [options.limit=10] - Maximum number of results
 * @param {number} [options.minChanges=2] - Minimum changes to consider
 * @returns {Array<{path: string, changes: number, recentChanges: number, bugFixes: number, authors: string[]}>}
 */
function testGaps(basePath, options = {}) {
  const args = ['test-gaps'];
  if (options.limit) args.push('--top', String(options.limit));
  if (options.minChanges) args.push('--min-changes', String(options.minChanges));
  return runQuery(basePath, args);
}

/**
 * Score changed files by composite risk.
 *
 * @param {string} basePath - Repository root
 * @param {string[]} files - List of changed file paths
 * @returns {Array<{path: string, riskScore: number, bugFixRate: number, churn: number, authorCount: number, aiRatio: number, known: boolean}>}
 */
function diffRisk(basePath, files) {
  return runQuery(basePath, ['diff-risk', '--files', files.join(',')]);
}

/**
 * Return doc files with low code coupling (likely stale).
 *
 * @param {string} basePath - Repository root
 * @param {Object} [options={}]
 * @param {number} [options.limit=10] - Maximum number of results
 * @returns {Array<{path: string, codeCoupling: number, lastChanged: string, changes: number}>}
 */
function docDrift(basePath, options = {}) {
  const args = ['doc-drift'];
  if (options.limit) args.push('--top', String(options.limit));
  return runQuery(basePath, args);
}

/**
 * Return files with recent AI-authored changes.
 *
 * @param {string} basePath - Repository root
 * @param {Object} [options={}]
 * @param {number} [options.limit=20] - Maximum number of results
 * @returns {Array<{path: string, aiChanges: number, totalChanges: number, aiRatio: number}>}
 */
function recentAi(basePath, options = {}) {
  const args = ['recent-ai'];
  if (options.limit) args.push('--top', String(options.limit));
  return runQuery(basePath, args);
}

/**
 * Return newcomer-oriented repo summary.
 *
 * @param {string} basePath - Repository root
 * @returns {Object} Onboarding summary with structure, key areas, and pain points
 */
function onboard(basePath) {
  return runQuery(basePath, ['onboard']);
}

/**
 * Return contributor guidance matching skills to areas needing work.
 *
 * @param {string} basePath - Repository root
 * @returns {Object} Contribution guidance with good-first areas and needs-help areas
 */
function canIHelp(basePath) {
  return runQuery(basePath, ['can-i-help']);
}

/**
 * Return files ranked by pain score: hotspot x (1 + bug_rate) x (1 + complexity/30).
 * Requires Phase 2 AST data for full score; falls back to git-only when unavailable.
 *
 * @param {string} basePath - Repository root
 * @param {Object} [options={}]
 * @param {number} [options.limit=10] - Maximum number of results
 * @returns {Array<{path: string, painScore: number, hotspotScore: number, bugFixRate: number, complexityMax: number, owners: string[], ownerStale: boolean}>}
 */
function painspots(basePath, options = {}) {
  const args = ['painspots'];
  if (options.limit) args.push('--top', String(options.limit));
  return runQuery(basePath, args);
}

/**
 * Return AST symbols (exports, imports, definitions) for a specific file.
 * Requires Phase 2 AST data to be present in the map.
 *
 * @param {string} basePath - Repository root
 * @param {string} file - File path (relative to repo root)
 * @returns {Object|null} Symbol data or null if unavailable
 */
function symbols(basePath, file) {
  return runQuery(basePath, ['symbols', file]);
}

/**
 * Return files that import a given symbol (reverse dependency lookup).
 * Requires Phase 2 AST data.
 *
 * @param {string} basePath - Repository root
 * @param {string} symbol - Symbol name to look up
 * @param {string} [file] - Optional file path to narrow the lookup
 * @returns {Object} Dependents result with usedBy list
 */
function dependents(basePath, symbol, file) {
  const args = ['dependents', symbol];
  if (file) args.push('--file', file);
  return runQuery(basePath, args);
}

/**
 * Return doc files with stale references to source symbols.
 * Requires Phase 4 sync-check data.
 *
 * @param {string} basePath - Repository root
 * @param {Object} [options={}]
 * @param {number} [options.limit=10] - Maximum number of results
 * @returns {Array<{path: string, staleness: string, references: number, staleRefs: number}>}
 */
function staleDocs(basePath, options = {}) {
  const args = ['stale-docs'];
  if (options.limit) args.push('--top', String(options.limit));
  return runQuery(basePath, args);
}

module.exports = {
  hotspots,
  bugspots,
  coldspots,
  coupling,
  ownership,
  busFactor,
  norms,
  areas,
  contributors,
  aiRatio,
  releaseInfo,
  health,
  fileHistory,
  conventions,
  testGaps,
  diffRisk,
  docDrift,
  recentAi,
  onboard,
  canIHelp,
  painspots,
  symbols,
  dependents,
  staleDocs,
  find,
  summary,
  slopFixes,
  slopTargets
};

/**
 * Pinpoint structured fix actions for the deslop agent (Haiku tier).
 * Each finding has a file, optional line range, the action to apply,
 * the slop category, and a one-line reason. The agent reads the lines,
 * confirms the shape still matches, and applies the edit — no further
 * research required.
 *
 * @param {string} basePath - Repository root
 * @returns {{fixes: Array<{action: string, path: string, lines?: number[], category: string, reason: string}>}}
 */
function slopFixes(basePath) {
  return runQuery(basePath, ['slop-fixes']);
}

/**
 * Ranked targets for the deslop agent's Sonnet (file-level) and Opus
 * (cross-file) tiers. Each row carries a tier, score, suspect label,
 * and a why-string. With the embedder installed (`/repo-intel embed
 * status` → enabled), additional NLP-derived rows are appended:
 * stylistic outliers and semantic duplicates.
 *
 * @param {string} basePath - Repository root
 * @param {Object} [options={}]
 * @param {number} [options.top=10] - Max rows per tier
 * @returns {{targets: Array<{kind: string, tier: string, score: number, suspect: string, why: string}>}}
 */
function slopTargets(basePath, options = {}) {
  const args = ['slop-targets'];
  if (options.top) args.push('--top', String(options.top));
  return runQuery(basePath, args);
}

/**
 * Concept-to-file search. Replaces a generic `grep -r <concept>`
 * with a ranked list of paths and a one-line `why` per result. When
 * the artifact has descriptors (populated by `/repo-intel enrich`),
 * the search also catches semantic synonyms (worker ↔ executor).
 *
 * @param {string} basePath - Repository root
 * @param {string} query - Concept to search (e.g. "auth flow")
 * @param {Object} [options={}]
 * @param {number} [options.limit=10] - Maximum results
 * @returns {Array<{path: string, score: number, why: string}>}
 */
function find(basePath, query, options = {}) {
  const args = ['find', query];
  if (options.limit) args.push('--top', String(options.limit));
  return runQuery(basePath, args);
}

/**
 * Read the cached 3-depth narrative summary populated by
 * `/repo-intel enrich`. Returns null when the summary hasn't been
 * generated yet.
 *
 * @param {string} basePath - Repository root
 * @param {Object} [options={}]
 * @param {1|3|10} [options.depth] - Print just one depth as plain
 *   text. Omit to get the full {depth1, depth3, depth10} object.
 * @returns {{depth1: string, depth3: string, depth10: string, inputHash: string, generatedAt: string}|string|null}
 */
function summary(basePath, options = {}) {
  const args = ['summary'];
  if (options.depth) args.push('--depth', String(options.depth));
  const mapFile = cache.getPath(basePath);
  const fullArgs = ['repo-intel', 'query', ...args, '--map-file', mapFile, basePath];
  const output = binary.runAnalyzer(fullArgs).trim();
  if (output === 'null') return null;
  if (options.depth) return output; // plain-text depth
  return JSON.parse(output);
}

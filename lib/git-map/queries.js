/**
 * Repo intel query functions
 *
 * Delegates to the agent-analyzer binary query subcommands.
 * Each function resolves the cached map file and shells out to the binary.
 *
 * @module lib/git-map/queries
 */

'use strict';

const { binary } = require('@agentsys/lib');
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
 * @returns {{path: string, primary: string, pct: number, owners: Array<{name: string, commits: number, pct: number, lastActive: string, stale: boolean}>, aiRatio: number, busFactorRisk: boolean}}
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
 * @returns {{busFactor: number, adjustForAi: boolean, criticalOwners: Array<{name: string, coverage: number, lastActive: string, stale: boolean}>, atRiskAreas: string[]}}
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
 * @returns {{commits: {style: string, prefixes: Object, usesScopes: boolean, exampleMessages: string[]}}}
 */
function norms(basePath) {
  return runQuery(basePath, ['norms']);
}

/**
 * Return area-level health overview.
 *
 * @param {string} basePath - Repository root
 * @returns {Array<{area: string, files: number, owners: Array, hotspotScore: number, bugFixRate: number, health: string}>}
 */
function areas(basePath) {
  return runQuery(basePath, ['areas']);
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
 * Return contributors sorted by commit count.
 *
 * @param {string} basePath - Repository root
 * @param {Object} [options={}]
 * @param {number} [options.limit=20] - Maximum number of results
 * @returns {Array<{name: string, commits: number, pct: number, aiAssistedPct: number}>}
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
 * @returns {Array<{path: string, aiChanges: number, totalChanges: number, aiRatio: number, recentChanges: number, aiAdditions: number, aiDeletions: number}>}
 */
function recentAi(basePath, options = {}) {
  const args = ['recent-ai'];
  if (options.limit) args.push('--top', String(options.limit));
  return runQuery(basePath, args);
}

module.exports = {
  hotspots,
  bugspots,
  coupling,
  ownership,
  busFactor,
  norms,
  areas,
  coldspots,
  contributors,
  aiRatio,
  releaseInfo,
  health,
  fileHistory,
  conventions,
  testGaps,
  diffRisk,
  docDrift,
  recentAi
};

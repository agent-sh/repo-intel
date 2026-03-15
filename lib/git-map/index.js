/**
 * Git Map - Git history analysis
 *
 * Thin JS wrapper around the agent-analyzer Rust binary.
 * Generates a cached artifact of git history data including
 * file change frequency, authorship, coupling, and more.
 *
 * @module lib/repo-intel
 */

'use strict';

const { binary } = require('@agentsys/lib');
const cache = require('./cache');

/**
 * Initialize a new git map (full scan of git history).
 *
 * @param {string} basePath - Repository root path
 * @param {Object} [options={}] - Options
 * @param {string} [options.since] - Limit history to commits after this date (ISO or relative)
 * @param {number} [options.maxCommits] - Maximum number of commits to analyze
 * @returns {Promise<Object>} Parsed git map data
 */
async function init(basePath, options = {}) {
  await binary.ensureBinary();

  const args = ['repo-intel', 'init'];
  if (options.since) args.push(`--since=${options.since}`);
  if (options.maxCommits) args.push(`--max-commits=${options.maxCommits}`);
  args.push(basePath);

  const output = await binary.runAnalyzerAsync(args);
  const data = JSON.parse(output);
  cache.save(basePath, data);
  return data;
}

/**
 * Incrementally update an existing git map (only new commits since last run).
 *
 * @param {string} basePath - Repository root path
 * @returns {Promise<Object>} Updated git map data
 * @throws {Error} If no existing map is found
 */
async function update(basePath) {
  const existing = cache.load(basePath);
  if (!existing) {
    throw new Error('No repo-intel found. Run init first.');
  }

  await binary.ensureBinary();

  const lastCommit = existing.git && existing.git.commit;
  const args = ['repo-intel', 'update'];
  if (lastCommit) args.push(`--since-commit=${lastCommit}`);
  args.push(basePath);

  const output = await binary.runAnalyzerAsync(args);
  const data = JSON.parse(output);
  cache.save(basePath, data);
  return data;
}

/**
 * Get the status of the current git map cache.
 *
 * @param {string} basePath - Repository root path
 * @returns {{exists: boolean, status?: Object}}
 */
function status(basePath) {
  const map = cache.load(basePath);
  if (!map) {
    return { exists: false };
  }

  const git = map.git || {};
  const fileActivity = map.fileActivity || {};
  return {
    exists: true,
    status: {
      generated: map.generated,
      updated: map.updated,
      analyzedUpTo: git.analyzedUpTo || null,
      branch: git.branch || null,
      totalCommits: git.totalCommitsAnalyzed || 0,
      totalFiles: Object.keys(fileActivity).length
    }
  };
}

/**
 * Load the cached git map (if it exists).
 *
 * @param {string} basePath - Repository root path
 * @returns {Object|null} The map, or null if not found
 */
function load(basePath) {
  return cache.load(basePath);
}

/**
 * Check if a git map exists for the given repository.
 *
 * @param {string} basePath - Repository root path
 * @returns {boolean}
 */
function exists(basePath) {
  return cache.exists(basePath);
}

module.exports = {
  init,
  update,
  status,
  load,
  exists,
  cache
};

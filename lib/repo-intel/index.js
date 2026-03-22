/**
 * Repo Intel - unified static analysis via agent-analyzer
 *
 * Thin JS wrapper around the agent-analyzer Rust binary.
 * Generates and maintains a cached artifact (repo-intel.json) covering
 * git history, AST symbols, project metadata, and doc-code sync.
 *
 * @module lib/repo-intel
 */

'use strict';

const { binary } = require('@agentsys/lib');
const cache = require('./cache');

/**
 * Initialize a new repo-intel artifact (full scan).
 *
 * @param {string} basePath - Repository root path
 * @param {Object} [options={}] - Options
 * @param {string} [options.since] - Limit history to commits after this date (ISO or relative)
 * @param {number} [options.maxCommits] - Maximum number of commits to analyze
 * @param {boolean} [options.force] - Force rebuild even if artifact exists (no-op at binary level)
 * @returns {Promise<Object>} Parsed repo-intel data
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
 * Incrementally update an existing repo-intel artifact (only new commits since last run).
 *
 * @param {string} basePath - Repository root path
 * @returns {Promise<Object>} Updated repo-intel data
 * @throws {Error} If no existing artifact is found
 */
async function update(basePath) {
  const existing = cache.load(basePath);
  if (!existing) {
    throw new Error('No repo-intel found. Run init first.');
  }

  await binary.ensureBinary();

  const mapFile = cache.getPath(basePath);
  const args = ['repo-intel', 'update', '--map-file', mapFile, basePath];

  const output = await binary.runAnalyzerAsync(args);
  const data = JSON.parse(output);
  cache.save(basePath, data);
  return data;
}

/**
 * Get the status of the current repo-intel cache.
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
 * Load the cached repo-intel artifact (if it exists).
 *
 * @param {string} basePath - Repository root path
 * @returns {Object|null} The artifact, or null if not found
 */
function load(basePath) {
  return cache.load(basePath);
}

/**
 * Check if a repo-intel artifact exists for the given repository.
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

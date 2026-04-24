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

const cp = require('child_process');
const binary = require('../binary');
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

/**
 * Spawn the analyzer binary with stdin-piped JSON.
 *
 * Used by the post-init agent orchestration: the Haiku weighter and
 * summarizer write JSON to stdout, the orchestrating skill captures it,
 * then pipes it into the analyzer via this helper. Replaces what would
 * otherwise be a tempfile dance.
 *
 * @param {string[]} args - subcommand args (must end with `--input -`)
 * @param {string} stdinJson - the JSON payload to feed to stdin
 * @returns {Promise<{stdout: string, stderr: string}>}
 */
async function runAnalyzerWithStdin(args, stdinJson) {
  const binPath = await binary.ensureBinary();
  return new Promise((resolve, reject) => {
    const proc = cp.spawn(binPath, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true
    });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (chunk) => { stdout += chunk.toString('utf8'); });
    proc.stderr.on('data', (chunk) => { stderr += chunk.toString('utf8'); });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(
          `agent-analyzer ${args.join(' ')} exited ${code}: ${stderr.trim() || stdout.trim()}`
        ));
      }
    });
    proc.stdin.write(stdinJson);
    proc.stdin.end();
  });
}

/**
 * Merge per-file descriptors (from the `repo-intel-weighter` agent)
 * into the cached artifact. Partial updates are safe — entries the
 * agent didn't refresh this run are preserved.
 *
 * @param {string} basePath - Repository root path
 * @param {Object<string, string>} descriptors - {path: descriptor, ...}
 * @returns {Promise<void>}
 */
async function applyDescriptors(basePath, descriptors) {
  if (!descriptors || typeof descriptors !== 'object') {
    throw new Error('applyDescriptors requires an object {path: descriptor}');
  }
  const mapFile = cache.getPath(basePath);
  if (!mapFile) {
    throw new Error('No repo-intel artifact for ' + basePath + '; run init first.');
  }
  const args = [
    'repo-intel', 'set-descriptors',
    '--map-file', mapFile,
    '--input', '-'
  ];
  await runAnalyzerWithStdin(args, JSON.stringify(descriptors));
}

/**
 * Set the 3-depth narrative summary (from the `repo-intel-summarizer`
 * agent). Fully replaces any previous summary.
 *
 * @param {string} basePath - Repository root path
 * @param {{depth1: string, depth3: string, depth10: string, inputHash: string}} summary
 * @returns {Promise<void>}
 */
async function applySummary(basePath, summary) {
  if (!summary || !summary.depth1 || !summary.depth3 || !summary.depth10) {
    throw new Error('applySummary requires {depth1, depth3, depth10, inputHash}');
  }
  const mapFile = cache.getPath(basePath);
  if (!mapFile) {
    throw new Error('No repo-intel artifact for ' + basePath + '; run init first.');
  }
  const args = [
    'repo-intel', 'set-summary',
    '--map-file', mapFile,
    '--input', '-'
  ];
  await runAnalyzerWithStdin(args, JSON.stringify(summary));
}

module.exports = {
  init,
  update,
  status,
  load,
  exists,
  applyDescriptors,
  applySummary,
  cache
};

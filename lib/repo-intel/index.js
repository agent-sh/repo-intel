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
  cache.save(basePath, data, options.stateDir);
  return data;
}

/**
 * Incrementally update an existing repo-intel artifact (only new commits since last run).
 *
 * @param {string} basePath - Repository root path
 * @returns {Promise<Object>} Updated repo-intel data
 * @throws {Error} If no existing artifact is found
 */
async function update(basePath, options = {}) {
  const existing = cache.load(basePath, options.stateDir);
  if (!existing) {
    throw new Error('No repo-intel found. Run init first.');
  }

  await binary.ensureBinary();

  const mapFile = cache.getPath(basePath, options.stateDir);
  const args = ['repo-intel', 'update', '--map-file', mapFile, basePath];

  const output = await binary.runAnalyzerAsync(args);
  const data = JSON.parse(output);
  cache.save(basePath, data, options.stateDir);
  return data;
}

/**
 * Get the status of the current repo-intel cache.
 *
 * @param {string} basePath - Repository root path
 * @returns {{exists: boolean, status?: Object}}
 */
function status(basePath, options = {}) {
  const map = cache.load(basePath, options.stateDir);
  if (!map) {
    return { exists: false };
  }

  const git = map.git || {};
  const fileActivity = map.fileActivity || {};
  // NOTE: the analyzer's `git` block does not emit a branch field (keys:
  // analyzedUpTo, totalCommitsAnalyzed, firstCommitDate, lastCommitDate,
  // scope, shallow). Dropped the dead `branch: null` mapping; surface the
  // commit-date span instead, which the artifact actually provides.
  return {
    exists: true,
    status: {
      generated: map.generated,
      updated: map.updated,
      analyzedUpTo: git.analyzedUpTo || null,
      firstCommitDate: git.firstCommitDate || null,
      lastCommitDate: git.lastCommitDate || null,
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
function load(basePath, options = {}) {
  return cache.load(basePath, options.stateDir);
}

/**
 * Check if a repo-intel artifact exists for the given repository.
 *
 * @param {string} basePath - Repository root path
 * @returns {boolean}
 */
function exists(basePath, options = {}) {
  return cache.exists(basePath, options.stateDir);
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
async function applyDescriptors(basePath, descriptors, options = {}) {
  if (!descriptors || typeof descriptors !== 'object') {
    throw new Error('applyDescriptors requires an object {path: descriptor}');
  }
  const mapFile = cache.getPath(basePath, options.stateDir);
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
async function applySummary(basePath, summary, options = {}) {
  if (!summary || !summary.depth1 || !summary.depth3 || !summary.depth10) {
    throw new Error('applySummary requires {depth1, depth3, depth10, inputHash}');
  }
  const mapFile = cache.getPath(basePath, options.stateDir);
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

const queries = require('./queries');

/**
 * Config-bound wrapper over the stateless functions. Construct once with a
 * repo's config and call methods without re-passing basePath/stateDir — useful
 * for multi-repo / batch use and for callers that pin a custom state dir or
 * binary path.
 *
 * @example
 *   const repo = new Repository({ basePath: '/path/to/repo', stateDir: '.ri' });
 *   await repo.init();
 *   const hot = repo.query('hotspots', { limit: 5 });
 *
 * @param {Object} config
 * @param {string} config.basePath - Repository root (required)
 * @param {string} [config.stateDir] - Override state dir (absolute or bare name)
 * @param {string} [config.binaryPath] - Override agent-analyzer binary path
 *   (sets AGENT_ANALYZER_BIN for resolution)
 */
class Repository {
  constructor(config = {}) {
    if (!config.basePath) throw new Error('Repository requires { basePath }');
    this.basePath = config.basePath;
    this.stateDir = config.stateDir;
    this.binaryPath = config.binaryPath;
  }

  _opts(extra) {
    return Object.assign({ stateDir: this.stateDir }, extra);
  }

  _withBinary(fn) {
    if (!this.binaryPath) return fn();
    const prev = process.env.AGENT_ANALYZER_BIN;
    process.env.AGENT_ANALYZER_BIN = this.binaryPath;
    try { return fn(); }
    finally {
      if (prev === undefined) delete process.env.AGENT_ANALYZER_BIN;
      else process.env.AGENT_ANALYZER_BIN = prev;
    }
  }

  init(options) { return this._withBinary(() => init(this.basePath, this._opts(options))); }
  update(options) { return this._withBinary(() => update(this.basePath, this._opts(options))); }
  status(options) { return status(this.basePath, this._opts(options)); }
  load(options) { return load(this.basePath, this._opts(options)); }
  exists(options) { return exists(this.basePath, this._opts(options)); }
  applyDescriptors(d, options) { return this._withBinary(() => applyDescriptors(this.basePath, d, this._opts(options))); }
  applySummary(s, options) { return this._withBinary(() => applySummary(this.basePath, s, this._opts(options))); }

  /**
   * Run a query by name. Forwards extra args/options to the query fn.
   * @param {string} name - query function name (e.g. 'hotspots', 'coupling')
   * @param {...*} args - args after basePath (e.g. a file path, an options object)
   */
  query(name, ...args) {
    const fn = queries[name];
    if (typeof fn !== 'function') {
      throw new Error(`Unknown query "${name}". Available: ${Object.keys(queries).join(', ')}`);
    }
    return this._withBinary(() => fn(this.basePath, ...args));
  }
}

module.exports = {
  init,
  update,
  status,
  load,
  exists,
  applyDescriptors,
  applySummary,
  cache,
  queries,
  Repository
};

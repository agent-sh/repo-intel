/**
 * Repo intel cache management
 *
 * Handles load/save of repo-intel.json in the platform-aware state directory.
 *
 * @module lib/repo-intel/cache
 */

'use strict';

const fs = require('fs');
const path = require('path');

const MAP_FILENAME = 'repo-intel.json';

/**
 * Detect the state directory name for the current platform.
 *
 * Detection order:
 * 1. AI_STATE_DIR env var
 * 2. .opencode directory present
 * 3. .codex directory present
 * 4. Default: .claude
 *
 * @param {string} basePath - Repository root
 * @returns {string} State directory name (e.g. '.claude')
 */
function detectStateDir(basePath) {
  // Explicit override always wins.
  if (process.env.AI_STATE_DIR) {
    return process.env.AI_STATE_DIR;
  }

  // Prefer a state dir that ACTUALLY EXISTS in this repo. A globally-set
  // OPENCODE_CONFIG / CODEX_HOME must not redirect writes to .opencode/.codex
  // in a repo that has no such dir — that split-brain made init write one place
  // and query read another ("no map found" silent failure). Env vars only act
  // as a tie-breaker, and only when their dir is actually present.
  const isDir = (name) => {
    try { return fs.statSync(path.join(basePath, name)).isDirectory(); }
    catch { return false; }
  };

  if (isDir('.opencode')) return '.opencode';
  if (isDir('.codex')) return '.codex';
  if (isDir('.claude')) return '.claude';

  // No state dir exists yet (fresh repo). Honor an env hint for which to create,
  // else default to .claude.
  if (process.env.OPENCODE_CONFIG || process.env.OPENCODE_CONFIG_DIR) return '.opencode';
  if (process.env.CODEX_HOME) return '.codex';
  return '.claude';
}

/**
 * Get the full path to the state directory.
 *
 * @param {string} basePath - Repository root
 * @param {string} [stateDir] - Override the state dir. An absolute path is used
 *   as-is; a bare name (e.g. '.mydir') is joined under basePath. When omitted,
 *   the platform default is detected (.claude/.opencode/.codex).
 * @returns {string} Absolute path to state directory
 */
function getStateDirPath(basePath, stateDir) {
  if (stateDir) {
    return path.isAbsolute(stateDir) ? stateDir : path.join(basePath, stateDir);
  }
  return path.join(basePath, detectStateDir(basePath));
}

/**
 * Get the path to repo-intel.json for a given repository root.
 *
 * @param {string} basePath - Repository root
 * @param {string} [stateDir] - Optional state-dir override (see getStateDirPath)
 * @returns {string} Absolute path to repo-intel.json
 */
function getPath(basePath, stateDir) {
  return path.join(getStateDirPath(basePath, stateDir), MAP_FILENAME);
}

/**
 * Ensure the state directory exists, creating it if necessary.
 *
 * @param {string} basePath - Repository root
 * @param {string} [stateDir] - Optional state-dir override
 * @returns {string} Absolute path to state directory
 */
function ensureStateDir(basePath, stateDir) {
  const dir = getStateDirPath(basePath, stateDir);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * Load repo-intel.json from the platform state directory.
 *
 * @param {string} basePath - Repository root
 * @param {string} [stateDir] - Optional state-dir override
 * @returns {Object|null} Parsed map data, or null if not found or unreadable
 */
function load(basePath, stateDir) {
  const mapPath = getPath(basePath, stateDir);
  if (!fs.existsSync(mapPath)) return null;

  try {
    const raw = fs.readFileSync(mapPath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Save repo-intel data to the platform state directory.
 * Writes atomically via a temp file to avoid partial writes.
 *
 * @param {string} basePath - Repository root
 * @param {Object} data - Map data to persist
 * @param {string} [stateDir] - Optional state-dir override
 */
function save(basePath, data, stateDir) {
  ensureStateDir(basePath, stateDir);
  const mapPath = getPath(basePath, stateDir);
  const tmpPath = mapPath + '.tmp';

  const output = {
    ...data,
    updated: new Date().toISOString()
  };

  fs.writeFileSync(tmpPath, JSON.stringify(output, null, 2), 'utf8');
  fs.renameSync(tmpPath, mapPath);
}

/**
 * Check whether a cached repo-intel.json exists for the given repository.
 *
 * @param {string} basePath - Repository root
 * @param {string} [stateDir] - Optional state-dir override
 * @returns {boolean}
 */
function exists(basePath, stateDir) {
  return fs.existsSync(getPath(basePath, stateDir));
}

module.exports = {
  load,
  save,
  exists,
  getPath,
  getStateDirPath
};

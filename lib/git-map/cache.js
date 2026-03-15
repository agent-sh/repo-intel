/**
 * Git map cache management
 *
 * Handles load/save of repo-intel.json in the platform-aware state directory.
 * Uses the same detection logic as repo-map: AI_STATE_DIR env var, then
 * presence of .opencode/.codex directories, defaulting to .claude.
 *
 * @module lib/git-map/cache
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
  if (process.env.AI_STATE_DIR) {
    return process.env.AI_STATE_DIR;
  }

  if (process.env.OPENCODE_CONFIG || process.env.OPENCODE_CONFIG_DIR) {
    return '.opencode';
  }

  try {
    if (fs.statSync(path.join(basePath, '.opencode')).isDirectory()) {
      return '.opencode';
    }
  } catch {
    // not present
  }

  if (process.env.CODEX_HOME) {
    return '.codex';
  }

  try {
    if (fs.statSync(path.join(basePath, '.codex')).isDirectory()) {
      return '.codex';
    }
  } catch {
    // not present
  }

  return '.claude';
}

/**
 * Get the full path to the state directory.
 *
 * @param {string} basePath - Repository root
 * @returns {string} Absolute path to state directory
 */
function getStateDirPath(basePath) {
  return path.join(basePath, detectStateDir(basePath));
}

/**
 * Get the path to repo-intel.json for a given repository root.
 *
 * @param {string} basePath - Repository root
 * @returns {string} Absolute path to repo-intel.json
 */
function getPath(basePath) {
  return path.join(getStateDirPath(basePath), MAP_FILENAME);
}

/**
 * Ensure the state directory exists, creating it if necessary.
 *
 * @param {string} basePath - Repository root
 * @returns {string} Absolute path to state directory
 */
function ensureStateDir(basePath) {
  const stateDir = getStateDirPath(basePath);
  if (!fs.existsSync(stateDir)) {
    fs.mkdirSync(stateDir, { recursive: true });
  }
  return stateDir;
}

/**
 * Load repo-intel.json from the platform state directory.
 *
 * @param {string} basePath - Repository root
 * @returns {Object|null} Parsed map data, or null if not found or unreadable
 */
function load(basePath) {
  const mapPath = getPath(basePath);
  if (!fs.existsSync(mapPath)) return null;

  try {
    const raw = fs.readFileSync(mapPath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Save git-map data to the platform state directory.
 * Writes atomically via a temp file to avoid partial writes.
 *
 * @param {string} basePath - Repository root
 * @param {Object} data - Map data to persist
 */
function save(basePath, data) {
  ensureStateDir(basePath);
  const mapPath = getPath(basePath);
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
 * @returns {boolean}
 */
function exists(basePath) {
  return fs.existsSync(getPath(basePath));
}

module.exports = {
  load,
  save,
  exists,
  getPath,
  getStateDirPath
};

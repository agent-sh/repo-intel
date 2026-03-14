/**
 * Git collector
 *
 * Thin wrapper for the collector pattern. Loads or initializes the git map
 * and returns a summary of key metrics for use by other tools and agents.
 *
 * @module lib/collectors/git
 */

'use strict';

const gitMap = require('../git-map');

/**
 * Collect git history data for the given repository.
 *
 * Loads the cached git map if present; otherwise runs a full init.
 * Returns a summary of health, hotspots, contributors, AI ratio,
 * bus factor, conventions, and release info.
 *
 * @param {string} basePath - Repository root path
 * @param {Object} [options={}] - Options passed to gitMap.init if no cache exists
 * @param {string} [options.since] - Limit history to commits after this date
 * @param {number} [options.maxCommits] - Maximum commits to analyze
 * @returns {Promise<Object>} Summary of git history metrics
 */
async function collect(basePath, options = {}) {
  let map = gitMap.load(basePath);
  if (!map) {
    map = await gitMap.init(basePath, options);
  }

  const queries = require('../git-map/queries');

  return {
    health: queries.health(map),
    hotspots: queries.hotspots(map, { limit: 20 }),
    contributors: queries.contributors(map),
    aiRatio: queries.aiRatio(map),
    busFactor: queries.busFactor(map),
    conventions: queries.conventions(map),
    releaseInfo: queries.releaseInfo(map)
  };
}

module.exports = { collect };

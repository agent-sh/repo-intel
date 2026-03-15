/**
 * Git collector
 *
 * Thin wrapper for the collector pattern. Loads or initializes the repo intel
 * map and returns a summary of key metrics for use by other tools and agents.
 *
 * @module lib/collectors/git
 */

'use strict';

const gitMap = require('../git-map');

/**
 * Collect git history data for the given repository.
 *
 * Loads the cached map if present; otherwise runs a full init.
 * Returns a summary of hotspots, contributors, AI ratio,
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

  const git = map.git || {};
  const contributors = map.contributors || {};
  const aiAttribution = map.aiAttribution || {};
  const conventions = map.conventions || {};
  const releases = map.releases || {};
  const fileActivity = map.fileActivity || {};

  // Hotspots: sort files by total changes
  const hotspots = Object.entries(fileActivity)
    .map(([path, activity]) => ({
      path,
      changes: activity.totalChanges || 0,
      recentChanges: activity.recentChanges || 0,
      authors: activity.authors ? Object.keys(activity.authors).length : 0,
      lastChanged: activity.lastChanged || null
    }))
    .sort((a, b) => b.changes - a.changes)
    .slice(0, 20);

  // Contributors summary
  const humans = contributors.humans || {};
  const humanList = Object.entries(humans)
    .map(([name, data]) => ({
      name,
      commits: data.commitCount || 0,
      recentCommits: data.recentCommits || 0,
      firstSeen: data.firstSeen || null,
      lastSeen: data.lastSeen || null
    }))
    .sort((a, b) => b.commits - a.commits);

  // AI ratio
  const aiTotal = (aiAttribution.attributed || 0) + (aiAttribution.heuristic || 0);
  const allCommits = git.totalCommitsAnalyzed || 0;
  const aiRatio = allCommits > 0 ? aiTotal / allCommits : 0;

  return {
    hotspots,
    contributors: humanList,
    aiRatio: {
      ratio: Math.round(aiRatio * 100) / 100,
      attributed: aiAttribution.attributed || 0,
      heuristic: aiAttribution.heuristic || 0,
      none: aiAttribution.none || 0,
      confidence: aiAttribution.confidence || 'low',
      tools: aiAttribution.tools || {}
    },
    conventions: {
      style: conventions.style || null,
      prefixes: conventions.prefixes || {},
      usesScopes: conventions.usesScopes || false
    },
    releaseInfo: {
      tagCount: releases.tags ? releases.tags.length : 0,
      lastRelease: releases.tags && releases.tags.length > 0
        ? releases.tags[releases.tags.length - 1]
        : null,
      cadence: releases.cadence || null
    }
  };
}

module.exports = { collect };

/**
 * Git map query functions
 *
 * JS wrappers over the agent-analyzer binary query subcommands.
 * Each function accepts either a loaded map object or a basePath string.
 * When given a string, the map is loaded from the platform state directory.
 *
 * @module lib/git-map/queries
 */

'use strict';

const cache = require('./cache');

/**
 * Resolve the map object from either a loaded map or a basePath string.
 *
 * @param {Object|string} mapOrPath - Loaded map object or repository root path
 * @returns {Object|null} Resolved map, or null if not found
 */
function resolveMap(mapOrPath) {
  if (typeof mapOrPath === 'string') {
    return cache.load(mapOrPath);
  }
  return mapOrPath || null;
}

/**
 * Return files sorted by change frequency (most changed first).
 *
 * @param {Object|string} mapOrPath - Loaded map or basePath
 * @param {Object} [options={}]
 * @param {number} [options.limit=10] - Maximum number of results
 * @returns {Array<{file: string, changes: number, authors: string[]}>}
 */
function hotspots(mapOrPath, options = {}) {
  const map = resolveMap(mapOrPath);
  if (!map) return [];

  const limit = options.limit || 10;
  const files = map.files || {};

  return Object.entries(files)
    .map(([file, info]) => ({
      file,
      changes: info.changes || 0,
      authors: info.authors || []
    }))
    .sort((a, b) => b.changes - a.changes)
    .slice(0, limit);
}

/**
 * Return files with zero or very few changes (least touched files).
 *
 * @param {Object|string} mapOrPath - Loaded map or basePath
 * @param {Object} [options={}]
 * @param {number} [options.limit=10] - Maximum number of results
 * @param {number} [options.maxChanges=2] - Upper bound for "cold" classification
 * @returns {Array<{file: string, changes: number, authors: string[]}>}
 */
function coldspots(mapOrPath, options = {}) {
  const map = resolveMap(mapOrPath);
  if (!map) return [];

  const limit = options.limit || 10;
  const maxChanges = options.maxChanges !== undefined ? options.maxChanges : 2;
  const files = map.files || {};

  return Object.entries(files)
    .map(([file, info]) => ({
      file,
      changes: info.changes || 0,
      authors: info.authors || []
    }))
    .filter(entry => entry.changes <= maxChanges)
    .sort((a, b) => a.changes - b.changes)
    .slice(0, limit);
}

/**
 * Return files that frequently change together with the given file (co-change analysis).
 *
 * @param {Object|string} mapOrPath - Loaded map or basePath
 * @param {string} file - File path to analyze
 * @param {Object} [options={}]
 * @param {number} [options.limit=10] - Maximum number of results
 * @returns {Array<{file: string, couplingScore: number, commonCommits: number}>}
 */
function coupling(mapOrPath, file, options = {}) {
  const map = resolveMap(mapOrPath);
  if (!map || !file) return [];

  const limit = options.limit || 10;
  const couplingData = map.coupling || {};
  const fileCoupling = couplingData[file] || {};

  return Object.entries(fileCoupling)
    .map(([coupled, info]) => ({
      file: coupled,
      couplingScore: info.score || 0,
      commonCommits: info.commonCommits || 0
    }))
    .sort((a, b) => b.couplingScore - a.couplingScore)
    .slice(0, limit);
}

/**
 * Return ownership breakdown (commit share per author) for a path.
 *
 * @param {Object|string} mapOrPath - Loaded map or basePath
 * @param {string|null} [pathFilter=null] - Directory or file path to filter by (null = whole repo)
 * @returns {Array<{author: string, commits: number, share: number}>}
 */
function ownership(mapOrPath, pathFilter = null) {
  const map = resolveMap(mapOrPath);
  if (!map) return [];

  const files = map.files || {};
  const authorCommits = {};

  for (const [file, info] of Object.entries(files)) {
    if (pathFilter && !file.startsWith(pathFilter)) continue;

    for (const author of (info.authors || [])) {
      authorCommits[author] = (authorCommits[author] || 0) + (info.changes || 1);
    }
  }

  const total = Object.values(authorCommits).reduce((sum, n) => sum + n, 0);

  return Object.entries(authorCommits)
    .map(([author, commits]) => ({
      author,
      commits,
      share: total > 0 ? Math.round((commits / total) * 1000) / 10 : 0
    }))
    .sort((a, b) => b.commits - a.commits);
}

/**
 * Return files where a single author holds the majority of knowledge (bus factor risk).
 *
 * @param {Object|string} mapOrPath - Loaded map or basePath
 * @param {Object} [options={}]
 * @param {number} [options.threshold=0.75] - Share threshold to flag as at-risk (0.0-1.0)
 * @param {number} [options.limit=20] - Maximum number of results
 * @returns {Array<{file: string, riskAuthor: string, share: number, totalAuthors: number}>}
 */
function busFactor(mapOrPath, options = {}) {
  const map = resolveMap(mapOrPath);
  if (!map) return [];

  const threshold = options.threshold !== undefined ? options.threshold : 0.75;
  const limit = options.limit || 20;
  const files = map.files || {};
  const atRisk = [];

  for (const [file, info] of Object.entries(files)) {
    const authors = info.authors || [];
    if (authors.length === 0) continue;

    const authorShare = info.authorShare || {};
    const totalChanges = info.changes || authors.length;

    // If no per-author breakdown, treat each listed author equally
    for (const author of authors) {
      const share = authorShare[author] !== undefined
        ? authorShare[author]
        : (1 / authors.length);

      if (share >= threshold) {
        atRisk.push({
          file,
          riskAuthor: author,
          share: Math.round(share * 1000) / 10,
          totalAuthors: authors.length,
          changes: totalChanges
        });
        break;
      }
    }
  }

  return atRisk
    .sort((a, b) => b.share - a.share)
    .slice(0, limit);
}

/**
 * Return the ratio of AI-generated commits to total commits for a path.
 *
 * @param {Object|string} mapOrPath - Loaded map or basePath
 * @param {string|null} [pathFilter=null] - Path to filter by (null = whole repo)
 * @returns {{aiCommits: number, humanCommits: number, totalCommits: number, aiRatio: number}}
 */
function aiRatio(mapOrPath, pathFilter = null) {
  const map = resolveMap(mapOrPath);
  if (!map) return { aiCommits: 0, humanCommits: 0, totalCommits: 0, aiRatio: 0 };

  const stats = map.aiStats || {};

  if (!pathFilter) {
    const total = (stats.aiCommits || 0) + (stats.humanCommits || 0);
    return {
      aiCommits: stats.aiCommits || 0,
      humanCommits: stats.humanCommits || 0,
      totalCommits: total,
      aiRatio: total > 0 ? Math.round((stats.aiCommits || 0) / total * 1000) / 10 : 0
    };
  }

  // Aggregate from per-file data when path filter is provided
  const files = map.files || {};
  let aiCommits = 0;
  let humanCommits = 0;

  for (const [file, info] of Object.entries(files)) {
    if (!file.startsWith(pathFilter)) continue;
    aiCommits += info.aiCommits || 0;
    humanCommits += (info.changes || 0) - (info.aiCommits || 0);
  }

  const total = aiCommits + humanCommits;
  return {
    aiCommits,
    humanCommits,
    totalCommits: total,
    aiRatio: total > 0 ? Math.round(aiCommits / total * 1000) / 10 : 0
  };
}

/**
 * Return contributors sorted by commit count.
 *
 * @param {Object|string} mapOrPath - Loaded map or basePath
 * @param {Object} [options={}]
 * @param {number} [options.limit=20] - Maximum number of results
 * @returns {Array<{author: string, commits: number, filesChanged: number}>}
 */
function contributors(mapOrPath, options = {}) {
  const map = resolveMap(mapOrPath);
  if (!map) return [];

  const limit = options.limit || 20;
  const contributorData = map.contributors || {};

  if (Object.keys(contributorData).length > 0) {
    return Object.entries(contributorData)
      .map(([author, info]) => ({
        author,
        commits: info.commits || 0,
        filesChanged: info.filesChanged || 0
      }))
      .sort((a, b) => b.commits - a.commits)
      .slice(0, limit);
  }

  // Derive from file data if contributor summary not present
  const files = map.files || {};
  const authorStats = {};

  for (const [, info] of Object.entries(files)) {
    for (const author of (info.authors || [])) {
      if (!authorStats[author]) {
        authorStats[author] = { commits: 0, filesChanged: 0 };
      }
      authorStats[author].filesChanged += 1;
      authorStats[author].commits += info.changes || 1;
    }
  }

  return Object.entries(authorStats)
    .map(([author, stats]) => ({ author, ...stats }))
    .sort((a, b) => b.commits - a.commits)
    .slice(0, limit);
}

/**
 * Return an overall project health summary derived from the git map.
 *
 * @param {Object|string} mapOrPath - Loaded map or basePath
 * @returns {{score: number, hotspotCount: number, busFactorRisk: number, activeContributors: number, totalFiles: number}}
 */
function health(mapOrPath) {
  const map = resolveMap(mapOrPath);
  if (!map) return { score: 0, hotspotCount: 0, busFactorRisk: 0, activeContributors: 0, totalFiles: 0 };

  const files = map.files || {};
  const totalFiles = Object.keys(files).length;

  const topHotspots = hotspots(mapOrPath, { limit: 10 });
  const busFactorRisk = busFactor(mapOrPath, { threshold: 0.75 }).length;
  const activeContributors = contributors(mapOrPath, { limit: 100 }).filter(c => c.commits > 1).length;

  // Simple heuristic score (0-100)
  const hotspotPenalty = Math.min(topHotspots.length * 3, 30);
  const busPenalty = Math.min(busFactorRisk * 2, 30);
  const contributorBonus = Math.min(activeContributors * 5, 20);
  const score = Math.max(0, Math.min(100, 80 - hotspotPenalty - busPenalty + contributorBonus));

  return {
    score,
    hotspotCount: topHotspots.length,
    busFactorRisk,
    activeContributors,
    totalFiles
  };
}

/**
 * Return release cadence information extracted from git tags.
 *
 * @param {Object|string} mapOrPath - Loaded map or basePath
 * @returns {{releases: Array, avgDaysBetweenReleases: number|null, latestRelease: string|null}}
 */
function releaseInfo(mapOrPath) {
  const map = resolveMap(mapOrPath);
  if (!map) return { releases: [], avgDaysBetweenReleases: null, latestRelease: null };

  const releases = map.releases || [];
  if (releases.length === 0) {
    return { releases: [], avgDaysBetweenReleases: null, latestRelease: null };
  }

  const sorted = releases.slice().sort((a, b) => new Date(b.date) - new Date(a.date));
  const latestRelease = sorted[0]?.tag || null;

  let avgDaysBetweenReleases = null;
  if (sorted.length > 1) {
    const gaps = [];
    for (let i = 0; i < sorted.length - 1; i++) {
      const diff = new Date(sorted[i].date) - new Date(sorted[i + 1].date);
      gaps.push(diff / (1000 * 60 * 60 * 24));
    }
    avgDaysBetweenReleases = Math.round(gaps.reduce((s, g) => s + g, 0) / gaps.length);
  }

  return { releases: sorted, avgDaysBetweenReleases, latestRelease };
}

/**
 * Return detected commit message conventions.
 *
 * @param {Object|string} mapOrPath - Loaded map or basePath
 * @returns {{conventionalCommits: boolean, emojiCommits: boolean, avgMessageLength: number, patterns: string[]}}
 */
function conventions(mapOrPath) {
  const map = resolveMap(mapOrPath);
  if (!map) return { conventionalCommits: false, emojiCommits: false, avgMessageLength: 0, patterns: [] };

  return map.conventions || {
    conventionalCommits: false,
    emojiCommits: false,
    avgMessageLength: 0,
    patterns: []
  };
}

/**
 * Return commit shape distribution (number of files changed per commit).
 *
 * @param {Object|string} mapOrPath - Loaded map or basePath
 * @returns {{avgFilesPerCommit: number, medianFilesPerCommit: number, distribution: Object}}
 */
function commitShape(mapOrPath) {
  const map = resolveMap(mapOrPath);
  if (!map) return { avgFilesPerCommit: 0, medianFilesPerCommit: 0, distribution: {} };

  return map.commitShape || {
    avgFilesPerCommit: 0,
    medianFilesPerCommit: 0,
    distribution: {}
  };
}

module.exports = {
  hotspots,
  coldspots,
  coupling,
  ownership,
  busFactor,
  aiRatio,
  contributors,
  health,
  releaseInfo,
  conventions,
  commitShape
};

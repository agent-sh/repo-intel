'use strict';

// Minimum binary version required by this version of repo-intel.
// The wrapper rejects (and re-downloads) any cached binary below this.
// Bump in lockstep with new analyzer subcommands the JS layer needs:
// 0.5.0 introduced set-descriptors / set-summary / find / summary /
// entry-points which lib/repo-intel/{index,queries}.js relies on.
// 0.6.0 introduced set-embeddings, slop-fixes, slop-targets, and the
// companion `agent-analyzer-embed` binary. lib/embed/* relies on these.
const ANALYZER_MIN_VERSION = '0.6.0';

// Binary name
const BINARY_NAME = 'agent-analyzer';

// GitHub repo for releases
const GITHUB_REPO = 'agent-sh/agent-analyzer';

// TTL (ms) for the in-process cache of the latest-release lookup.
// One hour is short enough that a fresh release reaches users on the
// next session, long enough that we don't hammer the GitHub API on
// every analyzer call.
const LATEST_VERSION_TTL_MS = 60 * 60 * 1000;

module.exports = {
  ANALYZER_MIN_VERSION,
  BINARY_NAME,
  GITHUB_REPO,
  LATEST_VERSION_TTL_MS
};

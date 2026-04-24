'use strict';

/**
 * Binary resolver for the agent-analyzer Rust binary.
 *
 * Handles lazy downloading and execution. Since Claude Code plugins have no
 * postinstall hooks, the binary is downloaded at runtime on first use.
 *
 * @module lib/binary
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const https = require('https');
const cp = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(cp.execFile);

const { ANALYZER_MIN_VERSION, BINARY_NAME, GITHUB_REPO, LATEST_VERSION_TTL_MS } = require('./version');
// Shared with the embed binary resolver — keeps HTTP redirect handling,
// timeout policy, and archive extraction in one place. See
// `lib/binary/shared-helpers.js`.
const sharedHelpers = require('./shared-helpers');

const PLATFORM_MAP = {
  'darwin-arm64': 'aarch64-apple-darwin',
  'linux-x64':    'x86_64-unknown-linux-gnu',
  'linux-arm64':  'aarch64-unknown-linux-gnu',
  'win32-x64':    'x86_64-pc-windows-msvc'
};

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

/**
 * Returns the expected path to the agent-analyzer binary.
 * @returns {string}
 */
function getBinaryPath() {
  const ext = process.platform === 'win32' ? '.exe' : '';
  return path.join(os.homedir(), '.agent-sh', 'bin', BINARY_NAME + ext);
}

/**
 * Returns the Rust target triple for the current platform.
 * @returns {string|null}
 */
function getPlatformKey() {
  const key = process.platform + '-' + process.arch;
  return PLATFORM_MAP[key] || null;
}

// ---------------------------------------------------------------------------
// Version helpers
// ---------------------------------------------------------------------------

/**
 * Compare a version string against a minimum requirement.
 * @param {string} version
 * @param {string} minVersion
 * @returns {boolean}
 */
function meetsMinimumVersion(version, minVersion) {
  if (!version) return false;
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) return false;
  const parts = match.slice(1).map(Number);
  const req = minVersion.split('.').map(Number);
  if (parts[0] > req[0]) return true;
  if (parts[0] < req[0]) return false;
  if (parts[1] > req[1]) return true;
  if (parts[1] < req[1]) return false;
  return parts[2] >= req[2];
}

/**
 * Run the binary with --version and return the version string, or null on failure.
 * @returns {string|null}
 */
function getVersion() {
  const binPath = getBinaryPath();
  if (!fs.existsSync(binPath)) return null;
  try {
    const out = cp.execFileSync(binPath, ['--version'], {
      timeout: 5000,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true
    });
    const match = out.trim().match(/(\d+\.\d+\.\d+)/);
    return match ? match[1] : out.trim();
  } catch (e) {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Latest-release lookup
// ---------------------------------------------------------------------------

// In-process cache for the latest tag so a single Node session doesn't
// hit the GitHub API on every analyzer call. Cleared after
// LATEST_VERSION_TTL_MS or when the cached entry is stale.
let _latestVersionCache = null; // { version: string, fetchedAt: number }

/**
 * Fetch the latest agent-analyzer release tag from GitHub.
 *
 * The previous behavior was to default downloads to ANALYZER_MIN_VERSION,
 * which meant every fresh install pulled the floor version forever -
 * a v0.5.0 release would never reach a user with a stale or absent
 * cache. This helper returns the actual latest tag (without the leading
 * `v`), with a small TTL cache and a graceful fallback to MIN_VERSION
 * when the API is unreachable or rate-limited.
 *
 * Honors GITHUB_TOKEN / GH_TOKEN for higher rate limits.
 *
 * @returns {Promise<string>} version like "0.5.0", or MIN_VERSION on error
 */
async function getLatestReleaseVersion() {
  if (
    _latestVersionCache &&
    Date.now() - _latestVersionCache.fetchedAt < LATEST_VERSION_TTL_MS
  ) {
    return _latestVersionCache.version;
  }
  return new Promise(function (resolve) {
    const ghToken = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
    const headers = {
      'User-Agent': 'agent-core/binary-resolver',
      'Accept': 'application/vnd.github+json'
    };
    if (ghToken) headers['Authorization'] = 'Bearer ' + ghToken;

    const url = 'https://api.github.com/repos/' + GITHUB_REPO + '/releases/latest';
    const fallback = function () { resolve(ANALYZER_MIN_VERSION); };

    const req = https.get(url, { headers: headers, timeout: 5000 }, function (res) {
      if (res.statusCode !== 200) {
        res.resume();
        fallback();
        return;
      }
      const chunks = [];
      res.on('data', function (chunk) { chunks.push(chunk); });
      res.on('end', function () {
        try {
          const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          // tag_name is "vX.Y.Z" or "X.Y.Z" depending on convention
          const tag = (body && body.tag_name) || '';
          const version = tag.replace(/^v/, '');
          if (/^\d+\.\d+\.\d+/.test(version)) {
            _latestVersionCache = { version: version, fetchedAt: Date.now() };
            resolve(version);
          } else {
            fallback();
          }
        } catch (e) {
          fallback();
        }
      });
      res.on('error', fallback);
    });
    req.on('error', fallback);
    req.on('timeout', function () { req.destroy(); fallback(); });
  });
}

// ---------------------------------------------------------------------------
// Availability checks
// ---------------------------------------------------------------------------

/**
 * Sync check: returns true if the binary exists and meets the minimum version.
 * Does NOT download.
 * @returns {boolean}
 */
function isAvailable() {
  const binPath = getBinaryPath();
  if (!fs.existsSync(binPath)) return false;
  const ver = getVersion();
  return meetsMinimumVersion(ver, ANALYZER_MIN_VERSION);
}

/**
 * Async check: returns true if the binary exists and meets the minimum version.
 * Does NOT download.
 * @returns {Promise<boolean>}
 */
async function isAvailableAsync() {
  return isAvailable();
}

// ---------------------------------------------------------------------------
// Download
// ---------------------------------------------------------------------------

/**
 * Build the GitHub release download URL.
 * @param {string} ver
 * @param {string} platformKey
 * @returns {string}
 */
function buildDownloadUrl(ver, platformKey) {
  const ext = process.platform === 'win32' ? '.zip' : '.tar.gz';
  return 'https://github.com/' + GITHUB_REPO + '/releases/download/v' + ver + '/' + BINARY_NAME + '-' + platformKey + ext;
}

// Thin shim so the main resolver passes its own User-Agent. All other
// HTTP details (redirect handling, GITHUB_TOKEN auth, per-request
// timeout) live in shared-helpers and are shared with the embed
// resolver.
function downloadToBuffer(url) {
  return sharedHelpers.downloadToBuffer(url, { userAgent: 'agent-core/binary-resolver' });
}

const extractTarGz = sharedHelpers.extractTarGz;
const extractZip = sharedHelpers.extractZip;

/**
 * Download and install the binary for the current platform into ~/.agent-sh/bin/.
 * @param {string} ver
 * @returns {Promise<string>}
 */
async function downloadBinary(ver) {
  const platformKey = getPlatformKey();
  if (!platformKey) {
    throw new Error(
      'Unsupported platform: ' + process.platform + '-' + process.arch + '. ' +
      'Supported platforms: ' + Object.keys(PLATFORM_MAP).join(', ')
    );
  }

  const url = buildDownloadUrl(ver, platformKey);
  process.stderr.write('Downloading ' + BINARY_NAME + ' v' + ver + ' for ' + platformKey + '...' + '\n');

  const binPath = getBinaryPath();
  const binDir = path.dirname(binPath);
  fs.mkdirSync(binDir, { recursive: true });

  let buf;
  try {
    buf = await downloadToBuffer(url);
  } catch (err) {
    throw new Error(
      'Failed to download ' + BINARY_NAME + ':\n' +
      '  URL: ' + url + '\n' +
      '  Error: ' + err.message + '\n\n' +
      'To install manually:\n' +
      '  1. Download: ' + url + '\n' +
      '  2. Extract the binary to: ' + binDir + '\n' +
      '  3. Ensure it is named: ' + path.basename(binPath)
    );
  }

  if (process.platform === 'win32') {
    await extractZip(buf, binDir, path.basename(binPath));
  } else {
    await extractTarGz(buf, binDir);
  }

  if (process.platform !== 'win32') {
    fs.chmodSync(binPath, 0o755);
  }

  const installedVer = getVersion();
  if (!installedVer) {
    throw new Error(
      BINARY_NAME + ' was downloaded to ' + binPath + ' but could not be executed. ' +
      'Check the file is a valid binary for this platform.'
    );
  }

  return binPath;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Ensure the binary exists and meets the minimum version. Downloads if needed.
 *
 * When a version isn't explicitly requested, we fetch the latest release
 * tag from GitHub instead of defaulting to ANALYZER_MIN_VERSION - the old
 * behavior meant every fresh install pulled the floor version forever.
 * Falls back to MIN_VERSION when the API is unreachable.
 *
 * @param {Object} [options]
 * @param {string} [options.version] - explicit version (skips latest lookup)
 * @returns {Promise<string>}
 */
async function ensureBinary(options) {
  const opts = options || {};
  const binPath = getBinaryPath();

  if (fs.existsSync(binPath)) {
    const ver = getVersion();
    if (meetsMinimumVersion(ver, ANALYZER_MIN_VERSION)) {
      return binPath;
    }
  }

  const targetVer = opts.version || (await getLatestReleaseVersion());
  return downloadBinary(targetVer);
}

/**
 * Sync version of ensureBinary. Downloads if needed via a child node process.
 * Prefer ensureBinary() unless a sync API is strictly required.
 *
 * When `options.version` isn't set, the spawned ensureBinary fetches the
 * latest release tag from GitHub - we no longer pin to MIN_VERSION here.
 *
 * @param {Object} [options]
 * @param {string} [options.version] - explicit version (skips latest lookup)
 * @returns {string}
 */
function ensureBinarySync(options) {
  const binPath = getBinaryPath();

  if (fs.existsSync(binPath)) {
    const ver = getVersion();
    if (meetsMinimumVersion(ver, ANALYZER_MIN_VERSION)) {
      return binPath;
    }
  }

  const selfPath = __filename;
  const versionArg = options && options.version
    ? '{ version: ' + JSON.stringify(options.version) + ' }'
    : 'undefined'; // let ensureBinary pick the latest release
  const helperLines = [
    'var b = require(' + JSON.stringify(selfPath) + ');',
    'b.ensureBinary(' + versionArg + ')',
    '  .then(function(p) { process.stdout.write(p); })',
    '  .catch(function(e) { process.stderr.write(e.message); process.exit(1); });'
  ];

  try {
    const result = cp.execFileSync(process.execPath, ['-e', helperLines.join('\n')], {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'inherit'],
      timeout: 120000
    });
    return result.trim() || binPath;
  } catch (err) {
    throw new Error('Failed to ensure binary (sync): ' + err.message);
  }
}

/**
 * Run agent-analyzer with the given arguments (sync). Downloads binary if needed.
 * @param {string[]} args
 * @param {Object} [options]
 * @returns {string}
 */
function runAnalyzer(args, options) {
  const binPath = ensureBinarySync();
  const opts = Object.assign({ encoding: 'utf8', windowsHide: true }, options);
  if (!opts.stdio) opts.stdio = ['pipe', 'pipe', 'pipe'];
  const result = cp.execFileSync(binPath, args, opts);
  return typeof result === 'string' ? result : result.toString('utf8');
}

/**
 * Run agent-analyzer with the given arguments asynchronously. Downloads binary if needed.
 * @param {string[]} args
 * @param {Object} [options]
 * @returns {Promise<string>}
 */
async function runAnalyzerAsync(args, options) {
  const binPath = await ensureBinary();
  const opts = Object.assign({ encoding: 'utf8', windowsHide: true }, options);
  const result = await execFileAsync(binPath, args, opts);
  return result.stdout;
}

module.exports = {
  ensureBinary,
  ensureBinarySync,
  runAnalyzer,
  runAnalyzerAsync,
  getBinaryPath,
  getVersion,
  getLatestReleaseVersion,
  getPlatformKey,
  isAvailable,
  isAvailableAsync,
  meetsMinimumVersion,
  buildDownloadUrl,
  PLATFORM_MAP
};

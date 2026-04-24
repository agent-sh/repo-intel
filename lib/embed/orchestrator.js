'use strict';

/**
 * High-level embed orchestration. Glues together:
 *
 *   user preference  →  binary download  →  scan/update  →  set-embeddings
 *
 * Called from the `/repo-intel enrich` command after the existing
 * weighter and summarizer Haiku agents finish; degrades to a no-op
 * when the user has chosen `embedder: "none"`.
 *
 * Also exposes `runUpdate()` for the standalone `/repo-intel embed
 * update` action group (and the `npx ... embed update` CI hook).
 *
 * @module lib/embed/orchestrator
 */

const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const preference = require('./preference');
const embedBinary = require('./binary');
const mainBinary = require('../binary');
const cache = require('../repo-intel/cache');

/**
 * Should the orchestrator run for this repo? Returns false when the
 * user has not opted in (preference unset or 'none'), which lets
 * callers safely no-op without wrapping every call site in a guard.
 *
 * @param {string} cwd
 * @returns {boolean}
 */
function isEnabled(cwd) {
  const pref = preference.read(cwd);
  return pref.embedder === 'small' || pref.embedder === 'big';
}

/**
 * Run a full scan: ensures the embed binary is downloaded, runs the
 * scan subcommand, pipes the JSON document into `agent-analyzer
 * repo-intel set-embeddings`. Returns a small status object so callers
 * can report what happened.
 *
 * @param {string} cwd
 * @returns {Promise<{ran: boolean, files?: number, durationMs?: number, reason?: string}>}
 */
async function runScan(cwd) {
  if (!isEnabled(cwd)) {
    return { ran: false, reason: 'embedder preference is "none" or unset' };
  }
  const pref = preference.read(cwd);
  const detail = preference.detailToCliArg(pref.embedderDetail || 'balanced');

  const mapFile = cache.getPath(cwd);
  if (!fs.existsSync(mapFile)) {
    return { ran: false, reason: 'no repo-intel map found; run `/repo-intel init` first' };
  }

  const start = Date.now();
  const embedBin = await embedBinary.ensureBinary();
  const mainBin = await mainBinary.ensureBinary();

  const result = await streamEmbedToSetEmbeddings(
    embedBin,
    ['scan', cwd, '--variant', pref.embedder, '--detail', detail],
    mainBin,
    mapFile
  );
  return Object.assign({ ran: true, durationMs: Date.now() - start }, result);
}

/**
 * Run a delta update: only re-embeds files whose content hash differs
 * from the existing sidecar. Falls back to a full scan when no
 * sidecar exists yet.
 *
 * @param {string} cwd
 * @returns {Promise<{ran: boolean, files?: number, durationMs?: number, reason?: string}>}
 */
async function runUpdate(cwd) {
  if (!isEnabled(cwd)) {
    return { ran: false, reason: 'embedder preference is "none" or unset' };
  }
  const pref = preference.read(cwd);
  const detail = preference.detailToCliArg(pref.embedderDetail || 'balanced');

  const mapFile = cache.getPath(cwd);
  if (!fs.existsSync(mapFile)) {
    return { ran: false, reason: 'no repo-intel map; run `/repo-intel init` then `enrich`' };
  }

  const start = Date.now();
  const embedBin = await embedBinary.ensureBinary();
  const mainBin = await mainBinary.ensureBinary();

  const result = await streamEmbedToSetEmbeddings(
    embedBin,
    ['update', cwd, '--map-file', mapFile, '--variant', pref.embedder, '--detail', detail],
    mainBin,
    mapFile
  );
  return Object.assign({ ran: true, durationMs: Date.now() - start }, result);
}

/**
 * Status snapshot: which preference is set, whether the binary is
 * installed, whether the sidecar exists, when it was last updated.
 *
 * @param {string} cwd
 * @returns {{enabled: boolean, embedder?: string, embedderDetail?: string, binaryInstalled: boolean, sidecarExists: boolean, sidecarPath?: string}}
 */
function status(cwd) {
  const pref = preference.read(cwd);
  const mapFile = cache.getPath(cwd);
  const sidecarPath = deriveSidecarPath(mapFile);
  return {
    enabled: isEnabled(cwd),
    embedder: pref.embedder,
    embedderDetail: pref.embedderDetail,
    binaryInstalled: embedBinary.isAvailable(),
    sidecarExists: fs.existsSync(sidecarPath),
    sidecarPath: sidecarPath
  };
}

/**
 * Stream the embed binary's stdout directly into the main binary's
 * `set-embeddings --input -` stdin. The intermediate JSON document
 * can run into the megabytes for big repos at high detail; piping
 * keeps memory flat instead of buffering the whole document.
 *
 * Both processes' stderr is inherited so progress lines (model
 * download, "[OK] embeddings merged: …") reach the user. The promise
 * resolves with `{ files }` when both children exit cleanly; rejects
 * with the failing child's exit code otherwise.
 */
function streamEmbedToSetEmbeddings(embedBinPath, embedArgs, mainBinPath, mapFile) {
  return new Promise(function (resolve, reject) {
    const embedChild = cp.spawn(embedBinPath, embedArgs, {
      stdio: ['ignore', 'pipe', 'inherit'],
      windowsHide: true
    });
    const setChild = cp.spawn(
      mainBinPath,
      ['repo-intel', 'set-embeddings', '--map-file', mapFile, '--input', '-'],
      { stdio: ['pipe', 'pipe', 'inherit'], windowsHide: true }
    );

    embedChild.stdout.pipe(setChild.stdin);

    // Capture set-embeddings stdout (its merge summary) to extract
    // the file count without buffering the embed document. The summary
    // is a single line like "[OK] embeddings merged: N files, …".
    let setStdout = '';
    setChild.stdout.on('data', function (d) { setStdout += d.toString('utf8'); });

    let embedExit = null;
    let setExit = null;
    let settled = false;

    function maybeFinish() {
      if (settled) return;
      if (embedExit === null || setExit === null) return;
      settled = true;
      if (embedExit !== 0) {
        reject(new Error(embedBinary.EMBED_BINARY_NAME + ' exited with code ' + embedExit));
        return;
      }
      if (setExit !== 0) {
        reject(new Error('agent-analyzer set-embeddings exited with code ' + setExit));
        return;
      }
      const m = setStdout.match(/(\d+)\s+files?/);
      const files = m ? parseInt(m[1], 10) : undefined;
      resolve({ files: files });
    }

    embedChild.on('error', function (e) { if (!settled) { settled = true; reject(e); } });
    setChild.on('error', function (e) { if (!settled) { settled = true; reject(e); } });
    embedChild.on('close', function (code) { embedExit = code; maybeFinish(); });
    setChild.on('close', function (code) { setExit = code; maybeFinish(); });
  });
}

function deriveSidecarPath(mapFile) {
  if (!mapFile) return '';
  const dir = path.dirname(mapFile);
  const stem = path.basename(mapFile, path.extname(mapFile));
  return path.join(dir, stem + '.embeddings.bin');
}

module.exports = {
  isEnabled,
  runScan,
  runUpdate,
  status,
  deriveSidecarPath
};

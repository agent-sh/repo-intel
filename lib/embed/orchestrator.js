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

  const json = await execEmbedToJson(embedBin, [
    'scan',
    cwd,
    '--variant', pref.embedder,
    '--detail', detail
  ]);
  await pipeJsonToSetEmbeddings(mainBin, mapFile, json);

  const parsed = safeParse(json);
  return {
    ran: true,
    files: parsed && parsed.files ? Object.keys(parsed.files).length : undefined,
    durationMs: Date.now() - start
  };
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

  const json = await execEmbedToJson(embedBin, [
    'update',
    cwd,
    '--map-file', mapFile,
    '--variant', pref.embedder,
    '--detail', detail
  ]);
  await pipeJsonToSetEmbeddings(mainBin, mapFile, json);

  const parsed = safeParse(json);
  return {
    ran: true,
    files: parsed && parsed.files ? Object.keys(parsed.files).length : undefined,
    durationMs: Date.now() - start
  };
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
 * Run the embed binary and capture stdout. Inherits stderr so progress
 * lines (model download, etc) reach the user.
 */
function execEmbedToJson(binPath, args) {
  return new Promise(function (resolve, reject) {
    const child = cp.spawn(binPath, args, {
      stdio: ['ignore', 'pipe', 'inherit'],
      windowsHide: true
    });
    const chunks = [];
    child.stdout.on('data', function (d) { chunks.push(d); });
    child.on('error', reject);
    child.on('close', function (code) {
      if (code !== 0) {
        reject(new Error(embedBinary.EMBED_BINARY_NAME + ' exited with code ' + code));
        return;
      }
      resolve(Buffer.concat(chunks).toString('utf8'));
    });
  });
}

/**
 * Pipe a JSON document into `agent-analyzer repo-intel set-embeddings
 * --map-file <map> --input -`. Used by both scan and update.
 */
function pipeJsonToSetEmbeddings(mainBinPath, mapFile, json) {
  return new Promise(function (resolve, reject) {
    const child = cp.spawn(
      mainBinPath,
      ['repo-intel', 'set-embeddings', '--map-file', mapFile, '--input', '-'],
      { stdio: ['pipe', 'inherit', 'inherit'], windowsHide: true }
    );
    child.on('error', reject);
    child.on('close', function (code) {
      if (code !== 0) {
        reject(new Error('agent-analyzer set-embeddings exited with code ' + code));
        return;
      }
      resolve();
    });
    child.stdin.write(json);
    child.stdin.end();
  });
}

function safeParse(s) {
  try {
    return JSON.parse(s);
  } catch (e) {
    return null;
  }
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

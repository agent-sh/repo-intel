'use strict';

/**
 * Tests for the dual-process embed pipe (streamEmbedToSetEmbeddings).
 *
 * Uses real on-disk fake "binaries" (executable node scripts that ignore
 * their args) as the embed + set-embeddings processes, so we exercise
 * actual spawn/pipe/exit/stderr behavior — not mocks. Guards the failure
 * modes that previously left the promise unsettled forever or leaked the
 * surviving process.
 *
 * Run with:  node test/orchestrator.test.js
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const orchestrator = require('../lib/embed/orchestrator');

const stream = orchestrator.streamEmbedToSetEmbeddings;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ri-pipe-'));

// Write an executable node script that ignores argv and runs `body`.
function fakeBin(name, body) {
  const p = path.join(tmp, name);
  fs.writeFileSync(p, `#!/usr/bin/env node\n${body}\n`);
  fs.chmodSync(p, 0o755);
  return p;
}

let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); console.log(`  ok  ${name}`); passed++; }
  catch (e) { console.log(`  FAIL ${name}\n       ${e.message}`); failed++; }
}
function withTimeout(p, ms, label) {
  return Promise.race([
    p,
    new Promise((_, rej) => setTimeout(() => rej(new Error(`HANG: ${label} unsettled in ${ms}ms`)), ms)),
  ]);
}

(async () => {
  console.log('embed pipe (streamEmbedToSetEmbeddings)');

  // happy: embed emits a doc, set reads stdin and prints a merge summary
  await test('resolves with file count when both exit 0', async () => {
    const embed = fakeBin('embed-ok', 'process.stdout.write(JSON.stringify({files:{}}));');
    const set = fakeBin('set-ok',
      'process.stdin.resume();process.stdin.on("end",()=>{console.log("[OK] embeddings merged: 7 files");process.exit(0)});');
    const r = await withTimeout(stream(embed, [], set, '/tmp/m'), 5000, 'happy');
    assert.equal(r.files, 7);
  });

  // embed fails: reject WITH stderr, not a bare code, no hang
  await test('rejects with embed stderr on non-zero embed exit', async () => {
    const embed = fakeBin('embed-fail', 'process.stderr.write("model download failed");process.exit(3);');
    const set = fakeBin('set-drain', 'process.stdin.resume();process.stdin.on("end",()=>process.exit(0));');
    let err;
    try { await withTimeout(stream(embed, [], set, '/tmp/m'), 5000, 'embed-fail'); }
    catch (e) { err = e; }
    assert.ok(err, 'should reject');
    assert.ok(/exited 3/.test(err.message), 'exit code: ' + err.message);
    assert.ok(/model download failed/.test(err.message), 'stderr: ' + err.message);
  });

  // set fails mid-pipe: reject with set stderr, must NOT hang (the FD-leak case)
  await test('rejects and does not hang when set exits non-zero', async () => {
    const embed = fakeBin('embed-big', 'process.stdout.write("x".repeat(200000));process.exit(0);');
    const set = fakeBin('set-fail', 'process.stderr.write("bad map");process.exit(4);');
    let err;
    try { await withTimeout(stream(embed, [], set, '/tmp/m'), 5000, 'set-fail'); }
    catch (e) { err = e; }
    assert.ok(err, 'should reject');
    assert.ok(/exited 4/.test(err.message) || /bad map/.test(err.message), 'surfaces set failure: ' + (err && err.message));
  });

  // spawn error: bogus embed path → reject, no hang
  await test('rejects on embed spawn error (bad path)', async () => {
    const set = fakeBin('set-noop', 'process.stdin.resume();');
    let err;
    try { await withTimeout(stream('/no/such/embed-bin', [], set, '/tmp/m'), 5000, 'spawn-err'); }
    catch (e) { err = e; }
    assert.ok(err, 'should reject on ENOENT');
  });

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`\norchestrator pipe: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();

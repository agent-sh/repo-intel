'use strict';

/**
 * Tests for scripts/repo-intel.js - the paths that run without the analyzer binary.
 *
 * Run with:  node test/cli.test.js
 */

const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const { run, parse, QUERIES } = require('../scripts/repo-intel.js');
const queries = require('../lib/repo-intel/queries');

const SCRIPT = path.join(__dirname, '..', 'scripts', 'repo-intel.js');

let passed = 0;
let failed = 0;
const pending = [];
function test(name, fn) {
  pending.push(Promise.resolve().then(fn).then(
    () => { console.log(`  ok  ${name}`); passed++; },
    e => { console.log(`  FAIL ${name}\n       ${e.message}`); failed++; }
  ));
}

function scratch() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ri-cli-'));
  fs.mkdirSync(path.join(dir, '.claude'));
  return dir;
}

console.log('repo-intel CLI');

test('every query type maps to a function the queries module exports', () => {
  for (const [type, fn] of Object.entries(QUERIES)) {
    const src = fn.toString();
    const m = /q\.([a-zA-Z]+)\(/.exec(src);
    assert.ok(m, `${type} has no q.<fn>() call`);
    assert.equal(typeof queries[m[1]], 'function', `${type} calls q.${m[1]}, which is not exported`);
  }
});

test('parse splits positionals and camel-cases flags', () => {
  assert.deepEqual(parse(['init', '--max-commits=30', '--force']), {
    positional: ['init'],
    options: { maxCommits: '30', force: true }
  });
});

test('unknown query is a usage error that lists the types', async () => {
  await assert.rejects(run(['query', 'ai-ratio']), /unknown query "ai-ratio".*hotspots/);
});

test('a query that needs an argument says so', async () => {
  const dir = scratch();
  try {
    fs.writeFileSync(path.join(dir, '.claude', 'repo-intel.json'), '{}');
    await assert.rejects(run(['query', 'coupling'], dir), /coupling: a file path is required/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('query and enrich without a map fail cleanly', async () => {
  const dir = scratch();
  try {
    assert.equal((await run(['query', 'hotspots'], dir)).success, false);
    assert.equal((await run(['enrich', 'plan'], dir)).success, false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('enrich plan reads the raw artifact, so descriptor batches are not empty', async () => {
  const dir = scratch();
  try {
    const fileActivity = {};
    for (let i = 0; i < 35; i++) fileActivity[`src/f${i}.js`] = { changes: 40 - i, recentChanges: 1, authors: ['a'] };
    fs.writeFileSync(path.join(dir, '.claude', 'repo-intel.json'), JSON.stringify({ fileActivity }));
    const plan = await run(['enrich', 'plan'], dir);
    assert.equal(plan.success, true);
    assert.equal(plan.weighter.length, 2);
    assert.equal(plan.weighter[0].paths.length, 30);
    assert.equal(plan.weighter[0].agent, 'repo-intel:repo-intel-weighter');
    assert.match(plan.summarizer.prompt, /3-depth summary/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('apply-descriptors drops paths the map does not know and empty values', async () => {
  const dir = scratch();
  try {
    fs.writeFileSync(path.join(dir, '.claude', 'repo-intel.json'), JSON.stringify({ fileActivity: { 'src/a.js': {} } }));
    const reply = path.join(dir, 'reply.txt');
    fs.writeFileSync(reply, '=== DESCRIPTORS_START ===\n{"../../etc/passwd": "x", "src/a.js": "  "}\n=== DESCRIPTORS_END ===');
    const r = await run(['enrich', 'apply-descriptors', reply], dir);
    assert.deepEqual(r, { success: true, descriptorsAdded: 0, skipped: 2 });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('embed choose validates and persists the preference', async () => {
  const dir = scratch();
  try {
    await assert.rejects(run(['embed', 'choose', 'huge'], dir), /embedder must be one of/);
    const r = await run(['embed', 'choose', 'small', '--detail=compact'], dir);
    assert.equal(r.preference.embedder, 'small');
    assert.equal(r.preference.embedderDetail, 'compact');
    const none = await run(['embed', 'choose', 'none'], dir);
    assert.equal(none.preference.embedder, 'none');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('CLI exits 2 with usage on a bad action', () => {
  try {
    execFileSync(process.execPath, [SCRIPT, 'frobnicate'], { stdio: 'pipe' });
    assert.fail('expected a non-zero exit');
  } catch (e) {
    assert.equal(e.status, 2);
    assert.match(String(e.stderr), /usage:/);
  }
});

Promise.all(pending).then(() => {
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
});

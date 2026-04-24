'use strict';

/**
 * Unit tests for the enrich helpers - the deterministic parts that can
 * be tested without spawning real Task subagents or calling the binary.
 *
 * Run with:  node test/enrich.test.js
 *
 * Exits non-zero on any failure so it slots into the existing
 * `npm test` smoke pattern.
 */

const assert = require('node:assert/strict');
const enrich = require('../lib/repo-intel/enrich');

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); console.log(`  ok  ${name}`); passed++; }
  catch (e) { console.log(`  FAIL ${name}\n       ${e.message}`); failed++; }
}

console.log('enrich helpers');

test('parseMarkers extracts JSON between markers', () => {
  const out = `preamble noise
=== SUMMARY_START ===
{"depth1": "x", "depth3": "y", "depth10": "z"}
=== SUMMARY_END ===
trailing noise`;
  const parsed = enrich.parseMarkers(out, 'SUMMARY');
  assert.deepEqual(parsed, { depth1: 'x', depth3: 'y', depth10: 'z' });
});

test('parseMarkers strips fenced code blocks', () => {
  const out = `=== DESCRIPTORS_START ===
\`\`\`json
{"src/a.rs": "alpha"}
\`\`\`
=== DESCRIPTORS_END ===`;
  const parsed = enrich.parseMarkers(out, 'DESCRIPTORS');
  assert.deepEqual(parsed, { 'src/a.rs': 'alpha' });
});

test('parseMarkers returns null when start marker missing', () => {
  assert.equal(enrich.parseMarkers('no markers here', 'SUMMARY'), null);
});

test('parseMarkers returns null when end marker missing', () => {
  const out = `=== SUMMARY_START ===\n{"depth1": "x"}\nno end`;
  assert.equal(enrich.parseMarkers(out, 'SUMMARY'), null);
});

test('parseMarkers returns null when inner is not valid JSON', () => {
  const out = `=== SUMMARY_START ===\nnot json at all\n=== SUMMARY_END ===`;
  assert.equal(enrich.parseMarkers(out, 'SUMMARY'), null);
});

test('parseMarkers tolerates non-string input gracefully', () => {
  assert.equal(enrich.parseMarkers(null, 'SUMMARY'), null);
  assert.equal(enrich.parseMarkers(undefined, 'SUMMARY'), null);
  assert.equal(enrich.parseMarkers(42, 'SUMMARY'), null);
});

test('topPaths ranks by changes + 2*recentChanges, breaks ties on path asc', () => {
  const map = {
    fileActivity: {
      'src/c.rs': { changes: 5, recentChanges: 0 },   // score 5
      'src/a.rs': { changes: 5, recentChanges: 0 },   // score 5 (ties with c, alphabetical wins)
      'src/b.rs': { changes: 1, recentChanges: 5 },   // score 11 (highest)
      'src/d.rs': { changes: 0, recentChanges: 0 }    // dropped (score 0)
    }
  };
  const top = enrich.topPaths(map, 10);
  assert.deepEqual(top, ['src/b.rs', 'src/a.rs', 'src/c.rs']);
});

test('topPaths respects limit', () => {
  const map = {
    fileActivity: {
      'a.rs': { changes: 10, recentChanges: 0 },
      'b.rs': { changes: 8, recentChanges: 0 },
      'c.rs': { changes: 6, recentChanges: 0 },
      'd.rs': { changes: 4, recentChanges: 0 }
    }
  };
  const top = enrich.topPaths(map, 2);
  assert.deepEqual(top, ['a.rs', 'b.rs']);
});

test('topPaths handles missing fileActivity gracefully', () => {
  assert.deepEqual(enrich.topPaths({}, 10), []);
});

test('summaryInputHash is deterministic for the same inputs', () => {
  const h1 = enrich.summaryInputHash('readme', { 'package.json': { name: 'x' } }, [{ path: 'a.rs' }]);
  const h2 = enrich.summaryInputHash('readme', { 'package.json': { name: 'x' } }, [{ path: 'a.rs' }]);
  assert.equal(h1, h2);
  assert.match(h1, /^sha256:[0-9a-f]{16}$/);
});

test('summaryInputHash changes when inputs change', () => {
  const h1 = enrich.summaryInputHash('readme A', {}, []);
  const h2 = enrich.summaryInputHash('readme B', {}, []);
  assert.notEqual(h1, h2);
});

test('chunk splits a list into bounded sublists', () => {
  assert.deepEqual(enrich.chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  assert.deepEqual(enrich.chunk([], 30), []);
  assert.deepEqual(enrich.chunk([1, 2, 3], 30), [[1, 2, 3]]);
});

test('buildSummarizerPrompt embeds inputs as JSON', () => {
  const prompt = enrich.buildSummarizerPrompt('/repo', 'readme text', { 'package.json': {} }, []);
  assert.ok(prompt.includes('readme text'), 'README should appear');
  assert.ok(prompt.includes('SUMMARY_START'), 'should reference output marker');
  assert.ok(prompt.includes('/repo'), 'should reference repoPath');
});

test('buildWeighterPrompt embeds the path batch', () => {
  const prompt = enrich.buildWeighterPrompt('/repo', ['a.rs', 'b.rs']);
  assert.ok(prompt.includes('a.rs'));
  assert.ok(prompt.includes('b.rs'));
  assert.ok(prompt.includes('DESCRIPTORS_START'));
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);

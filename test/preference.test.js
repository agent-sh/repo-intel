'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const preference = require('../lib/embed/preference');

function tempRepo() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'repo-intel-pref-'));
}

function cleanup(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

const tests = [
  function read_returns_empty_object_when_file_absent() {
    const cwd = tempRepo();
    try {
      const pref = preference.read(cwd);
      assert.deepStrictEqual(pref, {});
    } finally {
      cleanup(cwd);
    }
  },

  function update_creates_state_dir_and_persists() {
    const cwd = tempRepo();
    try {
      preference.update(cwd, { embedder: 'big', embedderDetail: 'balanced' });
      const onDisk = JSON.parse(fs.readFileSync(preference.preferencePath(cwd), 'utf8'));
      assert.strictEqual(onDisk.embedder, 'big');
      assert.strictEqual(onDisk.embedderDetail, 'balanced');
    } finally {
      cleanup(cwd);
    }
  },

  function update_merges_into_existing_preference() {
    const cwd = tempRepo();
    try {
      preference.update(cwd, { embedder: 'big' });
      preference.update(cwd, { embedderDetail: 'maximum' });
      const pref = preference.read(cwd);
      assert.strictEqual(pref.embedder, 'big');
      assert.strictEqual(pref.embedderDetail, 'maximum');
    } finally {
      cleanup(cwd);
    }
  },

  function reset_clears_embedder_fields_only() {
    const cwd = tempRepo();
    try {
      preference.update(cwd, {
        embedder: 'small',
        embedderDetail: 'compact',
        source: 'github-issues' // unrelated existing preference
      });
      preference.reset(cwd);
      const pref = preference.read(cwd);
      assert.strictEqual(pref.embedder, undefined);
      assert.strictEqual(pref.embedderDetail, undefined);
      assert.strictEqual(pref.source, 'github-issues');
    } finally {
      cleanup(cwd);
    }
  },

  function hasEmbedderChoice_only_true_for_valid_values() {
    const cwd = tempRepo();
    try {
      assert.strictEqual(preference.hasEmbedderChoice(cwd), false);
      preference.update(cwd, { embedder: 'invalid' });
      assert.strictEqual(preference.hasEmbedderChoice(cwd), false);
      preference.update(cwd, { embedder: 'none' });
      assert.strictEqual(preference.hasEmbedderChoice(cwd), true);
      preference.update(cwd, { embedder: 'big' });
      assert.strictEqual(preference.hasEmbedderChoice(cwd), true);
    } finally {
      cleanup(cwd);
    }
  },

  function hasDetailChoice_only_true_for_valid_values() {
    const cwd = tempRepo();
    try {
      assert.strictEqual(preference.hasDetailChoice(cwd), false);
      preference.update(cwd, { embedderDetail: 'huge' });
      assert.strictEqual(preference.hasDetailChoice(cwd), false);
      preference.update(cwd, { embedderDetail: 'maximum' });
      assert.strictEqual(preference.hasDetailChoice(cwd), true);
    } finally {
      cleanup(cwd);
    }
  },

  function detailToCliArg_maps_known_values() {
    assert.strictEqual(preference.detailToCliArg('compact'), 'compact');
    assert.strictEqual(preference.detailToCliArg('balanced'), 'balanced');
    assert.strictEqual(preference.detailToCliArg('maximum'), 'maximum');
    // Unknown / missing input falls back to the recommended default.
    assert.strictEqual(preference.detailToCliArg(undefined), 'balanced');
    assert.strictEqual(preference.detailToCliArg('garbage'), 'balanced');
  },

  function preferencePath_uses_existing_state_dir_when_present() {
    const cwd = tempRepo();
    try {
      fs.mkdirSync(path.join(cwd, '.opencode'), { recursive: true });
      const p = preference.preferencePath(cwd);
      assert.ok(p.includes('.opencode'), 'expected .opencode in path: ' + p);
    } finally {
      cleanup(cwd);
    }
  },

  function preferencePath_defaults_to_dot_claude_when_none_exist() {
    const cwd = tempRepo();
    try {
      const p = preference.preferencePath(cwd);
      assert.ok(p.includes('.claude'), 'expected .claude default: ' + p);
    } finally {
      cleanup(cwd);
    }
  },

  function read_handles_corrupt_json_gracefully() {
    const cwd = tempRepo();
    try {
      const p = preference.preferencePath(cwd);
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, 'not valid json {{{');
      const pref = preference.read(cwd);
      assert.deepStrictEqual(pref, {});
    } finally {
      cleanup(cwd);
    }
  }
];

let passed = 0;
let failed = 0;
for (const t of tests) {
  try {
    t();
    passed++;
    process.stdout.write('  ok ' + t.name + '\n');
  } catch (e) {
    failed++;
    process.stdout.write('  FAIL ' + t.name + '\n  ' + e.stack + '\n');
  }
}

process.stdout.write('\npreference.test.js: ' + passed + ' passed, ' + failed + ' failed\n');
process.exit(failed === 0 ? 0 : 1);

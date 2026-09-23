#!/usr/bin/env node
// repo-intel.js - run /repo-intel actions (init, update, status, query, enrich steps, embed) and print JSON
'use strict';

const fs = require('fs');
const path = require('path');

const lib = path.join(__dirname, '..', 'lib');

const USAGE = `usage:
  repo-intel.js status | init [--since=DATE] [--max-commits=N] [--force] | update
  repo-intel.js query <type> [arg...] [--limit=N] [--depth=1|3|10] [--min-changes=N] [--file=PATH]
  repo-intel.js queries                              list query types
  repo-intel.js enrich plan [--limit=N]              summarizer and weighter prompts as JSON
  repo-intel.js enrich apply-summary <file|->        parse SUMMARY_START/END from an agent reply and store it
  repo-intel.js enrich apply-descriptors <file|->    parse DESCRIPTORS_START/END from an agent reply and store them
  repo-intel.js embed status | update | reset | choose <none|small|big> [--detail=compact|balanced|maximum]`;

class UsageError extends Error {}

function parse(argv) {
  const positional = [];
  const options = {};
  for (const a of argv) {
    if (a.startsWith('--')) {
      const [k, ...rest] = a.slice(2).split('=');
      options[k.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = rest.length ? rest.join('=') : true;
    } else {
      positional.push(a);
    }
  }
  return { positional, options };
}

const int = v => (v === undefined || v === true ? undefined : Number.parseInt(v, 10));

function need(value, what) {
  if (!value) throw new UsageError(`${what} required`);
  return value;
}

// Query type -> call. `args` are the positionals after the type, joined for multi-word concepts.
const QUERIES = {
  hotspots: (q, cwd, a, o) => q.hotspots(cwd, { limit: int(o.limit) }),
  coldspots: (q, cwd, a, o) => q.coldspots(cwd, { limit: int(o.limit) }),
  bugspots: (q, cwd, a, o) => q.bugspots(cwd, { limit: int(o.limit) }),
  // The binary's coupling takes no --top; the caller trims rows.
  coupling: (q, cwd, a) => q.coupling(cwd, need(a[0], 'coupling: a file path is')),
  ownership: (q, cwd, a) => q.ownership(cwd, need(a[0], 'ownership: a file or directory is')),
  // The binary's bus-factor takes no --top or --adjust-for-ai (removed in agent-analyzer 0.5).
  'bus-factor': (q, cwd) => q.busFactor(cwd, {}),
  norms: (q, cwd) => q.norms(cwd),
  areas: (q, cwd) => q.areas(cwd),
  contributors: (q, cwd, a, o) => q.contributors(cwd, { limit: int(o.limit) }),
  'release-info': (q, cwd) => q.releaseInfo(cwd),
  health: (q, cwd) => q.health(cwd),
  'file-history': (q, cwd, a) => q.fileHistory(cwd, need(a[0], 'file-history: a file path is')),
  conventions: (q, cwd) => q.conventions(cwd),
  'test-gaps': (q, cwd, a, o) => q.testGaps(cwd, { limit: int(o.limit), minChanges: int(o.minChanges) }),
  'diff-risk': (q, cwd, a) => q.diffRisk(cwd, need(a.join(','), 'diff-risk: comma-separated files are').split(',').filter(Boolean)),
  'doc-drift': (q, cwd, a, o) => q.docDrift(cwd, { limit: int(o.limit) }),
  onboard: (q, cwd) => q.onboard(cwd),
  'can-i-help': (q, cwd) => q.canIHelp(cwd),
  painspots: (q, cwd, a, o) => q.painspots(cwd, { limit: int(o.limit) }),
  'entry-points': (q, cwd, a) => q.entryPoints(cwd, a.length ? { files: a.join(',') } : {}),
  'project-info': (q, cwd) => q.projectInfo(cwd),
  communities: (q, cwd) => q.communities(cwd),
  boundaries: (q, cwd, a, o) => q.boundaries(cwd, { limit: int(o.limit) }),
  'area-of': (q, cwd, a) => q.areaOf(cwd, need(a[0], 'area-of: a file path is')),
  'community-health': (q, cwd, a) => q.communityHealth(cwd, need(a[0], 'community-health: a community id is')),
  symbols: (q, cwd, a) => q.symbols(cwd, need(a[0], 'symbols: a file path is')),
  dependents: (q, cwd, a, o) => q.dependents(cwd, need(a[0], 'dependents: a symbol name is'), typeof o.file === 'string' ? o.file : undefined),
  'stale-docs': (q, cwd, a, o) => q.staleDocs(cwd, { limit: int(o.limit) }),
  find: (q, cwd, a, o) => q.find(cwd, need(a.join(' ').replace(/^["']|["']$/g, ''), 'find: a concept is'), { limit: int(o.limit) }),
  summary: (q, cwd, a, o) => q.summary(cwd, { depth: int(o.depth) }),
  'slop-fixes': (q, cwd) => q.slopFixes(cwd),
  'slop-targets': (q, cwd, a, o) => q.slopTargets(cwd, { top: int(o.limit) || 10 })
};

// Queries and enrich read the raw artifact (repo-intel.json). exists() checks the converted
// repo-map.json view, which a map built by the analyzer directly does not have.
function hasMap(repoIntel, cwd) {
  return fs.existsSync(repoIntel.cache.getPath(cwd)) || repoIntel.exists(cwd);
}

function readInput(src) {
  return !src || src === '-' ? fs.readFileSync(0, 'utf8') : fs.readFileSync(src, 'utf8');
}

async function enrich(repoIntel, cwd, sub, a, o) {
  const e = require(path.join(lib, 'repo-intel', 'enrich'));
  if (!hasMap(repoIntel, cwd)) return { success: false, error: 'No repo-intel map. Run /repo-intel init first.' };
  // The raw artifact carries fileActivity; load() returns the converted repo-map view without it,
  // which made topPaths() empty and enrich add zero descriptors.
  const raw = repoIntel.loadRaw(cwd);
  if (!raw) return { success: false, error: 'repo-intel.json unreadable' };
  if (sub === 'plan') {
    const readme = e.readReadme(cwd);
    const manifests = e.readManifests(cwd);
    const hotspots = e.topHotspots(cwd, raw, 10);
    const batches = e.chunk(e.topPaths(raw, int(o.limit) || 500), 30);
    return {
      success: true,
      summarizer: { agent: 'repo-intel:repo-intel-summarizer', prompt: e.buildSummarizerPrompt(cwd, readme, manifests, hotspots) },
      weighter: batches.map(paths => ({ agent: 'repo-intel:repo-intel-weighter', paths, prompt: e.buildWeighterPrompt(cwd, paths) })),
      embed: embedState(repoIntel, cwd)
    };
  }
  if (sub === 'apply-summary') {
    const s = e.parseMarkers(readInput(a[0]), 'SUMMARY');
    if (!s || !s.depth1 || !s.depth3 || !s.depth10) return { success: false, error: 'no SUMMARY_START/END block with depth1, depth3 and depth10' };
    s.inputHash = e.summaryInputHash(e.readReadme(cwd), e.readManifests(cwd), e.topHotspots(cwd, raw, 10));
    await repoIntel.applySummary(cwd, { depth1: s.depth1, depth3: s.depth3, depth10: s.depth10, inputHash: s.inputHash });
    return { success: true, summaryPopulated: true };
  }
  if (sub === 'apply-descriptors') {
    const d = e.parseMarkers(readInput(a[0]), 'DESCRIPTORS');
    if (!d || typeof d !== 'object' || Array.isArray(d)) return { success: false, error: 'no DESCRIPTORS_START/END block with a JSON object' };
    const known = new Set(Object.keys(raw.fileActivity || {}));
    const cleaned = Object.fromEntries(Object.entries(d)
      .filter(([p, v]) => known.has(p) && typeof v === 'string' && v.trim()));
    if (Object.keys(cleaned).length) await repoIntel.applyDescriptors(cwd, cleaned);
    return { success: true, descriptorsAdded: Object.keys(cleaned).length, skipped: Object.keys(d).length - Object.keys(cleaned).length };
  }
  throw new UsageError(`unknown enrich step: ${sub}`);
}

function embedState(repoIntel, cwd) {
  const embed = repoIntel.embed;
  return { chosen: embed.preference.hasEmbedderChoice(cwd), enabled: embed.isEnabled(cwd) };
}

async function embedAction(repoIntel, cwd, sub, a, o) {
  const embed = repoIntel.embed;
  if (sub === 'status') return embed.status(cwd);
  if (sub === 'update') return embed.runUpdate(cwd);
  if (sub === 'reset') {
    embed.preference.reset(cwd);
    return { ok: true, message: 'embedder preference cleared; the next enrich asks again' };
  }
  if (sub === 'choose') {
    const choice = need(a[0], 'embed choose: none, small or big is');
    if (!embed.preference.VALID_EMBEDDER.includes(choice)) throw new UsageError(`embedder must be one of ${embed.preference.VALID_EMBEDDER.join(', ')}`);
    const patch = { embedder: choice };
    if (choice !== 'none') {
      const detail = typeof o.detail === 'string' ? o.detail : 'balanced';
      if (!embed.preference.VALID_DETAIL.includes(detail)) throw new UsageError(`detail must be one of ${embed.preference.VALID_DETAIL.join(', ')}`);
      patch.embedderDetail = detail;
    }
    return { ok: true, preference: embed.preference.update(cwd, patch) };
  }
  throw new UsageError(`unknown embed action: ${sub}`);
}

async function run(argv, cwd = process.cwd()) {
  const { positional, options } = parse(argv);
  const [action = 'status', ...rest] = positional;
  const repoIntel = require(path.join(lib, 'repo-intel'));
  switch (action) {
    case 'status': return repoIntel.status(cwd);
    case 'init': return repoIntel.init(cwd, {
      since: typeof options.since === 'string' ? options.since : undefined,
      maxCommits: int(options.maxCommits),
      force: Boolean(options.force)
    });
    case 'update': return repoIntel.update(cwd);
    case 'queries': return { queries: Object.keys(QUERIES) };
    case 'query': {
      const [type, ...args] = rest;
      const fn = QUERIES[type];
      if (!fn) throw new UsageError(`unknown query "${type || ''}". Types: ${Object.keys(QUERIES).join(' | ')}`);
      if (!hasMap(repoIntel, cwd)) return { success: false, error: 'No repo-intel map. Run /repo-intel init first.' };
      return fn(repoIntel.queries, cwd, args, options);
    }
    case 'enrich': return enrich(repoIntel, cwd, rest[0] || 'plan', rest.slice(1), options);
    case 'embed': return embedAction(repoIntel, cwd, rest[0] || 'status', rest.slice(1), options);
    default: throw new UsageError(`unknown action "${action}"`);
  }
}

if (require.main === module) {
  run(process.argv.slice(2)).then(result => {
    process.stdout.write(`${typeof result === 'string' ? result : JSON.stringify(result, null, 2)}\n`);
    process.exit(result && result.success === false ? 1 : 0);
  }, err => {
    process.stderr.write(`${err instanceof UsageError ? `${err.message}\n\n${USAGE}` : `[ERROR] ${err.message}`}\n`);
    process.exit(2);
  });
}

module.exports = { run, parse, QUERIES };

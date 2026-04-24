---
description: Unified static analysis - git history, AST symbols, project metadata, doc-code sync, plus LLM-augmented file descriptors and a 3-depth narrative summary via post-init Haiku agents.
codex-description: 'Use when user asks to "analyze git history", "show hotspots", "file coupling", "code ownership", "bus factor", "bugspots", "repo-intel init/update/enrich/status/query", "show symbols", "find dependents", "find <concept>", "find auth code", "pain spots", "entry points", "summarize this repo", "repo summary", "what does this project do", "enrich repo-intel", "generate descriptors". Builds and queries a cached repo-intel artifact and optionally enriches it with Haiku-generated descriptors and a narrative summary.'
argument-hint: "init|update|enrich|status|query <type> [--since=<date>] [--max-commits=<n>] [--limit=<n>] [--depth=1|3|10] [--min-changes=<n>] [<file-or-concept>]"
allowed-tools: Bash(git:*), Bash(npm:*), Read, Task, Write
---

# /repo-intel - Static Analysis

Analyze and query the cached repo-intel artifact powered by agent-analyzer. Covers git history, AST symbols, project metadata, doc-code sync, and (after `enrich`) LLM-generated per-file descriptors plus a 3-depth narrative summary.

## Arguments

Parse from `$ARGUMENTS`:

- **Action**: `init` | `update` | `enrich` | `status` | `query` (default: `status`)
- **Query subcommand** (when action is `query`): `hotspots` | `bugspots` | `coldspots` | `coupling` | `ownership` | `bus-factor` | `norms` | `areas` | `contributors` | `ai-ratio` | `release-info` | `health` | `file-history` | `conventions` | `test-gaps` | `diff-risk` | `doc-drift` | `recent-ai` | `onboard` | `can-i-help` | `painspots` | `symbols` | `dependents` | `stale-docs` | `find` | `summary`
- `--since=<date>`: Limit history to commits after this date (for `init`)
- `--max-commits=<n>`: Limit number of commits to analyze (for `init`)
- `--limit=<n>`: Limit result rows (for queries)
- `--adjust-for-ai`: Adjust bus factor score (for `bus-factor`)
- `--min-changes=<n>`: Minimum change count threshold (for `test-gaps`)
- `--path-filter=<path>`: Filter results to a specific path (for `ai-ratio`)
- `<file>`: File path argument (for `coupling`, `file-history`, `diff-risk`, `symbols`, `ownership`)
- `<symbol>`: Symbol name (for `dependents`)

Examples:

- `/repo-intel init`
- `/repo-intel init --since=2024-01-01`
- `/repo-intel update`
- `/repo-intel enrich`  *(spawns Haiku agents for descriptors + summary)*
- `/repo-intel status`
- `/repo-intel query hotspots`
- `/repo-intel query hotspots --limit=20`
- `/repo-intel query bugspots`
- `/repo-intel query coupling src/auth/login.ts`
- `/repo-intel query ownership src/`
- `/repo-intel query bus-factor`
- `/repo-intel query painspots`
- `/repo-intel query symbols src/auth/login.ts`
- `/repo-intel query dependents createUser`
- `/repo-intel query onboard`
- `/repo-intel query stale-docs`
- `/repo-intel query find "worker pool"`
- `/repo-intel query summary --depth=1`  *(needs `/repo-intel enrich` first)*

## Execution

### 1) Load Repo Intel Module

```javascript
const pluginRoot = '$CLAUDE_PLUGIN_ROOT';
const repoIntel = require(`${pluginRoot}/lib/repo-intel`);
const queries = require(`${pluginRoot}/lib/repo-intel/queries`);
```

### 2) Parse Arguments

```javascript
const args = '$ARGUMENTS'.split(' ').filter(Boolean);
const action = (args[0] || 'status').toLowerCase();

const options = {};
const flags = args.filter(a => a.startsWith('--'));
const positional = args.filter(a => !a.startsWith('--'));

for (const flag of flags) {
  const [key, val] = flag.slice(2).split('=');
  if (val !== undefined) options[key.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = val;
}

const queryType = action === 'query' ? (positional[1] || '').toLowerCase() : null;
// `find` takes a multi-word concept query - rejoin all trailing
// positionals (and strip surrounding quotes that survive shell
// parsing) so `/repo-intel query find "worker pool"` works.
// Other queries take a single positional file/symbol arg, so
// positional[2] alone is right for them.
const queryArg = queryType === 'find'
  ? (positional.slice(2).join(' ').replace(/^["']|["']$/g, '') || null)
  : (positional[2] || null);
```

### 3) Run Action

```javascript
const cwd = process.cwd();
let result;

if (action === 'init') {
  result = await repoIntel.init(cwd, {
    since: options.since,
    maxCommits: options.maxCommits ? parseInt(options.maxCommits, 10) : undefined
  });
} else if (action === 'update') {
  result = await repoIntel.update(cwd);
} else if (action === 'enrich') {
  // Post-init LLM-augmented enrichment: spawn the summarizer and
  // weighter Haiku subagents, parse their JSON outputs, pipe back
  // through the analyzer's set-summary / set-descriptors subcommands.
  // The Rust binary itself never calls an LLM - this orchestration is
  // the "skill tells the agent to spawn a small agent" half.
  if (!repoIntel.exists(cwd)) {
    console.log('[ERROR] No repo-intel found. Run /repo-intel init first.');
    process.exit(1);
  }
  const enrich = require(`${pluginRoot}/lib/repo-intel/enrich`);
  const map = repoIntel.load(cwd);

  // 1. Summary - one Task call, three depths in one response.
  const readme = enrich.readReadme(cwd);
  const manifests = enrich.readManifests(cwd);
  const hotspots = enrich.topHotspots(cwd, map, 10);
  const summarizerOut = await Task({
    subagent_type: 'repo-intel:repo-intel-summarizer',
    prompt: enrich.buildSummarizerPrompt(cwd, readme, manifests, hotspots)
  });
  const summary = enrich.parseMarkers(summarizerOut, 'SUMMARY');
  let summaryApplied = false;
  if (summary && summary.depth1 && summary.depth3 && summary.depth10) {
    summary.inputHash = enrich.summaryInputHash(readme, manifests, hotspots);
    await repoIntel.applySummary(cwd, summary);
    summaryApplied = true;
    console.log('[OK] summary populated');
  } else {
    console.log('[WARN] summarizer agent did not return parseable JSON or required depths; skipping');
  }

  // 2. Descriptors - top 500 paths, batched 30/Task call. Failures
  // in any batch are logged but don't abort the run; partial
  // descriptors are still better than none.
  const paths = enrich.topPaths(map, 500);
  const batches = enrich.chunk(paths, 30);
  let totalAdded = 0;
  for (let i = 0; i < batches.length; i++) {
    try {
      const out = await Task({
        subagent_type: 'repo-intel:repo-intel-weighter',
        prompt: enrich.buildWeighterPrompt(cwd, batches[i])
      });
      const descs = enrich.parseMarkers(out, 'DESCRIPTORS');
      if (descs && Object.keys(descs).length > 0) {
        // Drop entries the agent set to null (paths it couldn't read).
        const cleaned = Object.fromEntries(
          Object.entries(descs).filter(([, v]) => typeof v === 'string' && v.trim().length > 0)
        );
        if (Object.keys(cleaned).length > 0) {
          await repoIntel.applyDescriptors(cwd, cleaned);
          totalAdded += Object.keys(cleaned).length;
        }
      }
    } catch (e) {
      console.log(`[WARN] weighter batch ${i + 1}/${batches.length} failed: ${e.message}`);
    }
  }
  console.log(`[OK] descriptors populated for ${totalAdded} files (${batches.length} batches)`);
  result = { success: true, summaryPopulated: summaryApplied, descriptorsAdded: totalAdded };
} else if (action === 'status') {
  result = repoIntel.status(cwd);
} else if (action === 'query') {
  if (!repoIntel.exists(cwd)) {
    console.log('[ERROR] No repo-intel found. Run /repo-intel init first.');
    process.exit(1);
  }

  const limit = options.limit ? parseInt(options.limit, 10) : undefined;

  if (queryType === 'hotspots') {
    result = queries.hotspots(cwd, { limit });
  } else if (queryType === 'bugspots') {
    result = queries.bugspots(cwd, { limit });
  } else if (queryType === 'coldspots') {
    result = queries.coldspots(cwd, { limit });
  } else if (queryType === 'coupling') {
    if (!queryArg) { console.log('[ERROR] coupling requires a file path argument'); process.exit(1); }
    result = queries.coupling(cwd, queryArg);
  } else if (queryType === 'ownership') {
    if (!queryArg) { console.log('[ERROR] ownership requires a file or directory path'); process.exit(1); }
    result = queries.ownership(cwd, queryArg);
  } else if (queryType === 'bus-factor') {
    result = queries.busFactor(cwd, { adjustForAi: !!options.adjustForAi });
  } else if (queryType === 'norms') {
    result = queries.norms(cwd);
  } else if (queryType === 'areas') {
    result = queries.areas(cwd);
  } else if (queryType === 'contributors') {
    result = queries.contributors(cwd, { limit });
  } else if (queryType === 'ai-ratio') {
    result = queries.aiRatio(cwd, { pathFilter: options.pathFilter || undefined });
  } else if (queryType === 'release-info') {
    result = queries.releaseInfo(cwd);
  } else if (queryType === 'health') {
    result = queries.health(cwd);
  } else if (queryType === 'file-history') {
    if (!queryArg) { console.log('[ERROR] file-history requires a file path'); process.exit(1); }
    result = queries.fileHistory(cwd, queryArg);
  } else if (queryType === 'conventions') {
    result = queries.conventions(cwd);
  } else if (queryType === 'test-gaps') {
    result = queries.testGaps(cwd, { limit, minChanges: options.minChanges ? parseInt(options.minChanges, 10) : undefined });
  } else if (queryType === 'diff-risk') {
    if (!queryArg) { console.log('[ERROR] diff-risk requires comma-separated file paths'); process.exit(1); }
    result = queries.diffRisk(cwd, queryArg.split(','));
  } else if (queryType === 'doc-drift') {
    result = queries.docDrift(cwd, { limit });
  } else if (queryType === 'recent-ai') {
    result = queries.recentAi(cwd, { limit });
  } else if (queryType === 'onboard') {
    result = queries.onboard(cwd);
  } else if (queryType === 'can-i-help') {
    result = queries.canIHelp(cwd);
  } else if (queryType === 'painspots') {
    result = queries.painspots(cwd, { limit });
  } else if (queryType === 'symbols') {
    if (!queryArg) { console.log('[ERROR] symbols requires a file path'); process.exit(1); }
    result = queries.symbols(cwd, queryArg);
  } else if (queryType === 'dependents') {
    if (!queryArg) { console.log('[ERROR] dependents requires a symbol name'); process.exit(1); }
    result = queries.dependents(cwd, queryArg, options.file);
  } else if (queryType === 'stale-docs') {
    result = queries.staleDocs(cwd, { limit });
  } else if (queryType === 'find') {
    if (!queryArg) { console.log('[ERROR] find requires a concept query (e.g. "worker pool")'); process.exit(1); }
    result = queries.find(cwd, queryArg, { limit });
  } else if (queryType === 'summary') {
    // Optional depth filter via --depth=1|3|10
    const depth = options.depth ? parseInt(options.depth, 10) : undefined;
    result = queries.summary(cwd, { depth });
  } else {
    console.log('[ERROR] Unknown query. Use: hotspots | bugspots | coldspots | coupling <file> | ownership <path> | bus-factor | norms | areas | contributors | ai-ratio | release-info | health | file-history <file> | conventions | test-gaps | diff-risk <files> | doc-drift | recent-ai | onboard | can-i-help | painspots | symbols <file> | dependents <symbol> | stale-docs | find <concept> | summary [--depth=1|3|10]');
    process.exit(1);
  }
} else {
  console.log('[ERROR] Unknown action. Use: init | update | enrich | status | query');
  process.exit(1);
}

if (result?.success === false) {
  console.log(`[ERROR] ${result.error || 'repo-intel failed'}`);
  process.exit(1);
}

if (action === 'status' && !result.exists) {
  console.log('No repo-intel found. Run /repo-intel init to generate one.');
  process.exit(0);
}
```

### 4) Output Result

Use the repo-intel skill to format and display results:

```javascript
await Task({
  subagent_type: 'repo-intel:repo-intel',
  prompt: `Format and display repo-intel result. Action: ${action}. QueryType: ${queryType || 'none'}. Data: ${JSON.stringify(result)}`
});
```

## Output Format

```markdown
## Repo Intel Result

**Action**: init|update|status|query
**Commits analyzed**: <count>
**Files tracked**: <count>

### Notes
- <warnings or key findings>
```

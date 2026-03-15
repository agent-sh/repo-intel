---
description: Analyze git history with cached, incrementally-updatable artifact - hotspots, coupling, ownership, bus factor, bugspots, norms, areas
codex-description: 'Use when user asks to "analyze git history", "show hotspots", "file coupling", "code ownership", "bus factor", "bugspots", "area health", "project norms", "git map init/update/status/query". Builds and queries a cached repo-intel artifact.'
argument-hint: "init|update|status|query <hotspots|bugspots|coldspots|coupling|ownership|bus-factor|norms|areas|contributors|ai-ratio|release-info|health|file-history|conventions|test-gaps|diff-risk|doc-drift|recent-ai> [--since=<date>] [--max-commits=<n>] [--limit=<n>] [--adjust-for-ai] [--min-changes=<n>] [<file>] [<path>]"
allowed-tools: Bash(git:*), Bash(npm:*), Read, Task, Write
---

# /git-map - Git History Analysis

Analyze git history to surface hotspots, coupling, ownership, bus factor risk, bugspots, norms, and area health using the agent-analyzer binary.

## Arguments

Parse from `$ARGUMENTS`:

- **Action**: `init` | `update` | `status` | `query` (default: `status`)
- **Query subcommand** (when action is `query`): `hotspots` | `bugspots` | `coldspots` | `coupling` | `ownership` | `bus-factor` | `norms` | `areas` | `contributors` | `ai-ratio` | `release-info` | `health` | `file-history` | `conventions` | `test-gaps` | `diff-risk` | `doc-drift` | `recent-ai`
- `--since=<date>`: Limit history to commits after this date (for `init`)
- `--max-commits=<n>`: Limit number of commits to analyze (for `init`)
- `--limit=<n>`: Limit result rows (for queries)
- `<file>`: File path argument (for `coupling`, `ownership`)
- `<path>`: Path filter (for `ownership`)

Examples:

- `/git-map init`
- `/git-map init --since=2024-01-01`
- `/git-map update`
- `/git-map status`
- `/git-map query hotspots`
- `/git-map query hotspots --limit=20`
- `/git-map query bugspots`
- `/git-map query coupling src/auth/login.ts`
- `/git-map query ownership src/`
- `/git-map query bus-factor`
- `/git-map query norms`
- `/git-map query areas`

## Execution

### 1) Load Git Map Module

```javascript
const { getPluginRoot } = require('@agentsys/lib/cross-platform');
const pluginRoot = getPluginRoot('git-map');
if (!pluginRoot) { console.error('[ERROR] Could not locate git-map plugin root'); process.exit(1); }
const gitMap = require(`${pluginRoot}/lib/git-map`);
const queries = require(`${pluginRoot}/lib/git-map/queries`);
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
const queryArg = positional[2] || null;
```

### 3) Run Action

```javascript
const cwd = process.cwd();
let result;

if (action === 'init') {
  result = await gitMap.init(cwd, {
    since: options.since,
    maxCommits: options.maxCommits ? parseInt(options.maxCommits, 10) : undefined
  });
} else if (action === 'update') {
  result = await gitMap.update(cwd);
} else if (action === 'status') {
  result = gitMap.status(cwd);
} else if (action === 'query') {
  if (!gitMap.exists(cwd)) {
    console.log('[ERROR] No repo-intel found. Run /git-map init first.');
    process.exit(1);
  }

  const limit = options.limit ? parseInt(options.limit, 10) : undefined;

  if (queryType === 'hotspots') {
    result = queries.hotspots(cwd, { limit });
  } else if (queryType === 'bugspots') {
    result = queries.bugspots(cwd, { limit });
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
  } else if (queryType === 'coldspots') {
    result = queries.coldspots(cwd, { limit });
  } else if (queryType === 'contributors') {
    result = queries.contributors(cwd, { limit });
  } else if (queryType === 'ai-ratio') {
    result = queries.aiRatio(cwd, { pathFilter: queryArg || undefined });
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
  } else {
    console.log('[ERROR] Unknown query. Use: hotspots | bugspots | coldspots | coupling <file> | ownership <path> | bus-factor | norms | areas | contributors | ai-ratio | release-info | health | file-history <file> | conventions | test-gaps | diff-risk <files> | doc-drift | recent-ai');
    process.exit(1);
  }
} else {
  console.log('[ERROR] Unknown action. Use: init | update | status | query');
  process.exit(1);
}

if (result?.success === false) {
  console.log(`[ERROR] ${result.error || 'git-map failed'}`);
  process.exit(1);
}

if (action === 'status' && !result.exists) {
  console.log('No repo-intel found. Run /git-map init to generate one.');
  process.exit(0);
}
```

### 4) Output Result

Use the git-mapping skill to format and display results:

```javascript
await Task({
  subagent_type: 'git-map:git-mapping',
  prompt: `Format and display git-map result. Action: ${action}. Data: ${JSON.stringify(result)}`
});
```

## Output Format

```markdown
## Git Map Result

**Action**: init|update|status|query
**Commits analyzed**: <count>
**Files tracked**: <count>

### Notes
- <warnings or key findings>
```

---
description: Unified static analysis - git history, AST symbols, project metadata, and doc-code sync via agent-analyzer
codex-description: 'Use when user asks to "analyze git history", "show hotspots", "file coupling", "code ownership", "bus factor", "bugspots", "repo-intel init/update/status/query", "show symbols", "find dependents", "pain spots". Builds and queries a cached repo-intel artifact.'
argument-hint: "init|update|status|query <type> [--since=<date>] [--max-commits=<n>] [--limit=<n>] [--adjust-for-ai] [--min-changes=<n>] [--path-filter=<path>] [<file>] [<path>]"
allowed-tools: Bash(git:*), Bash(npm:*), Read, Task, Write
---

# /repo-intel - Static Analysis

Analyze and query the cached repo-intel artifact powered by agent-analyzer. Covers git history, AST symbols, project metadata, and doc-code sync.

## Arguments

Parse from `$ARGUMENTS`:

- **Action**: `init` | `update` | `status` | `query` (default: `status`)
- **Query subcommand** (when action is `query`): `hotspots` | `bugspots` | `coldspots` | `coupling` | `ownership` | `bus-factor` | `norms` | `areas` | `contributors` | `ai-ratio` | `release-info` | `health` | `file-history` | `conventions` | `test-gaps` | `diff-risk` | `doc-drift` | `recent-ai` | `onboard` | `can-i-help` | `painspots` | `symbols` | `dependents` | `stale-docs`
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
const queryArg = positional[2] || null;
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
  } else {
    console.log('[ERROR] Unknown query. Use: hotspots | bugspots | coldspots | coupling <file> | ownership <path> | bus-factor | norms | areas | contributors | ai-ratio | release-info | health | file-history <file> | conventions | test-gaps | diff-risk <files> | doc-drift | recent-ai | onboard | can-i-help | painspots | symbols <file> | dependents <symbol> | stale-docs');
    process.exit(1);
  }
} else {
  console.log('[ERROR] Unknown action. Use: init | update | status | query');
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

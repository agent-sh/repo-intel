---
description: Analyze git history with cached, incrementally-updatable artifact - hotspots, coupling, ownership, bus factor
codex-description: 'Use when user asks to "analyze git history", "show hotspots", "file coupling", "code ownership", "bus factor", "git map init/update/status/query". Builds and queries a cached git history analysis artifact.'
argument-hint: "init|update|status|query <hotspots|coupling|ownership|bus-factor> [--since=<date>] [--max-commits=<n>] [--limit=<n>] [<file>] [<path>]"
allowed-tools: Bash(git:*), Bash(npm:*), Read, Task, Write
---

# /git-map - Git History Analysis

Analyze git history to surface hotspots, coupling, ownership, and knowledge distribution risk using the agent-analyzer binary.

## Arguments

Parse from `$ARGUMENTS`:

- **Action**: `init` | `update` | `status` | `query` (default: `status`)
- **Query subcommand** (when action is `query`): `hotspots` | `coupling` | `ownership` | `bus-factor`
- `--since=<date>`: Limit history to commits after this date (for `init`)
- `--max-commits=<n>`: Limit number of commits to analyze (for `init`)
- `--limit=<n>`: Limit result rows (for queries)
- `<file>`: File path argument (for `coupling`)
- `<path>`: Path filter (for `ownership`)

Examples:

- `/git-map init`
- `/git-map init --since=2024-01-01`
- `/git-map update`
- `/git-map status`
- `/git-map query hotspots`
- `/git-map query hotspots --limit=20`
- `/git-map query coupling src/auth/login.ts`
- `/git-map query ownership src/`
- `/git-map query bus-factor`

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
let result;

if (action === 'init') {
  result = await gitMap.init(process.cwd(), {
    since: options.since,
    maxCommits: options.maxCommits ? parseInt(options.maxCommits, 10) : undefined
  });
} else if (action === 'update') {
  result = await gitMap.update(process.cwd());
} else if (action === 'status') {
  result = gitMap.status(process.cwd());
} else if (action === 'query') {
  const map = gitMap.load(process.cwd());
  if (!map) {
    console.log('[ERROR] No git-map found. Run /git-map init first.');
    process.exit(1);
  }

  if (queryType === 'hotspots') {
    result = queries.hotspots(map, { limit: options.limit ? parseInt(options.limit, 10) : undefined });
  } else if (queryType === 'coupling') {
    if (!queryArg) { console.log('[ERROR] coupling requires a file path argument'); process.exit(1); }
    result = queries.coupling(map, queryArg);
  } else if (queryType === 'ownership') {
    result = queries.ownership(map, queryArg || null);
  } else if (queryType === 'bus-factor') {
    result = queries.busFactor(map);
  } else {
    console.log('[ERROR] Unknown query. Use: hotspots | coupling <file> | ownership [path] | bus-factor');
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
  console.log('No git-map found. Run /git-map init to generate one.');
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
**Last commit**: <hash>

### Notes
- <warnings or key findings>
```

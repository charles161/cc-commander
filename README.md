# CC Commander

Turn any Claude Code session into a multi-agent commander. Spawn, message, monitor, broadcast to, and tear down multiple independent Claude Code sessions running in `tmux` from one CLI or TypeScript API.

See [SPEC.md](SPEC.md) for the full design and architecture notes.

## Requirements

- Node.js 22+
- `tmux`
- Claude Code CLI (`claude`)

## Quick Start

```bash
npm install
npm run build
```

Run the CLI:

```bash
# Spawn a new Claude Code session
npx commander spawn --name worker-1 --workdir ./my-repo --task "Fix failing tests"

# Send a message to a running session
npx commander msg worker-1 "Summarize your changes"

# Broadcast a message to all active sessions
npx commander broadcast "Pause and report current status"

# Check session health and list active sessions
npx commander status
npx commander list

# Stop a session
npx commander kill worker-1
```

## Programmatic API

```ts
import { SessionManager, Messenger, HealthMonitor, Registry, Router } from 'cc-commander';
```

Exports include `SessionManager`, `Messenger`, `HealthMonitor`, `Registry`, and `Router` (see `src/index.ts`).

## Examples

- [`examples/xray`](examples/xray) — **Repo X-Ray**, a parallel multi-agent codebase analyzer (`architect` + `critic` templates) built on top of `cc-commander`.

## Development

```bash
npm test
npm run typecheck
npm run build
```

## License

[MIT](LICENSE)

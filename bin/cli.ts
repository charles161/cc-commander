import { Command } from 'commander';
import { SessionManager } from '../src/session.js';
import { Messenger } from '../src/messenger.js';
import { HealthMonitor } from '../src/health.js';

const sessions = new SessionManager();
const messenger = new Messenger();
const health = new HealthMonitor(sessions);

export const program = new Command();

program
  .name('commander')
  .description('Turn any Claude Code session into a multi-agent orchestrator')
  .version('0.1.0');

program
  .command('spawn')
  .description('Spawn a new Claude Code session')
  .requiredOption('--name <name>', 'Session name')
  .requiredOption('--workdir <path>', 'Working directory')
  .option('--claude-md <path>', 'Path to CLAUDE.md')
  .option('--task <task>', 'Initial task to execute')
  .option('--model <model>', 'Claude model to use')
  .option('--permissions <mode>', 'Permission mode (default or dangerously-skip)')
  .option('--dangerously-skip-permissions', 'Skip permission prompts')
  .action((opts) => {
    try {
      const permissions = opts.dangerouslySkipPermissions ? 'dangerously-skip' : (opts.permissions ?? 'default');
      const session = sessions.spawn({
        name: opts.name,
        workdir: opts.workdir,
        claudeMd: opts.claudeMd,
        task: opts.task,
        model: opts.model,
        permissions,
      });
      console.log(`Spawned session "${session.name}" (tmux: ${session.tmuxSession})`);
    } catch (e: unknown) {
      console.error(`Error: ${(e as Error).message}`);
      process.exit(1);
    }
  });

program
  .command('msg <name> <message>')
  .description('Send a message to a session')
  .option('--timeout <ms>', 'Response timeout in ms', '30000')
  .action((name, message, opts) => {
    try {
      const session = sessions.get(name);
      if (!session) {
        console.error(`Session "${name}" not found`);
        process.exit(1);
        return;
      }
      const result = messenger.send(session.tmuxSession, message);
      console.log(result.delivered ? `Message delivered to "${name}"` : `Failed to deliver to "${name}"`);
    } catch (e: unknown) {
      console.error(`Error: ${(e as Error).message}`);
      process.exit(1);
    }
  });

program
  .command('status [name]')
  .description('Show session status')
  .action((name) => {
    if (name) {
      const status = health.check(name);
      console.log(formatStatus(status));
    } else {
      const all = sessions.list();
      if (all.length === 0) {
        console.log('No active sessions');
        return;
      }
      for (const s of all) {
        const status = health.check(s.name);
        console.log(formatStatus(status));
      }
    }
  });

program
  .command('kill <name>')
  .description('Kill a session')
  .option('--force', 'Force kill without graceful shutdown')
  .action((name, opts) => {
    try {
      sessions.kill(name, { force: opts.force ?? false });
      console.log(`Killed session "${name}"`);
    } catch (e: unknown) {
      console.error(`Error: ${(e as Error).message}`);
      process.exit(1);
    }
  });

program
  .command('broadcast <message>')
  .description('Send a message to all sessions')
  .action((message) => {
    const all = sessions.list();
    if (all.length === 0) {
      console.log('No active sessions');
      return;
    }
    const tmuxNames = all.map((s) => s.tmuxSession);
    const results = messenger.broadcast(message, tmuxNames);
    for (const r of results) {
      console.log(`${r.session}: ${r.delivered ? 'delivered' : 'failed'}`);
    }
  });

program
  .command('list')
  .description('List all sessions')
  .action(() => {
    const all = sessions.list();
    if (all.length === 0) {
      console.log('No active sessions');
      return;
    }
    for (const s of all) {
      console.log(`  ${s.name}\t${s.status}\t${s.workdir}`);
    }
  });

function formatStatus(status: { name: string; status: string; tmuxAlive: boolean; claudeRunning: boolean; idleMinutes: number }): string {
  const indicator = status.status === 'idle' || status.status === 'working' ? '●' : '○';
  return `${indicator} ${status.name}\t${status.status}\ttmux:${status.tmuxAlive ? 'up' : 'down'}\tclaude:${status.claudeRunning ? 'up' : 'down'}\tidle:${status.idleMinutes}m`;
}

// Run if executed directly
const isMain = process.argv[1]?.endsWith('cli.js') || process.argv[1]?.endsWith('cli.ts');
if (isMain) {
  program.parse();
}

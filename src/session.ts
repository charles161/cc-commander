import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { exec, execSilent } from './exec.js';
import type { SessionInfo, SpawnOptions } from './types.js';

export class SessionManager {
  private sessions = new Map<string, SessionInfo>();

  spawn(options: SpawnOptions): SessionInfo {
    if (this.sessions.has(options.name)) {
      throw new Error(`Session "${options.name}" already exists`);
    }

    const tmuxName = options.name;
    const workdir = options.workdir;

    if (!existsSync(workdir)) {
      mkdirSync(workdir, { recursive: true });
    }

    const args: string[] = [];
    if (options.permissions === 'dangerously-skip') {
      args.push('--dangerously-skip-permissions');
    }
    if (options.resume && options.sessionId) {
      args.push('--resume', options.sessionId);
    }
    if (options.model) {
      args.push('--model', options.model);
    }

    if (options.task) {
      writeFileSync(join(workdir, 'TASK.md'), options.task);
    }

    if (options.claudeMd && !options.claudeMd.startsWith('/') && !options.claudeMd.startsWith('.')) {
      if (!existsSync(join(workdir, 'CLAUDE.md'))) {
        writeFileSync(join(workdir, 'CLAUDE.md'), options.claudeMd);
      }
    }

    const envExports = options.env
      ? Object.entries(options.env).map(([k, v]) => `export ${k}="${v}"`).join(' && ') + ' && '
      : '';

    const claudeCmd = `${envExports}claude ${args.join(' ')}`;

    exec(`tmux new-session -d -s "${tmuxName}" -c "${workdir}"`);
    exec(`tmux send-keys -t "${tmuxName}" '${claudeCmd.replace(/'/g, "'\\''")}' Enter`);

    if (options.task) {
      exec(`tmux send-keys -t "${tmuxName}" 'Read TASK.md and execute the task described in it.' Enter`);
    }

    const session: SessionInfo = {
      name: options.name,
      pid: null,
      status: 'starting',
      tmuxSession: tmuxName,
      workdir,
      claudeMd: options.claudeMd ?? null,
      sessionId: options.sessionId ?? null,
      createdAt: new Date(),
      lastActivity: new Date(),
    };

    this.sessions.set(options.name, session);
    return session;
  }

  kill(name: string, force?: boolean | { force?: boolean }): void {
    const session = this.sessions.get(name);
    if (!session) {
      throw new Error(`Session "${name}" not found`);
    }

    const isForce = typeof force === 'boolean' ? force : force?.force ?? false;

    if (!isForce) {
      execSilent(`tmux send-keys -t "${session.tmuxSession}" C-c`);
    }

    execSilent(`tmux kill-session -t "${session.tmuxSession}"`);
    session.status = 'dead';
  }

  list(): SessionInfo[] {
    return Array.from(this.sessions.values());
  }

  get(name: string): SessionInfo | null {
    return this.sessions.get(name) ?? null;
  }

  resume(name: string, sessionId?: string): SessionInfo {
    const existing = this.sessions.get(name);
    if (!existing) {
      throw new Error(`Session "${name}" not found in registry`);
    }

    const resumeId = sessionId ?? existing.sessionId;
    if (!resumeId) {
      throw new Error(`No session ID to resume for "${name}"`);
    }

    execSilent(`tmux kill-session -t "${existing.tmuxSession}"`);

    const args: string[] = ['--resume', resumeId];
    const claudeCmd = `claude ${args.join(' ')}`;

    exec(`tmux new-session -d -s "${existing.tmuxSession}" -c "${existing.workdir}"`);
    exec(`tmux send-keys -t "${existing.tmuxSession}" '${claudeCmd}' Enter`);

    existing.status = 'starting';
    existing.lastActivity = new Date();
    existing.sessionId = resumeId;

    return existing;
  }

  has(name: string): boolean {
    return this.sessions.has(name);
  }
}

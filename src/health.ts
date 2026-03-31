import { execSilent } from './exec.js';
import type { SessionInfo, HealthStatus, HealthCheckResult, SessionStatus } from './types.js';
import { SessionManager } from './session.js';

export type EscalationLevel = 0 | 1 | 2 | 3;

const STUCK_THRESHOLD_MINUTES = 15;

export class HealthMonitor {
  private sessionManager: SessionManager;

  constructor(sessionManager: SessionManager) {
    this.sessionManager = sessionManager;
  }

  check(name: string): HealthStatus {
    const session = this.sessionManager.get(name);
    if (!session) {
      throw new Error(`Session "${name}" not found`);
    }

    const tmuxAlive = this.isTmuxAlive(session.tmuxSession);
    const claudeRunning = tmuxAlive ? this.isClaudeRunning(session.tmuxSession) : false;

    let status: SessionStatus = session.status;
    if (!tmuxAlive || !claudeRunning) {
      status = 'crashed';
    } else if (session.status === 'working' && this.isStuck(session)) {
      status = 'stuck';
    }

    const idleMinutes = session.lastActivity
      ? Math.floor((Date.now() - session.lastActivity.getTime()) / 60_000)
      : 0;

    return {
      name,
      status,
      tmuxAlive,
      claudeRunning,
      lastActivity: session.lastActivity,
      idleMinutes,
    };
  }

  checkAll(): HealthCheckResult {
    const sessions = this.sessionManager.list();
    const healthy: SessionInfo[] = [];
    const unhealthy: SessionInfo[] = [];

    for (const session of sessions) {
      const health = this.check(session.name);
      if (health.status === 'crashed' || health.status === 'dead' || health.status === 'stuck') {
        unhealthy.push(session);
      } else {
        healthy.push(session);
      }
    }

    return { healthy, unhealthy, recovered: [], failed: [] };
  }

  async recover(name: string, level: EscalationLevel = 0): Promise<{ success: boolean; level: EscalationLevel }> {
    const session = this.sessionManager.get(name);
    if (!session) return { success: false, level };

    switch (level) {
      case 0:
        return this.recoverLevel0(session);
      case 1:
        return this.recoverLevel1(session);
      case 2:
        return this.recoverLevel2(session);
      case 3:
        return this.recoverLevel3(session);
    }
  }

  async recoverWithEscalation(name: string): Promise<{ success: boolean; finalLevel: EscalationLevel }> {
    for (let level = 0; level <= 3; level++) {
      const result = await this.recover(name, level as EscalationLevel);
      if (result.success) {
        try {
          const health = this.check(name);
          if (health.status !== 'stuck' && health.status !== 'crashed') {
            return { success: true, finalLevel: level as EscalationLevel };
          }
        } catch {
          // session not found, continue escalating
        }
      }
    }
    return { success: false, finalLevel: 3 };
  }

  private recoverLevel0(session: SessionInfo): { success: boolean; level: EscalationLevel } {
    try {
      execSilent(`tmux send-keys -t "${session.tmuxSession}" C-c`);
      execSilent(`tmux send-keys -t "${session.tmuxSession}" Enter`);
      return { success: true, level: 0 };
    } catch {
      return { success: false, level: 0 };
    }
  }

  private recoverLevel1(session: SessionInfo): { success: boolean; level: EscalationLevel } {
    try {
      execSilent(`tmux send-keys -t "${session.tmuxSession}" "/compact" Enter`);
      return { success: true, level: 1 };
    } catch {
      return { success: false, level: 1 };
    }
  }

  private recoverLevel2(session: SessionInfo): { success: boolean; level: EscalationLevel } {
    try {
      this.sessionManager.kill(session.name, true);
      this.sessionManager.spawn({
        name: session.name,
        workdir: session.workdir,
        claudeMd: session.claudeMd ?? undefined,
        resume: true,
        sessionId: session.sessionId ?? undefined,
      });
      return { success: true, level: 2 };
    } catch {
      return { success: false, level: 2 };
    }
  }

  private recoverLevel3(session: SessionInfo): { success: boolean; level: EscalationLevel } {
    try {
      try { this.sessionManager.kill(session.name, { force: true }); } catch { /* may already be dead */ }
      this.sessionManager.spawn({
        name: session.name,
        workdir: session.workdir,
        claudeMd: session.claudeMd ?? undefined,
      });
      return { success: true, level: 3 };
    } catch {
      return { success: false, level: 3 };
    }
  }

  private isStuck(session: SessionInfo): boolean {
    if (!session.lastActivity) return false;
    const idleMinutes = (Date.now() - session.lastActivity.getTime()) / 60_000;
    return idleMinutes > STUCK_THRESHOLD_MINUTES;
  }

  private isTmuxAlive(tmuxSession: string): boolean {
    const result = execSilent(`tmux has-session -t "${tmuxSession}" 2>/dev/null && echo "alive"`);
    return result?.includes('alive') ?? false;
  }

  private isClaudeRunning(tmuxSession: string): boolean {
    const pane = execSilent(`tmux capture-pane -t "${tmuxSession}" -p | tail -3`);
    if (!pane) return false;
    if (/^\s*[$%]\s*$/m.test(pane)) return false;
    return true;
  }
}

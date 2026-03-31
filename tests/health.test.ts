import { vi, describe, it, expect, beforeEach } from 'vitest';
import type { SessionInfo } from '../src/types.js';

vi.mock('child_process', () => ({
  execSync: vi.fn().mockReturnValue(''),
  exec: vi.fn(),
}));

vi.mock('fs', () => ({
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  existsSync: vi.fn().mockReturnValue(false),
  readFileSync: vi.fn().mockReturnValue(''),
}));

import { execSync } from 'child_process';

const mockExecSync = vi.mocked(execSync);

import { HealthMonitor } from '../src/health.js';
import { SessionManager } from '../src/session.js';

function makeSession(overrides: Partial<SessionInfo> = {}): SessionInfo {
  return {
    name: 'test-agent',
    pid: 1234,
    status: 'idle',
    tmuxSession: 'cc-cmd-test-agent',
    workdir: '/tmp/work',
    claudeMd: null,
    sessionId: 'sess-001',
    createdAt: new Date(),
    lastActivity: new Date(),
    ...overrides,
  };
}

describe('HealthMonitor', () => {
  let monitor: HealthMonitor;
  let sessionManager: SessionManager;

  beforeEach(() => {
    sessionManager = new SessionManager();
    monitor = new HealthMonitor(sessionManager);
    vi.clearAllMocks();
    mockExecSync.mockReturnValue('');
  });

  // ---- check ----

  describe('check(name)', () => {
    it('returns tmuxAlive: true and an alive status for a running session', () => {
      mockExecSync.mockImplementation((cmd: unknown) => {
        if (typeof cmd === 'string' && cmd.includes('has-session')) return 'alive';
        // capture-pane returns claude prompt (not bare shell)
        if (typeof cmd === 'string' && cmd.includes('capture-pane')) return '❯ ';
        return '';
      });

      const session = makeSession({ name: 'running', tmuxSession: 'cc-cmd-running', status: 'idle' });
      vi.spyOn(sessionManager, 'get').mockReturnValue(session);

      const health = monitor.check('running');

      expect(health.name).toBe('running');
      expect(health.tmuxAlive).toBe(true);
    });

    it('detects crashed session when tmux has-session fails', () => {
      mockExecSync.mockImplementation((cmd: unknown) => {
        if (typeof cmd === 'string' && cmd.includes('has-session')) {
          throw new Error("can't find session");
        }
        return '';
      });

      const session = makeSession({ name: 'crashed', tmuxSession: 'cc-cmd-crashed', status: 'working' });
      vi.spyOn(sessionManager, 'get').mockReturnValue(session);

      const health = monitor.check('crashed');

      expect(health.tmuxAlive).toBe(false);
      expect(health.status).toBe('crashed');
    });

    it('detects stuck session when session is working and idle beyond threshold', () => {
      mockExecSync.mockImplementation((cmd: unknown) => {
        if (typeof cmd === 'string' && cmd.includes('has-session')) return 'alive';
        if (typeof cmd === 'string' && cmd.includes('capture-pane')) return '❯ ';
        return '';
      });

      // lastActivity was 20 minutes ago, status is working → stuck
      const twentyMinAgo = new Date(Date.now() - 20 * 60 * 1000);
      const session = makeSession({
        name: 'stuck-one',
        tmuxSession: 'cc-cmd-stuck-one',
        status: 'working',
        lastActivity: twentyMinAgo,
      });
      vi.spyOn(sessionManager, 'get').mockReturnValue(session);

      const health = monitor.check('stuck-one');

      expect(health.status).toBe('stuck');
    });

    it('throws for unknown session name', () => {
      vi.spyOn(sessionManager, 'get').mockReturnValue(null);

      expect(() => monitor.check('ghost')).toThrow(/not found|unknown/i);
    });

    it('calculates idle time correctly from lastActivity', () => {
      mockExecSync.mockImplementation((cmd: unknown) => {
        if (typeof cmd === 'string' && cmd.includes('has-session')) return 'alive';
        if (typeof cmd === 'string' && cmd.includes('capture-pane')) return '❯ ';
        return '';
      });

      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
      const session = makeSession({ lastActivity: tenMinutesAgo });
      vi.spyOn(sessionManager, 'get').mockReturnValue(session);

      const health = monitor.check('test-agent');

      expect(health.idleMinutes).toBeGreaterThanOrEqual(9);
      expect(health.idleMinutes).toBeLessThanOrEqual(11);
    });

    it('returns idleMinutes: 0 when lastActivity is null', () => {
      mockExecSync.mockImplementation((cmd: unknown) => {
        if (typeof cmd === 'string' && cmd.includes('has-session')) return 'alive';
        if (typeof cmd === 'string' && cmd.includes('capture-pane')) return '❯ ';
        return '';
      });

      const session = makeSession({ lastActivity: null });
      vi.spyOn(sessionManager, 'get').mockReturnValue(session);

      const health = monitor.check('test-agent');

      // Implementation returns 0 when lastActivity is null
      expect(health.idleMinutes).toBe(0);
    });
  });

  // ---- checkAll ----

  describe('checkAll()', () => {
    it('returns object with healthy and unhealthy arrays', () => {
      vi.spyOn(sessionManager, 'list').mockReturnValue([]);

      const result = monitor.checkAll();

      expect(result).toHaveProperty('healthy');
      expect(result).toHaveProperty('unhealthy');
      expect(Array.isArray(result.healthy)).toBe(true);
      expect(Array.isArray(result.unhealthy)).toBe(true);
    });

    it('classifies sessions with alive tmux as healthy', () => {
      mockExecSync.mockImplementation((cmd: unknown) => {
        if (typeof cmd === 'string' && cmd.includes('has-session')) return 'alive';
        if (typeof cmd === 'string' && cmd.includes('capture-pane')) return '❯ ';
        return '';
      });

      const sessions = [
        makeSession({ name: 'a', tmuxSession: 'cc-cmd-a', status: 'idle' }),
        makeSession({ name: 'b', tmuxSession: 'cc-cmd-b', status: 'idle' }),
      ];
      vi.spyOn(sessionManager, 'list').mockReturnValue(sessions);
      vi.spyOn(sessionManager, 'get').mockImplementation(
        (name) => sessions.find((s) => s.name === name) ?? null,
      );

      const result = monitor.checkAll();

      expect(result.unhealthy).toHaveLength(0);
      expect(result.healthy).toHaveLength(2);
    });

    it('classifies sessions with dead tmux as unhealthy', () => {
      mockExecSync.mockImplementation((cmd: unknown) => {
        const c = String(cmd);
        if (c.includes('has-session') && c.includes('broken')) throw new Error('no session');
        if (c.includes('has-session')) return 'alive';
        if (c.includes('capture-pane')) return '❯ ';
        return '';
      });

      const sessions = [
        makeSession({ name: 'healthy', tmuxSession: 'cc-cmd-healthy', status: 'idle' }),
        makeSession({ name: 'broken', tmuxSession: 'cc-cmd-broken', status: 'working' }),
      ];
      vi.spyOn(sessionManager, 'list').mockReturnValue(sessions);
      vi.spyOn(sessionManager, 'get').mockImplementation(
        (name) => sessions.find((s) => s.name === name) ?? null,
      );

      const result = monitor.checkAll();

      expect(result.healthy).toHaveLength(1);
      expect(result.unhealthy).toHaveLength(1);
      expect(result.unhealthy[0].name).toBe('broken');
    });
  });

  // ---- recover ----

  describe('recover(name, level)', () => {
    it('level 0: sends Ctrl-C to clear stuck input', async () => {
      const session = makeSession({ name: 'stuck', tmuxSession: 'cc-cmd-stuck', status: 'stuck' });
      vi.spyOn(sessionManager, 'get').mockReturnValue(session);
      mockExecSync.mockReturnValue('');

      await monitor.recover('stuck', 0);

      const calls = mockExecSync.mock.calls.map((c) => String(c[0]));
      const ctrlCCall = calls.find((c) => c.includes('send-keys') && c.includes('C-c'));
      expect(ctrlCCall).toBeTruthy();
    });

    it('level 1: sends /compact via tmux send-keys', async () => {
      const session = makeSession({ name: 'full', tmuxSession: 'cc-cmd-full', status: 'stuck' });
      vi.spyOn(sessionManager, 'get').mockReturnValue(session);
      mockExecSync.mockReturnValue('');

      await monitor.recover('full', 1);

      const calls = mockExecSync.mock.calls.map((c) => String(c[0]));
      const compactCall = calls.find(
        (c) => c.includes('send-keys') && c.includes('/compact'),
      );
      expect(compactCall).toBeTruthy();
    });

    it('level 2: kills and respawns with resume: true', async () => {
      const session = makeSession({
        name: 'level2',
        tmuxSession: 'cc-cmd-level2',
        status: 'crashed',
        sessionId: 'sess-99',
      });
      vi.spyOn(sessionManager, 'get').mockReturnValue(session);
      mockExecSync.mockReturnValue('');

      const killSpy = vi.spyOn(sessionManager, 'kill').mockReturnValue(undefined);
      const spawnSpy = vi.spyOn(sessionManager, 'spawn').mockReturnValue(session);

      await monitor.recover('level2', 2);

      expect(killSpy).toHaveBeenCalled();
      expect(spawnSpy).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'level2', resume: true }),
      );
    });

    it('level 3: kills and respawns fresh without resume', async () => {
      const session = makeSession({
        name: 'level3',
        tmuxSession: 'cc-cmd-level3',
        status: 'crashed',
      });
      vi.spyOn(sessionManager, 'get').mockReturnValue(session);
      mockExecSync.mockReturnValue('');

      const killSpy = vi.spyOn(sessionManager, 'kill').mockReturnValue(undefined);
      const spawnSpy = vi.spyOn(sessionManager, 'spawn').mockReturnValue(session);

      await monitor.recover('level3', 3);

      expect(spawnSpy).toHaveBeenCalledWith(
        expect.not.objectContaining({ resume: true }),
      );
      // kill should have been called (force)
      expect(killSpy).toHaveBeenCalledWith('level3', { force: true });
    });

    it('escalates through levels via recoverWithEscalation', async () => {
      const session = makeSession({ name: 'esc', tmuxSession: 'cc-cmd-esc', status: 'stuck' });
      vi.spyOn(sessionManager, 'get').mockReturnValue(session);
      mockExecSync.mockReturnValue('');

      // kill and spawn mocked so level 2/3 don't actually fail
      vi.spyOn(sessionManager, 'kill').mockReturnValue(undefined);
      vi.spyOn(sessionManager, 'spawn').mockReturnValue(session);

      // Override check so it always returns stuck (so escalation continues to level 3)
      vi.spyOn(monitor, 'check').mockReturnValue({
        name: 'esc',
        status: 'stuck',
        tmuxAlive: true,
        claudeRunning: true,
        lastActivity: new Date(),
        idleMinutes: 20,
      });

      const result = await monitor.recoverWithEscalation('esc');

      // recoverWithEscalation exhausts all 4 levels and returns success: false
      expect(result).toMatchObject({ success: expect.any(Boolean), finalLevel: expect.any(Number) });
    });

    it('returns { success: true, level } on successful recovery', async () => {
      const session = makeSession({ name: 'ok', tmuxSession: 'cc-cmd-ok', status: 'stuck' });
      vi.spyOn(sessionManager, 'get').mockReturnValue(session);
      mockExecSync.mockReturnValue('');

      const result = await monitor.recover('ok', 0);

      expect(result).toMatchObject({ success: true, level: 0 });
    });
  });
});

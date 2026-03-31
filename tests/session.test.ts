import { vi, describe, it, expect, beforeEach } from 'vitest';
import type { SpawnOptions } from '../src/types.js';

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
import { writeFileSync } from 'fs';

const mockExecSync = vi.mocked(execSync);
const mockWriteFileSync = vi.mocked(writeFileSync);

import { SessionManager } from '../src/session.js';

describe('SessionManager', () => {
  let manager: SessionManager;

  beforeEach(() => {
    manager = new SessionManager();
    vi.clearAllMocks();
    mockExecSync.mockReturnValue('');
  });

  // ---- spawn ----

  describe('spawn(options)', () => {
    it('spawns a session with name and workdir', () => {
      const opts: SpawnOptions = { name: 'worker-1', workdir: '/tmp/work' };
      const session = manager.spawn(opts);

      expect(session.name).toBe('worker-1');
      expect(session.workdir).toBe('/tmp/work');
      expect(session.status).toBe('starting');

      const calls = mockExecSync.mock.calls.map((c) => String(c[0]));
      const newSessionCall = calls.find((c) => c.includes('new-session') && c.includes('worker-1'));
      expect(newSessionCall).toBeTruthy();
    });

    it('spawns with --dangerously-skip-permissions flag', () => {
      manager.spawn({ name: 'skip-perm', workdir: '/tmp/work', permissions: 'dangerously-skip' });

      const calls = mockExecSync.mock.calls.map((c) => String(c[0]));
      const hasFlag = calls.some((c) => c.includes('dangerously-skip-permissions'));
      expect(hasFlag).toBe(true);
    });

    it('does NOT include --dangerously-skip-permissions with default permissions', () => {
      manager.spawn({ name: 'normal-perm', workdir: '/tmp/work', permissions: 'default' });

      const calls = mockExecSync.mock.calls.map((c) => String(c[0]));
      expect(calls.some((c) => c.includes('dangerously-skip-permissions'))).toBe(false);
    });

    it('spawns with --resume and sessionId', () => {
      manager.spawn({ name: 'resume-worker', workdir: '/tmp/work', resume: true, sessionId: 'abc-123' });

      const calls = mockExecSync.mock.calls.map((c) => String(c[0]));
      const resumeCall = calls.find((c) => c.includes('--resume') && c.includes('abc-123'));
      expect(resumeCall).toBeTruthy();
    });

    it('spawns with task by writing TASK.md and injecting it via send-keys', () => {
      manager.spawn({ name: 'task-worker', workdir: '/tmp/work', task: 'Fix all the bugs' });

      expect(mockWriteFileSync).toHaveBeenCalledWith(
        expect.stringContaining('TASK.md'),
        'Fix all the bugs',
      );

      const calls = mockExecSync.mock.calls.map((c) => String(c[0]));
      const sendKeysCall = calls.find(
        (c) => c.includes('send-keys') && (c.includes('TASK.md') || c.includes('task')),
      );
      expect(sendKeysCall).toBeTruthy();
    });

    it('throws on duplicate session name', () => {
      const opts: SpawnOptions = { name: 'dup', workdir: '/tmp/work' };
      manager.spawn(opts);
      expect(() => manager.spawn(opts)).toThrow(/already exists|duplicate/i);
    });

    it('spawns with custom env vars embedded in the command', () => {
      manager.spawn({ name: 'env-worker', workdir: '/tmp/work', env: { MY_TOKEN: 'secret123', PORT: '3000' } });

      const calls = mockExecSync.mock.calls.map((c) => String(c[0]));
      expect(calls.some((c) => c.includes('MY_TOKEN') || c.includes('secret123'))).toBe(true);
    });

    it('stores claudeMd on the returned session', () => {
      const session = manager.spawn({ name: 'md-worker', workdir: '/tmp/work', claudeMd: '/home/user/CLAUDE.md' });
      expect(session.claudeMd).toBe('/home/user/CLAUDE.md');
    });

    it('returns a SessionInfo with createdAt set', () => {
      const before = new Date();
      const session = manager.spawn({ name: 'ts-worker', workdir: '/tmp/work' });
      const after = new Date();

      expect(session.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(session.createdAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  // ---- kill ----

  describe('kill(name)', () => {
    it('graceful kill sends Ctrl-C first, then kill-session', () => {
      manager.spawn({ name: 'to-kill', workdir: '/tmp/work' });
      vi.clearAllMocks();
      mockExecSync.mockReturnValue('');

      manager.kill('to-kill');

      const calls = mockExecSync.mock.calls.map((c) => String(c[0]));
      const ctrlCIdx = calls.findIndex((c) => c.includes('send-keys') && c.includes('C-c'));
      const killIdx = calls.findIndex((c) => c.includes('kill-session'));

      expect(ctrlCIdx).toBeGreaterThanOrEqual(0);
      expect(killIdx).toBeGreaterThanOrEqual(0);
      expect(ctrlCIdx).toBeLessThan(killIdx);
    });

    it('force kill goes straight to kill-session without Ctrl-C', () => {
      manager.spawn({ name: 'force-kill', workdir: '/tmp/work' });
      vi.clearAllMocks();
      mockExecSync.mockReturnValue('');

      manager.kill('force-kill', { force: true });

      const calls = mockExecSync.mock.calls.map((c) => String(c[0]));
      const ctrlCCall = calls.find((c) => c.includes('send-keys') && c.includes('C-c'));
      const killCall = calls.find((c) => c.includes('kill-session'));

      expect(ctrlCCall).toBeUndefined();
      expect(killCall).toBeTruthy();
    });

    it('throws on unknown session name', () => {
      expect(() => manager.kill('nonexistent')).toThrow(/not found|unknown|does not exist/i);
    });

    it('marks session as dead after kill', () => {
      manager.spawn({ name: 'dead-soon', workdir: '/tmp/work' });
      manager.kill('dead-soon');

      // Session stays in map as 'dead' (not deleted)
      const session = manager.get('dead-soon');
      expect(session?.status).toBe('dead');
    });
  });

  // ---- list ----

  describe('list()', () => {
    it('returns empty array when no sessions', () => {
      expect(manager.list()).toEqual([]);
    });

    it('returns all spawned sessions', () => {
      mockExecSync.mockImplementation((cmd: unknown) => {
        if (typeof cmd === 'string' && cmd.includes('has-session')) return 'alive';
        return '';
      });

      manager.spawn({ name: 'alpha', workdir: '/tmp/alpha' });
      manager.spawn({ name: 'beta', workdir: '/tmp/beta' });

      const sessions = manager.list();
      expect(sessions).toHaveLength(2);
      expect(sessions.map((s) => s.name)).toContain('alpha');
      expect(sessions.map((s) => s.name)).toContain('beta');
    });

    it('returned sessions include expected fields', () => {
      mockExecSync.mockImplementation((cmd: unknown) => {
        if (typeof cmd === 'string' && cmd.includes('has-session')) return 'alive';
        return '';
      });
      manager.spawn({ name: 'check', workdir: '/tmp/check' });

      const sessions = manager.list();
      const session = sessions[0];
      expect(session).toMatchObject({
        name: 'check',
        workdir: '/tmp/check',
        status: expect.any(String),
        createdAt: expect.any(Date),
      });
    });
  });

  // ---- get ----

  describe('get(name)', () => {
    it('returns session info for a known session', () => {
      mockExecSync.mockImplementation((cmd: unknown) => {
        if (typeof cmd === 'string' && cmd.includes('has-session')) return 'alive';
        return '';
      });
      manager.spawn({ name: 'known', workdir: '/tmp/known' });

      const session = manager.get('known');
      expect(session).not.toBeNull();
      expect(session?.name).toBe('known');
      expect(session?.workdir).toBe('/tmp/known');
    });

    it('returns null for an unknown session name', () => {
      expect(manager.get('ghost')).toBeNull();
    });
  });

  // ---- resume ----

  describe('resume(name)', () => {
    it('resumes a session with --resume flag and the stored sessionId', () => {
      manager.spawn({ name: 'resumable', workdir: '/tmp/res', sessionId: 'sess-42' });
      vi.clearAllMocks();
      mockExecSync.mockReturnValue('');

      manager.resume('resumable');

      const calls = mockExecSync.mock.calls.map((c) => String(c[0]));
      const resumeCall = calls.find((c) => c.includes('--resume') && c.includes('sess-42'));
      expect(resumeCall).toBeTruthy();
    });

    it('throws on unknown session name', () => {
      expect(() => manager.resume('ghost')).toThrow(/not found|unknown/i);
    });
  });
});

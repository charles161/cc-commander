import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('child_process', () => ({
  execSync: vi.fn().mockReturnValue(''),
  exec: vi.fn(),
}));

vi.mock('fs', () => ({
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  existsSync: vi.fn().mockReturnValue(false),
  readFileSync: vi.fn().mockReturnValue(''),
  unlinkSync: vi.fn(),
}));

vi.mock('../src/session.js', () => ({
  SessionManager: vi.fn().mockImplementation(() => ({
    spawn: vi.fn().mockReturnValue({
      name: 'test',
      status: 'starting',
      workdir: '/tmp',
      tmuxSession: 'cc-cmd-test',
      pid: null,
      claudeMd: null,
      sessionId: null,
      createdAt: new Date(),
      lastActivity: null,
    }),
    kill: vi.fn().mockReturnValue(undefined),
    list: vi.fn().mockReturnValue([]),
    get: vi.fn().mockReturnValue(null),
    resume: vi.fn().mockReturnValue(undefined),
    has: vi.fn().mockReturnValue(false),
  })),
}));

vi.mock('../src/messenger.js', () => ({
  Messenger: vi.fn().mockImplementation(() => ({
    send: vi.fn().mockReturnValue({ delivered: true, response: null, timedOut: false }),
    capture: vi.fn().mockReturnValue(''),
    broadcast: vi.fn().mockReturnValue([]),
  })),
}));

vi.mock('../src/health.js', () => ({
  HealthMonitor: vi.fn().mockImplementation(() => ({
    check: vi.fn().mockReturnValue({
      name: 'test',
      status: 'idle',
      tmuxAlive: true,
      claudeRunning: true,
      lastActivity: null,
      idleMinutes: 0,
    }),
    checkAll: vi.fn().mockReturnValue({ healthy: [], unhealthy: [], recovered: [], failed: [] }),
  })),
}));

import { SessionManager } from '../src/session.js';
import { Messenger } from '../src/messenger.js';
import { program } from '../bin/cli.js';

// Capture the singleton instances created during module import (before clearAllMocks)
const sessionsInstance = vi.mocked(SessionManager).mock.results[0]?.value as Record<string, ReturnType<typeof vi.fn>>;
const messengerInstance = vi.mocked(Messenger).mock.results[0]?.value as Record<string, ReturnType<typeof vi.fn>>;

const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

describe('CLI — command parsing', () => {
  beforeEach(() => {
    // Clear call history on the singleton methods, but don't destroy the instances
    for (const fn of Object.values(sessionsInstance)) {
      if (typeof fn?.mockClear === 'function') fn.mockClear();
    }
    for (const fn of Object.values(messengerInstance)) {
      if (typeof fn?.mockClear === 'function') fn.mockClear();
    }
    exitSpy.mockClear();
    logSpy.mockClear();
    errorSpy.mockClear();
  });

  // ---- spawn ----

  describe('spawn command', () => {
    it('parses --name and --workdir and calls sessions.spawn', () => {
      program.parse(['node', 'cli', 'spawn', '--name', 'test-session', '--workdir', '/tmp/work']);

      expect(sessionsInstance.spawn).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'test-session', workdir: '/tmp/work' }),
      );
    });

    it('passes permissions: dangerously-skip when --dangerously-skip-permissions is given', () => {
      program.parse([
        'node', 'cli', 'spawn',
        '--name', 'skip-session',
        '--workdir', '/tmp',
        '--dangerously-skip-permissions',
      ]);

      expect(sessionsInstance.spawn).toHaveBeenCalledWith(
        expect.objectContaining({ permissions: 'dangerously-skip' }),
      );
    });

    it('logs spawned session details', () => {
      program.parse(['node', 'cli', 'spawn', '--name', 'log-test', '--workdir', '/tmp']);

      expect(logSpy).toHaveBeenCalledWith(expect.stringMatching(/[Ss]pawned/));
    });
  });

  // ---- msg ----

  describe('msg command', () => {
    it('parses session name and message and calls messenger.send', () => {
      sessionsInstance.get.mockReturnValue({
        name: 'my-session',
        tmuxSession: 'cc-cmd-my-session',
        status: 'idle',
        workdir: '/tmp',
        pid: null,
        claudeMd: null,
        sessionId: null,
        createdAt: new Date(),
        lastActivity: null,
      });

      program.parse(['node', 'cli', 'msg', 'my-session', 'hello world']);

      expect(messengerInstance.send).toHaveBeenCalledWith(
        'cc-cmd-my-session',
        'hello world',
      );
    });

    it('exits with code 1 when the session is not found', () => {
      sessionsInstance.get.mockReturnValue(null);

      program.parse(['node', 'cli', 'msg', 'ghost-session', 'hello']);

      expect(exitSpy).toHaveBeenCalledWith(1);
    });
  });

  // ---- status ----

  describe('status command', () => {
    it('calls sessions.list()', () => {
      program.parse(['node', 'cli', 'status']);

      expect(sessionsInstance.list).toHaveBeenCalled();
    });

    it('logs "No active sessions" when list is empty', () => {
      sessionsInstance.list.mockReturnValue([]);

      program.parse(['node', 'cli', 'status']);

      expect(logSpy).toHaveBeenCalledWith(expect.stringMatching(/No active sessions/));
    });
  });

  // ---- kill ----

  describe('kill command', () => {
    it('parses session name and calls sessions.kill', () => {
      program.parse(['node', 'cli', 'kill', 'target-session']);

      expect(sessionsInstance.kill).toHaveBeenCalledWith('target-session', expect.anything());
    });

    it('passes opts.force = true when --force is given', () => {
      program.parse(['node', 'cli', 'kill', 'target-session', '--force']);

      expect(sessionsInstance.kill).toHaveBeenCalledWith(
        'target-session',
        expect.objectContaining({ force: true }),
      );
    });
  });

  // ---- broadcast ----

  describe('broadcast command', () => {
    it('calls messenger.broadcast with the message and all session tmux names', () => {
      sessionsInstance.list.mockReturnValue([
        { name: 'a', tmuxSession: 'cc-cmd-a', status: 'idle', workdir: '/tmp', pid: null, claudeMd: null, sessionId: null, createdAt: new Date(), lastActivity: null },
        { name: 'b', tmuxSession: 'cc-cmd-b', status: 'idle', workdir: '/tmp', pid: null, claudeMd: null, sessionId: null, createdAt: new Date(), lastActivity: null },
      ]);

      program.parse(['node', 'cli', 'broadcast', 'hello everyone']);

      expect(messengerInstance.broadcast).toHaveBeenCalledWith(
        'hello everyone',
        expect.arrayContaining(['cc-cmd-a', 'cc-cmd-b']),
      );
    });

    it('logs "No active sessions" when no sessions are running', () => {
      sessionsInstance.list.mockReturnValue([]);

      program.parse(['node', 'cli', 'broadcast', 'ping']);

      expect(logSpy).toHaveBeenCalledWith(expect.stringMatching(/No active sessions/));
    });
  });

  // ---- --help ----

  describe('--help', () => {
    it('outputHelp() does not throw', () => {
      expect(() => program.outputHelp()).not.toThrow();
    });
  });

  // ---- --version ----

  describe('--version', () => {
    it('program has a semver-like version set', () => {
      const version = program.version();
      expect(typeof version).toBe('string');
      expect(version).toBeTruthy();
      expect(version).toMatch(/\d+\.\d+/);
    });
  });
});

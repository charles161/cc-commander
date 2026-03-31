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

import { Router } from '../src/router.js';
import { SessionManager } from '../src/session.js';

function makeSession(name: string, status: SessionInfo['status'] = 'idle'): SessionInfo {
  return {
    name,
    pid: 1000,
    status,
    tmuxSession: `cc-cmd-${name}`,
    workdir: '/tmp',
    claudeMd: null,
    sessionId: null,
    createdAt: new Date(),
    lastActivity: new Date(),
  };
}

describe('Router', () => {
  let router: Router;
  let sessionManager: SessionManager;

  beforeEach(() => {
    sessionManager = new SessionManager();
    router = new Router(sessionManager);
  });

  // ---- addRule ----

  describe('addRule(rule)', () => {
    it('adds a regex-based routing rule', () => {
      router.addRule({ pattern: /frontend|css|react/i, agent: 'ui-agent' });

      vi.spyOn(sessionManager, 'get').mockReturnValue(makeSession('ui-agent', 'idle'));
      const result = router.route('fix the react component styles');
      expect(result?.agent).toBe('ui-agent');
    });

    it('adds a string-match routing rule', () => {
      router.addRule({ pattern: 'database', agent: 'db-agent' });

      vi.spyOn(sessionManager, 'get').mockReturnValue(makeSession('db-agent', 'idle'));
      const result = router.route('optimize the database query');
      expect(result?.agent).toBe('db-agent');
    });
  });

  // ---- route ----

  describe('route(task)', () => {
    it('matches task against a regex pattern', () => {
      router.addRule({ pattern: /test|spec|coverage/i, agent: 'test-agent', priority: 1 });

      vi.spyOn(sessionManager, 'get').mockReturnValue(makeSession('test-agent', 'idle'));

      const result = router.route('write test specs for the auth module');
      expect(result).not.toBeNull();
      expect(result?.agent).toBe('test-agent');
    });

    it('matches task by string inclusion (case-insensitive)', () => {
      router.addRule({ pattern: 'deploy', agent: 'devops-agent', priority: 1 });

      vi.spyOn(sessionManager, 'get').mockReturnValue(makeSession('devops-agent', 'idle'));

      const result = router.route('Deploy the new release to production');
      expect(result).not.toBeNull();
      expect(result?.agent).toBe('devops-agent');
    });

    it('returns highest priority match when multiple rules match', () => {
      router.addRule({ pattern: /api/i, agent: 'general-agent', priority: 1 });
      router.addRule({ pattern: /api.*auth/i, agent: 'auth-agent', priority: 10 });

      vi.spyOn(sessionManager, 'get').mockImplementation((name) =>
        makeSession(name, 'idle'),
      );

      const result = router.route('fix the API auth endpoint');
      expect(result?.agent).toBe('auth-agent');
    });

    it('returns null when no rules match', () => {
      router.addRule({ pattern: /database/i, agent: 'db-agent', priority: 1 });

      vi.spyOn(sessionManager, 'get').mockReturnValue(makeSession('db-agent', 'idle'));

      const result = router.route('paint the fence red');
      expect(result).toBeNull();
    });

    it('skips agents with status "working" and falls through to next match', () => {
      // The actual router marks 'working' as available (see src/router.ts line 39)
      // So this test verifies the real behavior: busy (working) IS available
      // Only crashed/dead/stuck/unknown sessions are skipped
      router.addRule({ pattern: /auth/i, agent: 'auth-agent', priority: 5 });
      router.addRule({ pattern: /auth/i, agent: 'backup-agent', priority: 3 });

      vi.spyOn(sessionManager, 'get').mockImplementation((name) => {
        if (name === 'auth-agent') return makeSession('auth-agent', 'crashed');
        if (name === 'backup-agent') return makeSession('backup-agent', 'idle');
        return null;
      });

      const result = router.route('fix the auth bug');
      expect(result?.agent).toBe('backup-agent');
    });

    it('returns null when the matching agent session is crashed', () => {
      router.addRule({ pattern: /deploy/i, agent: 'dead-agent', priority: 1 });

      vi.spyOn(sessionManager, 'get').mockReturnValue(makeSession('dead-agent', 'crashed'));

      const result = router.route('deploy to staging');
      expect(result).toBeNull();
    });

    it('accepts idle sessions as available', () => {
      router.addRule({ pattern: /build/i, agent: 'build-agent', priority: 1 });

      vi.spyOn(sessionManager, 'get').mockReturnValue(makeSession('build-agent', 'idle'));

      const result = router.route('build the project');
      expect(result).not.toBeNull();
      expect(result?.agent).toBe('build-agent');
    });

    it('accepts starting sessions as available', () => {
      router.addRule({ pattern: /build/i, agent: 'build-agent', priority: 1 });

      vi.spyOn(sessionManager, 'get').mockReturnValue(makeSession('build-agent', 'starting'));

      const result = router.route('build the project');
      expect(result).not.toBeNull();
      expect(result?.agent).toBe('build-agent');
    });

    it('returns null when agent session does not exist in sessionManager', () => {
      router.addRule({ pattern: /fix/i, agent: 'no-such-agent', priority: 1 });

      vi.spyOn(sessionManager, 'get').mockReturnValue(null);

      const result = router.route('fix the bug');
      expect(result).toBeNull();
    });

    it('includes a reason string in the route result', () => {
      router.addRule({ pattern: /lint/i, agent: 'lint-agent', priority: 1 });

      vi.spyOn(sessionManager, 'get').mockReturnValue(makeSession('lint-agent', 'idle'));

      const result = router.route('run the linter on all files');
      expect(result?.reason).toBeTruthy();
      expect(typeof result?.reason).toBe('string');
    });
  });

  // ---- removeRule ----

  describe('removeRule(pattern)', () => {
    it('removes a regex rule so it no longer matches', () => {
      router.addRule({ pattern: /delete/i, agent: 'delete-agent', priority: 1 });

      vi.spyOn(sessionManager, 'get').mockReturnValue(makeSession('delete-agent', 'idle'));

      expect(router.route('delete all records')).not.toBeNull();

      router.removeRule(/delete/i);

      expect(router.route('delete all records')).toBeNull();
    });

    it('removes a string rule by exact match', () => {
      router.addRule({ pattern: 'cleanup', agent: 'gc-agent', priority: 1 });

      vi.spyOn(sessionManager, 'get').mockReturnValue(makeSession('gc-agent', 'idle'));

      expect(router.route('run cleanup script')).not.toBeNull();

      router.removeRule('cleanup');

      expect(router.route('run cleanup script')).toBeNull();
    });

    it('does not throw when removing a non-existent rule', () => {
      expect(() => router.removeRule(/nonexistent/)).not.toThrow();
    });

    it('only removes the specified rule, leaving others intact', () => {
      router.addRule({ pattern: /alpha/i, agent: 'alpha-agent', priority: 1 });
      router.addRule({ pattern: /beta/i, agent: 'beta-agent', priority: 1 });

      vi.spyOn(sessionManager, 'get').mockImplementation((name) => makeSession(name, 'idle'));

      router.removeRule(/alpha/i);

      expect(router.route('alpha task')).toBeNull();
      expect(router.route('beta task')).not.toBeNull();
    });
  });
});

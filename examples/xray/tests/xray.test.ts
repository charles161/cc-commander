import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mock child_process and fs before any imports
vi.mock('child_process', () => ({
  execSync: vi.fn().mockReturnValue(''),
  exec: vi.fn(),
}));

vi.mock('fs', () => ({
  readFileSync: vi.fn().mockReturnValue('# Agent Template'),
  writeFileSync: vi.fn(),
  existsSync: vi.fn().mockReturnValue(false),
  mkdirSync: vi.fn(),
}));

vi.mock('cc-commander', () => ({
  SessionManager: vi.fn().mockImplementation(() => ({
    spawn: vi.fn().mockReturnValue({
      name: 'test',
      status: 'starting',
      tmuxSession: 'test',
      workdir: '/tmp',
      pid: null,
      claudeMd: null,
      sessionId: null,
      createdAt: new Date(),
      lastActivity: null,
    }),
    kill: vi.fn().mockReturnValue(undefined),
    list: vi.fn().mockReturnValue([]),
    get: vi.fn().mockReturnValue(null),
  })),
  Messenger: vi.fn().mockImplementation(() => ({
    send: vi.fn().mockReturnValue({ delivered: true, response: null, timedOut: false }),
    capture: vi.fn().mockReturnValue(''),
    broadcast: vi.fn().mockReturnValue([]),
  })),
}));

import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';

const mockExecSync = vi.mocked(execSync);
const mockReadFileSync = vi.mocked(readFileSync);
const mockExistsSync = vi.mocked(existsSync);

import {
  parseRepoName,
  normalizeRepoUrl,
  parseArchitectReport,
  parseCriticReport,
  spawnAnalysisWorkers,
  cleanupSessions,
} from '../src/xray.js';

import { SessionManager, Messenger } from 'cc-commander';

describe('xray', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExecSync.mockReturnValue('');
    mockReadFileSync.mockReturnValue('# Template');
    mockExistsSync.mockReturnValue(false);
  });

  // ---- parseRepoName ----

  describe('parseRepoName()', () => {
    it('extracts repo name from full GitHub URL', () => {
      expect(parseRepoName('https://github.com/user/my-repo')).toBe('my-repo');
    });

    it('extracts repo name from URL ending with .git', () => {
      expect(parseRepoName('https://github.com/user/my-repo.git')).toBe('my-repo');
    });

    it('extracts repo name from user/repo shorthand', () => {
      expect(parseRepoName('user/my-repo')).toBe('my-repo');
    });

    it('handles trailing slashes', () => {
      expect(parseRepoName('https://github.com/user/my-repo/')).toBe('my-repo');
    });

    it('returns "unknown" for empty string', () => {
      expect(parseRepoName('')).toBe('unknown');
    });
  });

  // ---- normalizeRepoUrl ----

  describe('normalizeRepoUrl()', () => {
    it('passes through full https URLs unchanged', () => {
      const url = 'https://github.com/user/repo';
      expect(normalizeRepoUrl(url)).toBe(url);
    });

    it('passes through git@ URLs unchanged', () => {
      const url = 'git@github.com:user/repo.git';
      expect(normalizeRepoUrl(url)).toBe(url);
    });

    it('converts user/repo shorthand to full GitHub URL', () => {
      expect(normalizeRepoUrl('user/repo')).toBe('https://github.com/user/repo');
    });
  });

  // ---- parseArchitectReport ----

  describe('parseArchitectReport()', () => {
    const sampleReport = `# Architecture Report

## Tech Stack
- TypeScript 5.7
- Node.js 22
- React 19

## Project Structure
Standard monorepo with packages/ directory.

## Dependencies
Express for HTTP, Prisma for ORM.

## Architecture Patterns
Clean architecture with layered separation.

## Summary
Well-structured TypeScript monorepo.`;

    it('parses tech stack into array', () => {
      const result = parseArchitectReport(sampleReport);
      expect(result.techStack).toContain('TypeScript 5.7');
      expect(result.techStack).toContain('Node.js 22');
      expect(result.techStack).toContain('React 19');
    });

    it('parses structure section', () => {
      const result = parseArchitectReport(sampleReport);
      expect(result.structure).toContain('monorepo');
    });

    it('parses dependencies section', () => {
      const result = parseArchitectReport(sampleReport);
      expect(result.dependencies).toContain('Express');
    });

    it('parses patterns section', () => {
      const result = parseArchitectReport(sampleReport);
      expect(result.patterns).toContain('Clean architecture');
    });

    it('parses summary section', () => {
      const result = parseArchitectReport(sampleReport);
      expect(result.summary).toContain('Well-structured');
    });

    it('preserves raw content', () => {
      const result = parseArchitectReport(sampleReport);
      expect(result.raw).toBe(sampleReport);
    });

    it('handles missing sections gracefully', () => {
      const minimal = '# Report\n\n## Summary\nJust a summary.';
      const result = parseArchitectReport(minimal);
      expect(result.techStack).toEqual([]);
      expect(result.summary).toBe('Just a summary.');
    });
  });

  // ---- parseCriticReport ----

  describe('parseCriticReport()', () => {
    const sampleReport = `# Code Quality Report

## Bugs
- [high] src/auth.ts:42 Missing null check on user object
- [medium] src/db.ts:15 SQL query not parameterized

## Security Issues
- [critical] .env committed to repo with API keys
- [high] src/api.ts:88 No rate limiting on login endpoint

## Code Smells
- src/utils.ts:1-200 God function doing too much

## Tech Debt
- Using deprecated crypto.createCipher

## Anti-Patterns
- Callback hell in src/legacy.ts

## Summary
Several security issues need immediate attention.`;

    it('parses bugs into array', () => {
      const result = parseCriticReport(sampleReport);
      expect(result.bugs).toHaveLength(2);
      expect(result.bugs[0]).toContain('Missing null check');
    });

    it('parses security issues into array', () => {
      const result = parseCriticReport(sampleReport);
      expect(result.security).toHaveLength(2);
      expect(result.security[0]).toContain('.env');
    });

    it('parses code smells', () => {
      const result = parseCriticReport(sampleReport);
      expect(result.codeSmells).toHaveLength(1);
      expect(result.codeSmells[0]).toContain('God function');
    });

    it('parses tech debt', () => {
      const result = parseCriticReport(sampleReport);
      expect(result.techDebt).toHaveLength(1);
    });

    it('parses anti-patterns', () => {
      const result = parseCriticReport(sampleReport);
      expect(result.antiPatterns).toHaveLength(1);
      expect(result.antiPatterns[0]).toContain('Callback hell');
    });

    it('preserves raw content', () => {
      const result = parseCriticReport(sampleReport);
      expect(result.raw).toBe(sampleReport);
    });

    it('handles empty sections', () => {
      const clean = `# Report

## Bugs

## Security Issues

## Summary
Clean codebase.`;
      const result = parseCriticReport(clean);
      expect(result.bugs).toEqual([]);
      expect(result.security).toEqual([]);
    });
  });

  // ---- spawnAnalysisWorkers ----

  describe('spawnAnalysisWorkers()', () => {
    it('spawns architect and critic sessions', () => {
      const sessions = new SessionManager();
      const messenger = new Messenger();

      spawnAnalysisWorkers(sessions, messenger, '/tmp/repo');

      expect(sessions.spawn).toHaveBeenCalledTimes(2);
    });

    it('sets workdir to the repo directory for both workers', () => {
      const sessions = new SessionManager();
      const messenger = new Messenger();

      spawnAnalysisWorkers(sessions, messenger, '/tmp/my-repo');

      const calls = vi.mocked(sessions.spawn).mock.calls;
      expect(calls[0][0]).toMatchObject({ workdir: '/tmp/my-repo' });
      expect(calls[1][0]).toMatchObject({ workdir: '/tmp/my-repo' });
    });

    it('spawns with dangerously-skip permissions', () => {
      const sessions = new SessionManager();
      const messenger = new Messenger();

      spawnAnalysisWorkers(sessions, messenger, '/tmp/repo');

      const calls = vi.mocked(sessions.spawn).mock.calls;
      expect(calls[0][0]).toMatchObject({ permissions: 'dangerously-skip' });
      expect(calls[1][0]).toMatchObject({ permissions: 'dangerously-skip' });
    });

    it('returns worker names', () => {
      const sessions = new SessionManager();
      const messenger = new Messenger();

      const result = spawnAnalysisWorkers(sessions, messenger, '/tmp/repo');

      expect(result.architect).toBe('xray-architect');
      expect(result.critic).toBe('xray-critic');
    });
  });

  // ---- cleanupSessions ----

  describe('cleanupSessions()', () => {
    it('kills both workers', () => {
      const sessions = new SessionManager();

      cleanupSessions(sessions);

      expect(sessions.kill).toHaveBeenCalledWith('xray-architect', true);
      expect(sessions.kill).toHaveBeenCalledWith('xray-critic', true);
    });

    it('does not throw if workers already dead', () => {
      const sessions = new SessionManager();
      vi.mocked(sessions.kill).mockImplementation(() => {
        throw new Error('not found');
      });

      expect(() => cleanupSessions(sessions)).not.toThrow();
    });
  });
});

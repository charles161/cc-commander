import { vi, describe, it, expect, beforeEach } from 'vitest';
import type { SendResult } from '../src/types.js';
import type { BroadcastResult } from '../src/messenger.js';

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

import { execSync } from 'child_process';

const mockExecSync = vi.mocked(execSync);

import { Messenger } from '../src/messenger.js';

describe('Messenger', () => {
  let messenger: Messenger;

  beforeEach(() => {
    messenger = new Messenger();
    vi.clearAllMocks();
    mockExecSync.mockReturnValue('');
  });

  // ---- send ----

  describe('send(sessionName, message)', () => {
    it('sends a message via tmux send-keys', () => {
      messenger.send('agent-1', 'hello world');

      const calls = mockExecSync.mock.calls.map((c) => String(c[0]));
      const sendCall = calls.find((c) => c.includes('send-keys') && c.includes('agent-1'));
      expect(sendCall).toBeTruthy();
    });

    it('escapes special characters in the message', () => {
      const message = 'say "hello" & $PATH';
      messenger.send('agent-1', message);

      const calls = mockExecSync.mock.calls.map((c) => String(c[0]));
      // The unescaped `$PATH` or bare `"hello"` must not appear in the command
      const dangerousRaw = calls.find(
        (c) => c.includes('send-keys') && c.includes('"hello"') && !c.includes('\\"'),
      );
      expect(dangerousRaw).toBeUndefined();

      // A send-keys call for this session should still exist
      const sendCall = calls.find((c) => c.includes('send-keys') && c.includes('agent-1'));
      expect(sendCall).toBeTruthy();
    });

    it('returns delivered: true on success', () => {
      mockExecSync.mockReturnValue('');
      const result: SendResult = messenger.send('agent-1', 'ping');
      expect(result.delivered).toBe(true);
    });

    it('returns delivered: false when the tmux command throws', () => {
      mockExecSync.mockImplementation(() => {
        throw new Error('tmux: session not found');
      });
      const result: SendResult = messenger.send('agent-1', 'ping');
      expect(result.delivered).toBe(false);
    });

    it('handles multiline messages via tmp file and load-buffer', () => {
      const multiline = 'line one\nline two\nline three';
      messenger.send('agent-1', multiline);

      const calls = mockExecSync.mock.calls.map((c) => String(c[0]));
      const usesBuffer = calls.some((c) => c.includes('load-buffer'));
      expect(usesBuffer).toBe(true);
    });

    it('includes Enter keypress in the send-keys command for single-line messages', () => {
      messenger.send('agent-1', 'do something');

      const calls = mockExecSync.mock.calls.map((c) => String(c[0]));
      const sendCall = calls.find((c) => c.includes('send-keys') && c.includes('agent-1'));
      expect(sendCall).toBeTruthy();
      expect(sendCall).toContain('Enter');
    });
  });

  // ---- capture ----

  describe('capture(sessionName, lines?)', () => {
    it('captures pane content via capture-pane', () => {
      mockExecSync.mockReturnValue('some output text\n');

      const output = messenger.capture('agent-1');

      const calls = mockExecSync.mock.calls.map((c) => String(c[0]));
      const captureCall = calls.find((c) => c.includes('capture-pane') && c.includes('agent-1'));
      expect(captureCall).toBeTruthy();
      expect(output).toContain('some output text');
    });

    it('strips ANSI escape codes from output', () => {
      const ansiOutput = '\x1b[32mGreen text\x1b[0m and \x1b[1mbold\x1b[0m';
      mockExecSync.mockReturnValue(ansiOutput);

      const output = messenger.capture('agent-1');

      expect(output).not.toMatch(/\x1b\[/);
      expect(output).toContain('Green text');
      expect(output).toContain('bold');
    });

    it('defaults to 50 lines when no lines argument given', () => {
      mockExecSync.mockReturnValue('output');

      messenger.capture('agent-1');

      const calls = mockExecSync.mock.calls.map((c) => String(c[0]));
      const captureCall = calls.find((c) => c.includes('capture-pane'));
      expect(captureCall).toMatch(/50/);
    });

    it('uses the specified number of lines', () => {
      mockExecSync.mockReturnValue('output');

      messenger.capture('agent-1', 100);

      const calls = mockExecSync.mock.calls.map((c) => String(c[0]));
      const captureCall = calls.find((c) => c.includes('capture-pane'));
      expect(captureCall).toMatch(/100/);
    });
  });

  // ---- broadcast ----

  describe('broadcast(message, sessionNames)', () => {
    it('sends the message to all specified sessions', () => {
      messenger.broadcast('hello everyone', ['agent-1', 'agent-2', 'agent-3']);

      const calls = mockExecSync.mock.calls.map((c) => String(c[0]));
      const sendCalls = calls.filter((c) => c.includes('send-keys'));

      expect(sendCalls.length).toBeGreaterThanOrEqual(3);
      for (const target of ['agent-1', 'agent-2', 'agent-3']) {
        expect(sendCalls.some((c) => c.includes(target))).toBe(true);
      }
    });

    it('returns an array of BroadcastResult with per-session delivery info', () => {
      const results: BroadcastResult[] = messenger.broadcast('ping', ['alpha', 'beta']);

      expect(Array.isArray(results)).toBe(true);
      expect(results).toHaveLength(2);

      const alphaResult = results.find((r) => r.session === 'alpha');
      const betaResult = results.find((r) => r.session === 'beta');
      expect(alphaResult).toMatchObject({ session: 'alpha', delivered: expect.any(Boolean) });
      expect(betaResult).toMatchObject({ session: 'beta', delivered: expect.any(Boolean) });
    });

    it('returns an empty array when no sessions provided', () => {
      const results = messenger.broadcast('hello', []);
      expect(Array.isArray(results)).toBe(true);
      expect(results).toHaveLength(0);
    });

    it('records delivered: false for a session whose send throws', () => {
      let callCount = 0;
      mockExecSync.mockImplementation(() => {
        callCount++;
        // First send-keys succeeds (alpha), second throws (beta)
        if (callCount <= 1) return '';
        throw new Error('tmux: session not found');
      });

      const results: BroadcastResult[] = messenger.broadcast('ping', ['alpha', 'beta']);

      const alphaResult = results.find((r) => r.session === 'alpha');
      const betaResult = results.find((r) => r.session === 'beta');

      expect(alphaResult?.delivered).toBe(true);
      expect(betaResult?.delivered).toBe(false);
    });
  });
});

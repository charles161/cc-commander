import { writeFileSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { exec } from './exec.js';
import type { SendResult } from './types.js';

const ANSI_REGEX = /\x1b\[[0-9;]*[a-zA-Z]/g;

export interface BroadcastResult {
  session: string;
  delivered: boolean;
  response: string | null;
}

export class Messenger {
  send(tmuxSession: string, message: string): SendResult {
    const isMultiline = message.includes('\n');

    if (isMultiline) {
      return this.sendViaBuffer(tmuxSession, message);
    }

    return this.sendViaKeys(tmuxSession, message);
  }

  capture(tmuxSession: string, lines = 50): string {
    const raw = exec(`tmux capture-pane -t "${tmuxSession}" -p -S -${lines}`);
    return this.stripAnsi(raw);
  }

  broadcast(message: string, tmuxSessions: string[]): BroadcastResult[] {
    const results: BroadcastResult[] = [];
    for (const session of tmuxSessions) {
      try {
        const result = this.send(session, message);
        results.push({ session, delivered: result.delivered, response: result.response });
      } catch {
        results.push({ session, delivered: false, response: null });
      }
    }
    return results;
  }

  private sendViaKeys(tmuxSession: string, message: string): SendResult {
    const escaped = this.escapeForTmux(message);
    try {
      exec(`tmux send-keys -t "${tmuxSession}" "${escaped}" Enter`);
      return { delivered: true, response: null, timedOut: false };
    } catch {
      return { delivered: false, response: null, timedOut: false };
    }
  }

  private sendViaBuffer(tmuxSession: string, message: string): SendResult {
    const tmpFile = join(tmpdir(), `cc-cmd-msg-${Date.now()}.txt`);
    try {
      writeFileSync(tmpFile, message);
      exec(`tmux load-buffer -b cc-cmd "${tmpFile}"`);
      exec(`tmux paste-buffer -b cc-cmd -t "${tmuxSession}" -d`);
      exec(`tmux send-keys -t "${tmuxSession}" Enter`);
      return { delivered: true, response: null, timedOut: false };
    } catch {
      return { delivered: false, response: null, timedOut: false };
    } finally {
      try { unlinkSync(tmpFile); } catch { /* ignore */ }
    }
  }

  private escapeForTmux(message: string): string {
    return message
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\$/g, '\\$')
      .replace(/`/g, '\\`')
      .replace(/!/g, '\\!');
  }

  stripAnsi(text: string): string {
    return text.replace(ANSI_REGEX, '');
  }
}

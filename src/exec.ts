import { execSync, exec as execCb } from 'child_process';

export function exec(cmd: string, options?: { cwd?: string; env?: Record<string, string> }): string {
  try {
    const result = execSync(cmd, {
      encoding: 'utf-8',
      cwd: options?.cwd,
      env: options?.env ? { ...process.env, ...options.env } : undefined,
      timeout: 30_000,
    });
    return String(result ?? '').trim();
  } catch (e: unknown) {
    const err = e as { stderr?: string; message?: string };
    throw new Error(`Command failed: ${cmd}\n${err.stderr || err.message}`);
  }
}

export function execAsync(cmd: string, options?: { cwd?: string; timeout?: number }): Promise<string> {
  return new Promise((resolve, reject) => {
    execCb(cmd, {
      encoding: 'utf-8',
      cwd: options?.cwd,
      timeout: options?.timeout ?? 30_000,
    }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(`Command failed: ${cmd}\n${stderr || err.message}`));
      } else {
        resolve(String(stdout ?? '').trim());
      }
    });
  });
}

export function execSilent(cmd: string): string | null {
  try {
    return exec(cmd);
  } catch {
    return null;
  }
}

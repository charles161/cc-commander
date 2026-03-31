import { execSync } from 'child_process';
import { readFileSync, existsSync, mkdirSync } from 'fs';
import { join, basename } from 'path';
import { SessionManager, Messenger } from 'cc-commander';
import type { XrayOptions, XrayReport, ArchitectFindings, CriticFindings } from './types.js';
import { generateReport } from './report.js';

const POLL_INTERVAL_MS = 5_000;
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

export function parseRepoName(repoUrl: string): string {
  // Handle: https://github.com/user/repo, github.com/user/repo, user/repo
  const cleaned = repoUrl.replace(/\.git$/, '').replace(/\/$/, '');
  const parts = cleaned.split('/');
  return parts[parts.length - 1] || 'unknown';
}

export function normalizeRepoUrl(repoUrl: string): string {
  if (repoUrl.startsWith('https://') || repoUrl.startsWith('git@')) {
    return repoUrl;
  }
  // user/repo → https://github.com/user/repo
  if (repoUrl.includes('/') && !repoUrl.includes('://')) {
    return `https://github.com/${repoUrl}`;
  }
  return repoUrl;
}

export function cloneRepo(repoUrl: string, dest: string): void {
  const url = normalizeRepoUrl(repoUrl);
  if (!existsSync(dest)) {
    mkdirSync(dest, { recursive: true });
  }
  execSync(`git clone --depth 1 "${url}" "${dest}"`, {
    encoding: 'utf-8',
    timeout: 60_000,
    stdio: 'pipe',
  });
}

export function readAgentTemplate(templateName: string): string {
  const templatePath = join(import.meta.dirname ?? __dirname, '..', 'templates', `${templateName}.md`);
  return readFileSync(templatePath, 'utf-8');
}

export function spawnAnalysisWorkers(
  sessions: SessionManager,
  messenger: Messenger,
  repoDir: string,
): { architect: string; critic: string } {
  const architectMd = readAgentTemplate('architect');
  const criticMd = readAgentTemplate('critic');

  sessions.spawn({
    name: 'xray-architect',
    workdir: repoDir,
    claudeMd: architectMd,
    permissions: 'dangerously-skip',
    task: 'Analyze this repository as an architecture expert. Follow the instructions in your CLAUDE.md. Write your findings to ARCHITECT_REPORT.md.',
  });

  sessions.spawn({
    name: 'xray-critic',
    workdir: repoDir,
    claudeMd: criticMd,
    permissions: 'dangerously-skip',
    task: 'Analyze this repository as a code quality and security expert. Follow the instructions in your CLAUDE.md. Write your findings to CRITIC_REPORT.md.',
  });

  return { architect: 'xray-architect', critic: 'xray-critic' };
}

export function waitForReport(repoDir: string, filename: string, timeoutMs: number): string {
  const filePath = join(repoDir, filename);
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (existsSync(filePath)) {
      const content = readFileSync(filePath, 'utf-8');
      if (content.trim().length > 50) {
        return content;
      }
    }
    execSync(`sleep ${POLL_INTERVAL_MS / 1000}`);
  }
  throw new Error(`Timeout waiting for ${filename} after ${timeoutMs / 1000}s`);
}

export function parseArchitectReport(raw: string): ArchitectFindings {
  const sections = parseSections(raw);
  return {
    techStack: parseList(sections['Tech Stack'] ?? ''),
    structure: sections['Project Structure'] ?? '',
    dependencies: sections['Dependencies'] ?? '',
    patterns: sections['Architecture Patterns'] ?? '',
    summary: sections['Summary'] ?? '',
    raw,
  };
}

export function parseCriticReport(raw: string): CriticFindings {
  const sections = parseSections(raw);
  return {
    bugs: parseList(sections['Bugs'] ?? ''),
    security: parseList(sections['Security Issues'] ?? ''),
    codeSmells: parseList(sections['Code Smells'] ?? ''),
    techDebt: parseList(sections['Tech Debt'] ?? ''),
    antiPatterns: parseList(sections['Anti-Patterns'] ?? ''),
    summary: sections['Summary'] ?? '',
    raw,
  };
}

function parseSections(markdown: string): Record<string, string> {
  const sections: Record<string, string> = {};
  const lines = markdown.split('\n');
  let currentSection = '';
  let currentContent: string[] = [];

  for (const line of lines) {
    const match = line.match(/^#{1,3}\s+(.+)$/);
    if (match) {
      if (currentSection) {
        sections[currentSection] = currentContent.join('\n').trim();
      }
      currentSection = match[1].trim();
      currentContent = [];
    } else {
      currentContent.push(line);
    }
  }
  if (currentSection) {
    sections[currentSection] = currentContent.join('\n').trim();
  }
  return sections;
}

function parseList(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.replace(/^[-*]\s*/, '').trim())
    .filter((line) => line.length > 0);
}

export function cleanupSessions(sessions: SessionManager): void {
  try { sessions.kill('xray-architect', true); } catch { /* ignore */ }
  try { sessions.kill('xray-critic', true); } catch { /* ignore */ }
}

export async function xray(options: XrayOptions): Promise<string> {
  const repoName = parseRepoName(options.repoUrl);
  const repoDir = `/tmp/xray-${repoName}`;
  const outputPath = options.outputPath ?? `/tmp/xray-${repoName}.html`;
  const timeout = options.timeout ?? DEFAULT_TIMEOUT_MS;

  // Step 1: Clone
  console.log(`Cloning ${options.repoUrl}...`);
  cloneRepo(options.repoUrl, repoDir);

  // Step 2: Spawn workers
  const sessions = new SessionManager();
  const messenger = new Messenger();

  console.log('Spawning architect and critic agents...');
  spawnAnalysisWorkers(sessions, messenger, repoDir);

  try {
    // Step 3: Wait for reports
    console.log('Waiting for analysis...');
    const [architectRaw, criticRaw] = await Promise.all([
      Promise.resolve(waitForReport(repoDir, 'ARCHITECT_REPORT.md', timeout)),
      Promise.resolve(waitForReport(repoDir, 'CRITIC_REPORT.md', timeout)),
    ]);

    // Step 4: Parse
    const architect = parseArchitectReport(architectRaw);
    const critic = parseCriticReport(criticRaw);

    // Step 5: Generate report
    const report: XrayReport = {
      repoName,
      repoUrl: options.repoUrl,
      analyzedAt: new Date(),
      architect,
      critic,
    };

    console.log('Generating report...');
    const html = generateReport(report);
    const { writeFileSync } = await import('fs');
    writeFileSync(outputPath, html);

    console.log(`Report saved to ${outputPath}`);
    return outputPath;
  } finally {
    cleanupSessions(sessions);
  }
}

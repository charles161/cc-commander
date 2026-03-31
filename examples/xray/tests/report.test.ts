import { describe, it, expect } from 'vitest';
import { generateReport } from '../src/report.js';
import type { XrayReport } from '../src/types.js';

function makeReport(overrides: Partial<XrayReport> = {}): XrayReport {
  return {
    repoName: 'test-repo',
    repoUrl: 'https://github.com/user/test-repo',
    analyzedAt: new Date('2026-03-31T12:00:00Z'),
    architect: {
      techStack: ['TypeScript', 'Node.js', 'React'],
      structure: 'Standard monorepo layout',
      dependencies: 'Express, Prisma, React',
      patterns: 'Clean architecture',
      summary: 'Well-structured project',
      raw: '# Architecture Report\n...',
    },
    critic: {
      bugs: ['[high] src/auth.ts:42 Missing null check'],
      security: ['[critical] Hardcoded API key in .env'],
      codeSmells: ['src/utils.ts God function'],
      techDebt: ['Deprecated crypto API usage'],
      antiPatterns: ['Callback hell in legacy code'],
      summary: 'Some issues need attention',
      raw: '# Code Quality Report\n...',
    },
    ...overrides,
  };
}

describe('generateReport()', () => {
  it('returns valid HTML document', () => {
    const html = generateReport(makeReport());
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('</html>');
  });

  it('includes the repo name in the title', () => {
    const html = generateReport(makeReport({ repoName: 'my-cool-project' }));
    expect(html).toContain('<title>X-Ray: my-cool-project</title>');
  });

  it('includes the repo name in the header', () => {
    const html = generateReport(makeReport({ repoName: 'my-cool-project' }));
    expect(html).toContain('my-cool-project');
  });

  it('includes the analysis date', () => {
    const html = generateReport(makeReport({ analyzedAt: new Date('2026-03-31T12:00:00Z') }));
    expect(html).toContain('2026-03-31');
  });

  it('includes tech stack items', () => {
    const html = generateReport(makeReport());
    expect(html).toContain('TypeScript');
    expect(html).toContain('Node.js');
    expect(html).toContain('React');
  });

  it('includes project structure', () => {
    const html = generateReport(makeReport());
    expect(html).toContain('Standard monorepo layout');
  });

  it('includes bug findings', () => {
    const html = generateReport(makeReport());
    expect(html).toContain('Missing null check');
  });

  it('includes security findings', () => {
    const html = generateReport(makeReport());
    expect(html).toContain('Hardcoded API key');
  });

  it('includes code smells', () => {
    const html = generateReport(makeReport());
    expect(html).toContain('God function');
  });

  it('includes the architecture summary', () => {
    const html = generateReport(makeReport());
    expect(html).toContain('Well-structured project');
  });

  it('includes the quality summary', () => {
    const html = generateReport(makeReport());
    expect(html).toContain('Some issues need attention');
  });

  it('renders severity badges for critical issues', () => {
    const html = generateReport(makeReport());
    expect(html).toContain('CRITICAL');
  });

  it('renders severity badges for high issues', () => {
    const html = generateReport(makeReport());
    expect(html).toContain('HIGH');
  });

  it('calculates health score', () => {
    const html = generateReport(makeReport());
    // Should contain a number in the score circle
    expect(html).toMatch(/class="score-circle"[^>]*>\s*\d+/);
  });

  it('shows health score colors: green for healthy', () => {
    const cleanReport = makeReport({
      critic: {
        bugs: [],
        security: [],
        codeSmells: [],
        techDebt: [],
        antiPatterns: [],
        summary: 'Clean',
        raw: '',
      },
    });
    const html = generateReport(cleanReport);
    // Green color for score >= 80
    expect(html).toContain('#4ade80');
  });

  it('shows health score colors: red for unhealthy', () => {
    const badReport = makeReport({
      critic: {
        bugs: Array(5).fill('bug'),
        security: Array(5).fill('[critical] sec issue'),
        codeSmells: Array(5).fill('smell'),
        techDebt: Array(5).fill('debt'),
        antiPatterns: [],
        summary: 'Bad',
        raw: '',
      },
    });
    const html = generateReport(badReport);
    // Red color for score < 50
    expect(html).toContain('#ef4444');
  });

  it('escapes HTML in user-provided content', () => {
    const html = generateReport(
      makeReport({
        repoName: '<script>alert("xss")</script>',
      }),
    );
    expect(html).not.toContain('<script>alert');
    expect(html).toContain('&lt;script&gt;');
  });

  it('shows "None found" for empty issue lists', () => {
    const cleanReport = makeReport({
      critic: {
        bugs: [],
        security: [],
        codeSmells: [],
        techDebt: [],
        antiPatterns: [],
        summary: 'Clean',
        raw: '',
      },
    });
    const html = generateReport(cleanReport);
    expect(html).toContain('None found');
  });

  it('includes inline CSS (no external stylesheets)', () => {
    const html = generateReport(makeReport());
    expect(html).toContain('<style>');
    expect(html).not.toContain('<link rel="stylesheet"');
  });

  it('includes viewport meta for mobile responsiveness', () => {
    const html = generateReport(makeReport());
    expect(html).toContain('viewport');
    expect(html).toContain('width=device-width');
  });

  it('uses dark theme colors', () => {
    const html = generateReport(makeReport());
    expect(html).toContain('--bg: #0d1117');
  });

  it('includes the CC Commander attribution link', () => {
    const html = generateReport(makeReport());
    expect(html).toContain('cc-commander');
  });

  it('includes issue count stats', () => {
    const html = generateReport(makeReport());
    // Bug count = 1, Security count = 1
    expect(html).toMatch(/class="num"[^>]*>1</);
  });
});

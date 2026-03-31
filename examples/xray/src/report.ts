import type { XrayReport } from './types.js';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderList(items: string[], emptyMsg = 'None found'): string {
  if (items.length === 0) return `<p class="empty">${escapeHtml(emptyMsg)}</p>`;
  return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('\n')}</ul>`;
}

function renderMarkdown(text: string): string {
  if (!text) return '<p class="empty">No data</p>';
  // Simple markdown rendering: paragraphs, code blocks, bold, inline code
  return text
    .split('\n\n')
    .map((block) => {
      if (block.startsWith('```')) {
        const code = block.replace(/^```\w*\n?/, '').replace(/\n?```$/, '');
        return `<pre><code>${escapeHtml(code)}</code></pre>`;
      }
      const html = escapeHtml(block)
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/`(.+?)`/g, '<code>$1</code>')
        .replace(/\n/g, '<br>');
      return `<p>${html}</p>`;
    })
    .join('\n');
}

function severityBadge(text: string): string {
  const lower = text.toLowerCase();
  if (lower.includes('critical')) return '<span class="badge critical">CRITICAL</span>';
  if (lower.includes('high')) return '<span class="badge high">HIGH</span>';
  if (lower.includes('medium')) return '<span class="badge medium">MEDIUM</span>';
  if (lower.includes('low')) return '<span class="badge low">LOW</span>';
  return '';
}

function renderIssueList(items: string[]): string {
  if (items.length === 0) return '<p class="empty">None found</p>';
  return `<div class="issues">${items
    .map((item) => {
      const badge = severityBadge(item);
      return `<div class="issue">${badge}<span>${escapeHtml(item)}</span></div>`;
    })
    .join('\n')}</div>`;
}

export function generateReport(report: XrayReport): string {
  const date = report.analyzedAt.toISOString().split('T')[0];
  const time = report.analyzedAt.toISOString().split('T')[1]?.slice(0, 5) ?? '';

  const bugCount = report.critic.bugs.length;
  const securityCount = report.critic.security.length;
  const smellCount = report.critic.codeSmells.length;
  const debtCount = report.critic.techDebt.length;
  const totalIssues = bugCount + securityCount + smellCount + debtCount;

  const healthScore = Math.max(0, 100 - totalIssues * 5 - securityCount * 10);
  const healthColor = healthScore >= 80 ? '#4ade80' : healthScore >= 50 ? '#fbbf24' : '#ef4444';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>X-Ray: ${escapeHtml(report.repoName)}</title>
<style>
  :root {
    --bg: #0d1117;
    --surface: #161b22;
    --surface2: #21262d;
    --border: #30363d;
    --text: #e6edf3;
    --text-muted: #8b949e;
    --accent: #58a6ff;
    --green: #4ade80;
    --yellow: #fbbf24;
    --red: #ef4444;
    --orange: #f97316;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
    background: var(--bg);
    color: var(--text);
    line-height: 1.6;
    padding: 0;
  }
  .container { max-width: 960px; margin: 0 auto; padding: 24px 16px; }

  /* Header */
  .header {
    background: linear-gradient(135deg, #1a1f2e 0%, #0d1117 100%);
    border-bottom: 1px solid var(--border);
    padding: 40px 0;
    text-align: center;
  }
  .header h1 {
    font-size: 2rem;
    font-weight: 700;
    margin-bottom: 8px;
  }
  .header h1 span { color: var(--accent); }
  .header .repo-name {
    font-size: 1.4rem;
    color: var(--text-muted);
    font-family: 'SF Mono', SFMono-Regular, Consolas, monospace;
  }
  .header .meta {
    margin-top: 12px;
    font-size: 0.85rem;
    color: var(--text-muted);
  }

  /* Score */
  .score-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 24px;
    margin: 24px 0;
    display: flex;
    align-items: center;
    gap: 24px;
    flex-wrap: wrap;
  }
  .score-circle {
    width: 80px; height: 80px;
    border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-size: 1.8rem; font-weight: 700;
    flex-shrink: 0;
  }
  .score-details { flex: 1; min-width: 200px; }
  .score-details h2 { font-size: 1.1rem; margin-bottom: 4px; }
  .score-details p { color: var(--text-muted); font-size: 0.9rem; }
  .stats {
    display: flex; gap: 16px; flex-wrap: wrap;
    margin-top: 12px;
  }
  .stat {
    background: var(--surface2);
    border-radius: 8px;
    padding: 8px 16px;
    text-align: center;
    min-width: 80px;
  }
  .stat .num { font-size: 1.4rem; font-weight: 700; }
  .stat .label { font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; }

  /* Sections */
  .section {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 12px;
    margin: 20px 0;
    overflow: hidden;
  }
  .section-header {
    padding: 16px 20px;
    border-bottom: 1px solid var(--border);
    display: flex; align-items: center; gap: 10px;
  }
  .section-header h2 { font-size: 1.1rem; }
  .section-header .icon { font-size: 1.2rem; }
  .section-body { padding: 20px; }
  .section-body p { color: var(--text-muted); margin-bottom: 12px; }
  .section-body ul { list-style: none; padding: 0; }
  .section-body li {
    padding: 8px 12px;
    border-left: 3px solid var(--border);
    margin-bottom: 6px;
    background: var(--surface2);
    border-radius: 0 6px 6px 0;
    font-size: 0.9rem;
  }
  .section-body pre {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 16px;
    overflow-x: auto;
    font-size: 0.85rem;
    font-family: 'SF Mono', SFMono-Regular, Consolas, monospace;
  }
  .section-body code {
    background: var(--surface2);
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 0.85em;
    font-family: 'SF Mono', SFMono-Regular, Consolas, monospace;
  }
  .section-body pre code { background: none; padding: 0; }

  /* Issues */
  .issues { display: flex; flex-direction: column; gap: 8px; }
  .issue {
    background: var(--surface2);
    border-radius: 8px;
    padding: 10px 14px;
    display: flex;
    align-items: flex-start;
    gap: 10px;
    font-size: 0.9rem;
    border-left: 3px solid var(--border);
  }
  .badge {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 0.7rem;
    font-weight: 700;
    text-transform: uppercase;
    flex-shrink: 0;
    margin-top: 2px;
  }
  .badge.critical { background: var(--red); color: #fff; }
  .badge.high { background: var(--orange); color: #fff; }
  .badge.medium { background: var(--yellow); color: #000; }
  .badge.low { background: var(--border); color: var(--text); }

  .empty { color: var(--text-muted); font-style: italic; }

  /* Summary */
  .summary-box {
    background: var(--surface2);
    border-radius: 8px;
    padding: 16px;
    margin-top: 12px;
    border-left: 3px solid var(--accent);
  }

  /* Footer */
  .footer {
    text-align: center;
    padding: 32px 0;
    color: var(--text-muted);
    font-size: 0.8rem;
  }
  .footer a { color: var(--accent); text-decoration: none; }

  @media (max-width: 640px) {
    .header h1 { font-size: 1.5rem; }
    .score-card { flex-direction: column; text-align: center; }
    .stats { justify-content: center; }
  }
</style>
</head>
<body>

<div class="header">
  <div class="container">
    <h1><span>X-Ray</span> Report</h1>
    <div class="repo-name">${escapeHtml(report.repoName)}</div>
    <div class="meta">Analyzed ${date} at ${time} UTC | Source: ${escapeHtml(report.repoUrl)}</div>
  </div>
</div>

<div class="container">

  <!-- Health Score -->
  <div class="score-card">
    <div class="score-circle" style="background: ${healthColor}20; color: ${healthColor}; border: 3px solid ${healthColor};">
      ${healthScore}
    </div>
    <div class="score-details">
      <h2>Health Score</h2>
      <p>${healthScore >= 80 ? 'This codebase looks healthy.' : healthScore >= 50 ? 'Some issues need attention.' : 'Significant issues found.'}</p>
      <div class="stats">
        <div class="stat"><div class="num" style="color: var(--red)">${bugCount}</div><div class="label">Bugs</div></div>
        <div class="stat"><div class="num" style="color: var(--orange)">${securityCount}</div><div class="label">Security</div></div>
        <div class="stat"><div class="num" style="color: var(--yellow)">${smellCount}</div><div class="label">Smells</div></div>
        <div class="stat"><div class="num" style="color: var(--text-muted)">${debtCount}</div><div class="label">Debt</div></div>
      </div>
    </div>
  </div>

  <!-- Architecture: Tech Stack -->
  <div class="section">
    <div class="section-header"><span class="icon">&#9881;</span><h2>Tech Stack</h2></div>
    <div class="section-body">
      ${renderList(report.architect.techStack, 'No tech stack detected')}
    </div>
  </div>

  <!-- Architecture: Structure -->
  <div class="section">
    <div class="section-header"><span class="icon">&#128193;</span><h2>Project Structure</h2></div>
    <div class="section-body">
      ${renderMarkdown(report.architect.structure)}
    </div>
  </div>

  <!-- Architecture: Dependencies -->
  <div class="section">
    <div class="section-header"><span class="icon">&#128230;</span><h2>Dependencies</h2></div>
    <div class="section-body">
      ${renderMarkdown(report.architect.dependencies)}
    </div>
  </div>

  <!-- Architecture: Patterns -->
  <div class="section">
    <div class="section-header"><span class="icon">&#127383;</span><h2>Architecture Patterns</h2></div>
    <div class="section-body">
      ${renderMarkdown(report.architect.patterns)}
    </div>
  </div>

  <!-- Critic: Bugs -->
  <div class="section">
    <div class="section-header"><span class="icon">&#128027;</span><h2>Bugs</h2></div>
    <div class="section-body">
      ${renderIssueList(report.critic.bugs)}
    </div>
  </div>

  <!-- Critic: Security -->
  <div class="section">
    <div class="section-header"><span class="icon">&#128274;</span><h2>Security Issues</h2></div>
    <div class="section-body">
      ${renderIssueList(report.critic.security)}
    </div>
  </div>

  <!-- Critic: Code Smells -->
  <div class="section">
    <div class="section-header"><span class="icon">&#128064;</span><h2>Code Smells</h2></div>
    <div class="section-body">
      ${renderIssueList(report.critic.codeSmells)}
    </div>
  </div>

  <!-- Critic: Tech Debt -->
  <div class="section">
    <div class="section-header"><span class="icon">&#128176;</span><h2>Tech Debt</h2></div>
    <div class="section-body">
      ${renderIssueList(report.critic.techDebt)}
    </div>
  </div>

  <!-- Summaries -->
  <div class="section">
    <div class="section-header"><span class="icon">&#128221;</span><h2>Architecture Summary</h2></div>
    <div class="section-body">
      <div class="summary-box">${renderMarkdown(report.architect.summary)}</div>
    </div>
  </div>

  <div class="section">
    <div class="section-header"><span class="icon">&#128221;</span><h2>Quality Summary</h2></div>
    <div class="section-body">
      <div class="summary-box">${renderMarkdown(report.critic.summary)}</div>
    </div>
  </div>

</div>

<div class="footer">
  Generated by <a href="https://github.com/charles161/cc-commander">CC Commander</a> X-Ray
</div>

</body>
</html>`;
}

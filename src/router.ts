import type { RouterRule, RouteResult } from './types.js';
import { SessionManager } from './session.js';

export class Router {
  private rules: RouterRule[] = [];
  private sessionManager: SessionManager;

  constructor(sessionManager: SessionManager) {
    this.sessionManager = sessionManager;
  }

  addRule(rule: RouterRule): void {
    this.rules.push({
      priority: 0,
      ...rule,
    });
    // Sort by priority descending (higher priority first)
    this.rules.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  }

  removeRule(pattern: RegExp | string): void {
    const patternStr = pattern instanceof RegExp ? pattern.source : pattern;
    this.rules = this.rules.filter((r) => {
      const ruleStr = r.pattern instanceof RegExp ? r.pattern.source : r.pattern;
      return ruleStr !== patternStr;
    });
  }

  route(task: string): RouteResult | null {
    for (const rule of this.rules) {
      const matches = rule.pattern instanceof RegExp
        ? rule.pattern.test(task)
        : task.toLowerCase().includes(rule.pattern.toLowerCase());

      if (!matches) continue;

      // Check if agent session is available
      const session = this.sessionManager.get(rule.agent);
      if (session && (session.status === 'idle' || session.status === 'working' || session.status === 'starting')) {
        const reason = rule.pattern instanceof RegExp
          ? `Matched pattern /${rule.pattern.source}/`
          : `Matched keyword "${rule.pattern}"`;
        return { agent: rule.agent, reason };
      }
    }

    return null;
  }

  listRules(): RouterRule[] {
    return [...this.rules];
  }

  clearRules(): void {
    this.rules = [];
  }
}

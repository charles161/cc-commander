import type { AgentConfig } from './types.js';

export class Registry {
  private agents = new Map<string, AgentConfig>();

  register(config: AgentConfig): AgentConfig {
    if (this.agents.has(config.name)) {
      throw new Error(`Agent "${config.name}" already registered`);
    }

    const full: AgentConfig = {
      alwaysOn: false,
      autoRestart: false,
      maxIdleMinutes: 30,
      tags: [],
      ...config,
    };

    this.agents.set(config.name, full);
    return full;
  }

  unregister(name: string): void {
    if (!this.agents.has(name)) {
      throw new Error(`Agent "${name}" not found`);
    }
    this.agents.delete(name);
  }

  get(name: string): AgentConfig | null {
    return this.agents.get(name) ?? null;
  }

  list(filter?: { tag?: string }): AgentConfig[] {
    let agents = Array.from(this.agents.values());

    if (filter?.tag) {
      agents = agents.filter((a) => a.tags?.includes(filter.tag!));
    }

    return agents;
  }

  update(name: string, partial: Partial<AgentConfig>): AgentConfig {
    const existing = this.agents.get(name);
    if (!existing) {
      throw new Error(`Agent "${name}" not found`);
    }

    const updated = { ...existing, ...partial, name: existing.name };
    this.agents.set(name, updated);
    return updated;
  }

  has(name: string): boolean {
    return this.agents.has(name);
  }

  clear(): void {
    this.agents.clear();
  }
}

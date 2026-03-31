import { vi, describe, it, expect, beforeEach } from 'vitest';
import type { AgentConfig } from '../src/types.js';

import { Registry } from '../src/registry.js';

describe('Registry', () => {
  let registry: Registry;

  beforeEach(() => {
    registry = new Registry();
  });

  // ---- register ----

  describe('register(config)', () => {
    it('registers an agent with required fields', () => {
      registry.register({ name: 'agent-alpha', workdir: '/tmp/alpha' });

      const stored = registry.get('agent-alpha');
      expect(stored).not.toBeNull();
      expect(stored?.name).toBe('agent-alpha');
      expect(stored?.workdir).toBe('/tmp/alpha');
    });

    it('throws on duplicate agent name', () => {
      registry.register({ name: 'dup', workdir: '/tmp/dup' });
      expect(() => registry.register({ name: 'dup', workdir: '/tmp/dup' })).toThrow(
        /already registered|duplicate/i,
      );
    });

    it('sets default value for alwaysOn (false)', () => {
      registry.register({ name: 'defaults', workdir: '/tmp/defaults' });
      expect(registry.get('defaults')?.alwaysOn).toBe(false);
    });

    it('sets default value for autoRestart (false)', () => {
      registry.register({ name: 'defaults2', workdir: '/tmp/defaults2' });
      // Implementation defaults autoRestart to false
      expect(registry.get('defaults2')?.autoRestart).toBe(false);
    });

    it('sets default value for tags (empty array)', () => {
      registry.register({ name: 'defaults3', workdir: '/tmp/defaults3' });
      expect(registry.get('defaults3')?.tags).toEqual([]);
    });

    it('preserves all supplied optional fields', () => {
      const config: AgentConfig = {
        name: 'full',
        displayName: 'Full Agent',
        workdir: '/tmp/full',
        claudeMd: '/tmp/full/CLAUDE.md',
        model: 'claude-opus-4-5',
        alwaysOn: true,
        autoRestart: true,
        maxIdleMinutes: 30,
        tags: ['coding', 'backend'],
      };
      registry.register(config);

      const stored = registry.get('full');
      expect(stored?.displayName).toBe('Full Agent');
      expect(stored?.model).toBe('claude-opus-4-5');
      expect(stored?.alwaysOn).toBe(true);
      expect(stored?.autoRestart).toBe(true);
      expect(stored?.maxIdleMinutes).toBe(30);
      expect(stored?.tags).toContain('coding');
      expect(stored?.tags).toContain('backend');
    });
  });

  // ---- unregister ----

  describe('unregister(name)', () => {
    it('removes a registered agent', () => {
      registry.register({ name: 'remove-me', workdir: '/tmp/rm' });
      registry.unregister('remove-me');
      expect(registry.get('remove-me')).toBeNull();
    });

    it('throws when unregistering unknown name', () => {
      expect(() => registry.unregister('ghost')).toThrow(/not found|unknown/i);
    });

    it('removes only the specified agent, leaving others intact', () => {
      registry.register({ name: 'keep', workdir: '/tmp/keep' });
      registry.register({ name: 'remove', workdir: '/tmp/remove' });

      registry.unregister('remove');

      expect(registry.get('keep')).not.toBeNull();
      expect(registry.get('remove')).toBeNull();
    });
  });

  // ---- get ----

  describe('get(name)', () => {
    it('returns the config for a registered agent', () => {
      registry.register({ name: 'found', workdir: '/tmp/found' });

      const config = registry.get('found');
      expect(config).not.toBeNull();
      expect(config?.name).toBe('found');
      expect(config?.workdir).toBe('/tmp/found');
    });

    it('returns null for an unknown name', () => {
      expect(registry.get('nobody')).toBeNull();
    });
  });

  // ---- list ----

  describe('list()', () => {
    it('returns all registered agents', () => {
      registry.register({ name: 'one', workdir: '/tmp/one' });
      registry.register({ name: 'two', workdir: '/tmp/two' });
      registry.register({ name: 'three', workdir: '/tmp/three' });

      const agents = registry.list();
      expect(agents).toHaveLength(3);
      expect(agents.map((a) => a.name)).toContain('one');
      expect(agents.map((a) => a.name)).toContain('two');
      expect(agents.map((a) => a.name)).toContain('three');
    });

    it('returns empty array when no agents registered', () => {
      expect(registry.list()).toEqual([]);
    });

    it('filters by tag', () => {
      registry.register({ name: 'backend', workdir: '/tmp/be', tags: ['server', 'api'] });
      registry.register({ name: 'frontend', workdir: '/tmp/fe', tags: ['ui', 'web'] });
      registry.register({ name: 'fullstack', workdir: '/tmp/fs', tags: ['server', 'ui'] });

      const serverAgents = registry.list({ tag: 'server' });
      expect(serverAgents).toHaveLength(2);
      expect(serverAgents.map((a) => a.name)).toContain('backend');
      expect(serverAgents.map((a) => a.name)).toContain('fullstack');

      const uiAgents = registry.list({ tag: 'ui' });
      expect(uiAgents).toHaveLength(2);
      expect(uiAgents.map((a) => a.name)).toContain('frontend');
      expect(uiAgents.map((a) => a.name)).toContain('fullstack');
    });

    it('returns all agents when no filter given', () => {
      registry.register({ name: 'a', workdir: '/tmp/a', tags: ['x'] });
      registry.register({ name: 'b', workdir: '/tmp/b', tags: ['y'] });
      expect(registry.list()).toHaveLength(2);
    });

    it('returns zero agents when tag filter matches none', () => {
      registry.register({ name: 'only', workdir: '/tmp/only', tags: ['alpha'] });
      expect(registry.list({ tag: 'nonexistent' })).toHaveLength(0);
    });
  });

  // ---- update ----

  describe('update(name, partial)', () => {
    it('updates specific fields without replacing the whole config', () => {
      registry.register({ name: 'updatable', workdir: '/tmp/orig', tags: ['old-tag'], alwaysOn: false });

      registry.update('updatable', { alwaysOn: true, tags: ['new-tag'] });

      const updated = registry.get('updatable');
      expect(updated?.alwaysOn).toBe(true);
      expect(updated?.tags).toContain('new-tag');
      // workdir unchanged
      expect(updated?.workdir).toBe('/tmp/orig');
    });

    it('throws when updating unknown agent', () => {
      expect(() => registry.update('nobody', { alwaysOn: true })).toThrow(/not found|unknown/i);
    });

    it('preserves the name field even if update tries to change it', () => {
      registry.register({ name: 'locked', workdir: '/tmp/locked' });

      registry.update('locked', { name: 'renamed' } as Partial<AgentConfig>);

      // Must still be accessible under original name
      expect(registry.get('locked')).not.toBeNull();
      expect(registry.get('locked')?.name).toBe('locked');
    });
  });
});

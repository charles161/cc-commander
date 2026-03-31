export type SessionStatus = 'starting' | 'idle' | 'working' | 'stuck' | 'crashed' | 'dead' | 'unknown';

export interface SessionInfo {
  name: string;
  pid: number | null;
  status: SessionStatus;
  tmuxSession: string;
  workdir: string;
  claudeMd: string | null;
  sessionId: string | null;
  createdAt: Date;
  lastActivity: Date | null;
}

export interface SpawnOptions {
  name: string;
  workdir: string;
  claudeMd?: string;
  task?: string;
  model?: string;
  permissions?: 'default' | 'dangerously-skip';
  resume?: boolean;
  sessionId?: string;
  env?: Record<string, string>;
}

export interface SendOptions {
  timeout?: number;
  waitForResponse?: boolean;
}

export interface SendResult {
  delivered: boolean;
  response: string | null;
  timedOut: boolean;
}

export interface HealthStatus {
  name: string;
  status: SessionStatus;
  tmuxAlive: boolean;
  claudeRunning: boolean;
  lastActivity: Date | null;
  idleMinutes: number;
}

export interface HealthCheckResult {
  healthy: SessionInfo[];
  unhealthy: SessionInfo[];
  recovered: string[];
  failed: string[];
}

export interface AgentConfig {
  name: string;
  displayName?: string;
  workdir: string;
  claudeMd?: string;
  model?: string;
  alwaysOn?: boolean;
  autoRestart?: boolean;
  maxIdleMinutes?: number;
  tags?: string[];
}

export interface RouterRule {
  pattern: RegExp | string;
  agent: string;
  priority?: number;
}

export interface RouteResult {
  agent: string;
  reason: string;
}

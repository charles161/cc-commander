# CC Orchestrator — Product Specification

**One Claude Code session to rule them all.**

*A product that lets one Claude Code session control and coordinate multiple other CC sessions. Single entry point. Pass messages between sessions, send same task to different sessions, prime them with agents/skills, monitor progress, deliver any task.*

---

## Table of Contents

1. [WHY — The Problem](#why)
2. [Competitive Landscape](#competitive-landscape)
3. [WHAT — Core Product](#what)
4. [HOW — Technical Approach](#how)
5. [WHO — Target Users](#who)
6. [Appendix A: Existing Prototype Analysis](#appendix-a)
7. [Appendix B: Competitor Deep Dives](#appendix-b)

---

## WHY — The Problem {#why}

### The Single-Session Ceiling

Claude Code is the most capable AI coding agent available. But it has a hard ceiling: **one context window, one task, one repo at a time.** The moment you need to:

- Work on frontend and backend simultaneously
- Run a long research task while fixing a bug
- Manage a fleet of specialized AI assistants
- Scale coding work beyond what one agent can do in one session

...you're either waiting or manually wiring together multiple sessions with tmux, scripts, and duct tape.

### Why Now?

**1. Claude Code is now the dominant AI coding tool.** With Claude Max ($200/mo unlimited), thousands of developers run CC sessions daily. Power users are already hitting the single-session ceiling.

**2. The ecosystem is exploding.** In March 2026 alone, at least 8 significant multi-agent CC orchestration projects launched (Conductor, Cook, CAS, Cline Kanban, Composio AO, Repowire, amux, ccswarm). This is the "build-your-own-infra" phase — everyone solves the same problems differently, poorly, and incompatibly.

**3. Anthropic is shipping primitives, not solutions.** Agent Teams (experimental), Subagents, Hooks, Git Worktrees, and the Agent SDK are all available — but composing them into a reliable multi-session system is left as an exercise. The official sweet spot is "3-5 teammates" in a single session — not 16 long-running persistent agents.

**4. We already proved the concept.** Our CC-Claw system runs 16 agents 24/7 across tmux sessions with Telegram interfaces, crash recovery, memory systems, and human oversight. It works. But it's held together by 25+ bash scripts, hardcoded paths, and tribal knowledge.

### The Core Problem Statement

> There is no reliable, general-purpose way to make one Claude Code session control and coordinate multiple other Claude Code sessions — with proper lifecycle management, message passing, health monitoring, and task orchestration.

Everyone in this space is solving 3-5 of these sub-problems. Nobody has solved all of them as a cohesive product.

### Sub-Problems

| Problem | What it means | Who suffers |
|---------|---------------|-------------|
| **Session lifecycle** | Creating, destroying, resuming, and recovering CC sessions programmatically | Anyone running >2 sessions |
| **Message passing** | Injecting prompts into a session and getting structured responses back | Anyone coordinating agents |
| **State & identity** | Agents need persistent memory, personality, and specialization across restarts | Anyone building AI assistants |
| **Health monitoring** | Detecting crashes, hangs, context exhaustion, and auto-recovering | Anyone running agents unattended |
| **Task routing** | Sending the right task to the right agent at the right time | Anyone with >3 agents |
| **Isolation** | Preventing agents from conflicting on files, ports, or resources | Anyone with parallel work |
| **Human oversight** | Monitoring, approving, and steering multiple agents from one place | Everyone |

---

## Competitive Landscape {#competitive-landscape}

### Market Map

```
                          SCOPE
                Single-Session  ←→  Multi-Session
                    │                     │
    In-Process ─────┤  OMC               │
    (skills/hooks)  │  claude-octopus    │
                    │  metaswarm         │
                    │                     │
    CLI/DSL ────────┤                    │  Cook
    (workflow)      │                    │  
                    │                     │
    GUI/App ────────┤                    │  Conductor
    (dashboard)     │                    │  Cline Kanban
                    │                    │  Composio AO
                    │                     │
    Infrastructure ─┤                    │  CAS
    (plumbing)      │                    │  amux
                    │                    │  Repowire
                    │                    │  CC-Claw (us)
                    │                    │  claude_code_agent_farm
```

### Competitor Summary

| Competitor | Approach | Stars | Key Strength | Key Gap |
|------------|----------|-------|-------------|---------|
| **Conductor** | Mac app, worktree-per-agent | Private | UX polish, checkpoints, GitHub-native | Mac-only, no persistent agents, no agent-to-agent comms |
| **Composio AO** | Plugin architecture, dashboard | 5.6K | 8 swappable slots (runtime/agent/workspace/tracker), CI auto-fix | Platform lock-in, complex setup, enterprise-focused |
| **Cook** | CLI DSL, composable operators | 351 | Elegant `review v3 pick` pipeline, Docker sandbox | Ephemeral only — no persistent agents, no identity |
| **CAS** | Rust infra, SQLite MQ | 68 | Verification gates, lease-based task claiming, 4-tier memory | 235K lines of Rust — heavy, early, niche |
| **Cline Kanban** | Web kanban board | New | Visual task management, dependency chains | Thin orchestration — visual layer, not infrastructure |
| **Repowire** | P2P mesh, WebSocket daemon | 32 | Synchronous agent-to-agent queries (`ask_peer`) | Early stage, 5-10 agents max, single-machine only |
| **OMC** | In-session skills/hooks | 858 | 19 agents, 32 skills, deep CC integration | Single-session — no true multi-process orchestration |
| **amux** | SQLite kanban, REST API | Active | Auto-compact at 20% context, xterm.js WebUI | DIY, tmux-dependent |
| **Agent Teams** | Anthropic official (experimental) | N/A | Native CC support, shared task list, mailbox | No resume, one team/session, all same model, 3-5 max |
| **CC-Claw** (us) | tmux + bridges + scripts | N/A | 16 agents running 24/7, crash recovery, persistent memory | Bash scripts, hardcoded, not distributable |

### What Nobody Has Built

Looking across all competitors, **no one has built a product that combines:**

1. **Persistent identity** — agents that survive restarts with memory and personality
2. **True multi-session** — independent CC processes, not in-session subagents
3. **Bidirectional communication** — not just fire-and-forget injection
4. **Health monitoring + auto-recovery** — graduated escalation, not just restart
5. **External interfaces** — Telegram/Slack/API access to individual agents
6. **Human oversight** — a single pane to see and control everything
7. **Open and distributable** — not tied to one user's VPC

We have 1-6 working. We need to make it 7.

---

## WHAT — Core Product {#what}

### Vision

**CC Orchestrator is the missing control plane for Claude Code.** It sits between a human (or a lead CC session) and N worker CC sessions, providing reliable session management, message passing, health monitoring, and task orchestration.

Think of it as **Kubernetes for Claude Code sessions** — but with the simplicity of **PM2 for Node.js**.

### Design Principles

1. **CC-native.** Leverage Claude Code's own primitives (--resume, worktrees, hooks, MCP, Agent SDK) rather than fighting them.
2. **Operational-first.** Reliability > features. Crash recovery, health checks, and graceful degradation are not add-ons — they're the core product.
3. **Progressive complexity.** `cc-orch spawn "fix the tests"` should work with zero config. Persistent agents, registries, and team workflows are opt-in.
4. **Open and composable.** MIT. Works on Linux/Mac. Pluggable transports (tmux, Docker, SSH). Pluggable interfaces (Telegram, Slack, HTTP, CLI).

### Core Feature Set

#### Tier 0: Session Control (Day 1)

The minimum viable orchestrator — **programmatic control of CC sessions.**

| Feature | Description |
|---------|-------------|
| `spawn` | Create a new CC session with a task, model, and working directory. Returns a session handle. |
| `send` | Inject a message into a running session. Waits for response (with timeout). Returns structured result. |
| `status` | Get session state: running/idle/crashed/dead. Context usage %. Last activity. |
| `resume` | Resume a session from its latest checkpoint. |
| `kill` | Gracefully stop a session (Ctrl-C → SIGHUP → SIGKILL). |
| `list` | Show all managed sessions with health status. |

**What makes this better than raw tmux:**
- `send` returns the *response*, not just "message injected" (bidirectional)
- `status` detects TUI state (prompt vs processing vs stuck)
- `resume` automatically finds the right session file
- Graduated kill (not just SIGKILL)

#### Tier 1: Agent Registry & Identity

Persistent agents with names, roles, and memory.

| Feature | Description |
|---------|-------------|
| `agent create` | Define a named agent with: CLAUDE.md, model, working directory, always-on flag, interfaces |
| `agent destroy` | Tear down agent: kill session, archive memory, deregister |
| `agent prime` | Inject instructions/skills/context into an agent before it starts |
| `agent memory` | Read/write agent's persistent memory (survives restarts) |
| Registry | Central `agents.json` (or SQLite) with all agent metadata |

**agents.json schema:**
```json
{
  "name": "finn",
  "display_name": "Finn — Personal Finance Analyst",
  "model": "claude-opus-4-6[1m]",
  "workdir": "/home/user/agents/finn",
  "always_on": false,
  "interfaces": ["telegram:@finn_bot"],
  "claude_md": "/home/user/agents/finn/CLAUDE.md",
  "memory_dir": "/home/user/agents/finn/memory/",
  "health": {
    "max_idle_minutes": 30,
    "auto_restart": true,
    "escalation_levels": 4
  }
}
```

#### Tier 2: Health & Recovery

The system stays alive without human intervention.

| Feature | Description |
|---------|-------------|
| Watchdog | Periodic health check on all managed sessions. Configurable interval. |
| Escalation | 4-level recovery: clear input → compact → resume → fresh start. Cooldowns prevent thrashing. |
| Crash markers | Write crash state (last task, context summary) for post-recovery awareness. |
| Alerts | Notify on crash/recovery via configured channels (Telegram, Slack, webhook). |
| Context monitoring | Track context usage %. Auto-compact before exhaustion. |
| Idle reaping | Kill sessions that have been idle beyond threshold (on-demand agents only). |

#### Tier 3: Task Orchestration

Route work across agents intelligently.

| Feature | Description |
|---------|-------------|
| `task submit` | Submit a task to a specific agent or let the orchestrator route it. |
| `task broadcast` | Send the same task to N agents, collect responses (fan-out/fan-in). |
| `task race` | Run N agents on the same task in parallel, pick the best result. |
| `task pipeline` | Chain agents: output of agent A feeds into agent B. |
| `task review` | Work → reviewer → gate (iterate or accept). Configurable max iterations. |
| Task queue | FIFO per-agent with priority levels. Process when agent becomes idle. |
| Dependencies | Task B blocks until Task A completes. DAG-based execution. |

#### Tier 4: Interfaces & Integrations

Connect agents to the outside world.

| Feature | Description |
|---------|-------------|
| Telegram bridge | Per-agent Telegram bot. Messages → agent. Responses → user. |
| HTTP API | REST/WebSocket API for programmatic access. |
| CLI | `cc-orch` command-line tool for all operations. |
| Dashboard | Web UI showing all agents, tasks, health, and logs. |
| MCP server | Expose orchestrator capabilities as MCP tools (so a CC session can orchestrate others). |
| Hooks | CC hooks for lifecycle events (on-stop, on-crash, on-task-complete). |

### Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    CC ORCHESTRATOR                        │
│                                                          │
│  ┌──────────┐  ┌───────────┐  ┌──────────────────────┐  │
│  │ Registry │  │ Scheduler │  │ Health Monitor       │  │
│  │          │  │           │  │ (watchdog + alerting) │  │
│  └────┬─────┘  └─────┬─────┘  └──────────┬───────────┘  │
│       │              │                     │              │
│  ┌────┴──────────────┴─────────────────────┴──────────┐  │
│  │              Session Manager                        │  │
│  │  (spawn, send, receive, resume, kill, status)       │  │
│  └────────────┬───────────────┬───────────────────────┘  │
│               │               │                          │
│  ┌────────────┴───┐  ┌───────┴────────┐                 │
│  │ tmux Runtime   │  │ Docker Runtime │  (pluggable)    │
│  └────────────────┘  └────────────────┘                 │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │              Interface Layer                       │   │
│  │  Telegram │ HTTP API │ CLI │ Dashboard │ MCP      │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
          │           │           │           │
    ┌─────┴───┐ ┌─────┴───┐ ┌─────┴───┐ ┌─────┴───┐
    │ Agent 1 │ │ Agent 2 │ │ Agent 3 │ │ Agent N │
    │ (CC)    │ │ (CC)    │ │ (CC)    │ │ (CC)    │
    └─────────┘ └─────────┘ └─────────┘ └─────────┘
```

### Key Differentiators

| Us | Conductor | Cook | Composio AO | CAS |
|----|-----------|------|-------------|-----|
| **Persistent agents** with identity + memory | Ephemeral workspaces | Ephemeral workflows | Agent-agnostic (no identity) | Memory tiers but no personality |
| **Graduated crash recovery** (4-level escalation) | Kill and restart | No recovery | Basic restart | Lease-based heartbeat |
| **External interfaces** (Telegram, HTTP, MCP) | In-app only | CLI only | Dashboard only | TUI only |
| **Bidirectional messaging** with response capture | N/A | Fire-and-forget between stages | Async event-based | SQLite message queue |
| **Linux + Mac**, headless-first | Mac only | Mac + Linux | Mac + Linux | Mac + Linux |
| **Battle-tested** — 16 agents running 24/7 for 2+ months | New product | New project | New product | New project |
| **Composable CLI** — simple spawn → complex pipelines | GUI-only workflow | DSL-only workflow | Config-driven | Rust CLI |

---

## HOW — Technical Approach {#how}

### What We Build vs Reuse

| Component | Build or Reuse | Source |
|-----------|---------------|--------|
| Session manager (spawn/send/kill/status) | **Build** | Evolve from claude-spawn.sh / claude-msg.sh |
| Response capture (bidirectional send) | **Build** | New — use hooks or pane-capture with completion detection |
| Agent registry | **Evolve** | agents.json → proper typed config with validation |
| Watchdog + escalation | **Evolve** | universal-watchdog.sh + bot.py escalation → unified module |
| Telegram bridge | **Evolve** | bot.py → reusable bridge library |
| CLI (`cc-orch`) | **Build** | New CLI tool |
| HTTP API | **Build** | New REST/WebSocket server |
| Dashboard | **Build later** | Not day-1. Start with CLI + Telegram. |
| MCP server | **Build** | Expose orchestrator as MCP tools for CC-to-CC control |
| Task queue | **Build** | Evolve from /tmp/cc-queue prototype |
| Cook-style DSL | **Reuse** | Import Cook's operators as composable primitives |
| Git worktree isolation | **Reuse** | CC's native `--worktree` + our claude-spawn.sh pattern |
| Crash recovery | **Evolve** | Merge watchdog + bridge escalation into single system |

### Technology Stack

```
Language:     TypeScript (aligns with CC ecosystem, Cook, OMC)
Runtime:      Node.js 22+ (CC itself runs on Node)
CLI:          Commander.js or Yargs
API:          Fastify + WebSocket
Process mgmt: tmux (primary) | Docker (optional) | SSH (future)
State:        SQLite (agent registry, task queue, health history)
Config:       YAML/JSON agent definitions
Bridge:       python-telegram-bot (existing) or Node telegram-bot-api
Dashboard:    React + Vite (deferred)
```

**Why TypeScript over Rust/Go/Python:**
- CC itself is TypeScript/Node — native interop with hooks, MCP, SDK
- Cook (351 stars) is TypeScript — community alignment
- OMC is TypeScript — can share agents/skills
- Composio AO is TypeScript — ecosystem standard
- CAS chose Rust (235K lines) — instructive counterexample of over-engineering

### Session Manager: The Core

The session manager is the heart of the product. It must solve the hardest problem: **reliable bidirectional communication with a Claude Code TUI session.**

**Current approach (tmux buffer injection):**
```bash
# Send
tmux load-buffer -b msg "$TMP"
tmux paste-buffer -b msg -t "$SESSION" -d
tmux send-keys -t "$SESSION" Enter

# Problem: fire-and-forget. No response capture.
```

**New approach (hook-based response capture):**
```
1. Register a PostToolUse hook on the target session
2. Inject message via tmux buffer (existing method)
3. Hook fires on each tool use, streams partial results
4. Register a Stop hook that captures the final response
5. Write response to a known file path (e.g., /tmp/cc-orch/{session}/response.json)
6. Orchestrator polls/watches for the response file
7. Return structured response to caller
```

**Alternative approach (Agent SDK):**
```typescript
import { query, ClaudeAgentOptions } from '@anthropic-ai/claude-agent-sdk';

// Programmatic session — no TUI, no tmux
const response = await query({
  prompt: task,
  options: {
    allowedTools: ["Read", "Write", "Edit", "Bash", "Glob", "Grep"],
    cwd: agentWorkDir,
    model: agentModel,
    sessionId: agentSessionId, // resume existing session
  }
});
```

**Recommendation: Hybrid approach.**
- Use **Agent SDK** for new ephemeral workers (clean, programmatic, no TUI dependency)
- Use **tmux + hooks** for persistent long-running agents (Telegram bots, always-on services)
- Abstract both behind a unified `SessionManager` interface

### Response Capture Deep Dive

The biggest unsolved problem in the space. Options:

| Method | Latency | Reliability | Complexity |
|--------|---------|-------------|------------|
| tmux capture-pane polling | ~1s | Fragile (ANSI stripping) | Low |
| CC Stop hook → file write | ~0s | Good (official mechanism) | Medium |
| Agent SDK programmatic | ~0s | Best (native API) | Low |
| MCP tool callback | ~0s | Good | Medium |
| WebSocket via CC channels | ~0s | Good | Medium |

**Primary: Agent SDK for workers. Stop hook for persistent agents.**

### Agent Lifecycle

```
                ┌──────────┐
                │  DEFINED │ (in registry, not running)
                └────┬─────┘
                     │ start / spawn
                ┌────▼─────┐
                │ STARTING │ (CC process launching)
                └────┬─────┘
                     │ ready (prompt detected)
                ┌────▼─────┐
         ┌──────│  IDLE    │◄─────────┐
         │      └────┬─────┘          │
         │           │ task assigned   │ task complete
         │      ┌────▼─────┐          │
         │      │ WORKING  ├──────────┘
         │      └────┬─────┘
         │           │ context >90%
         │      ┌────▼─────┐
         │      │COMPACTING│ (auto /compact)
         │      └────┬─────┘
         │           │
         │      ┌────▼─────┐
         │      │  IDLE    │
         │      └──────────┘
         │
         │ crash detected
    ┌────▼──────┐
    │ RECOVERING│ (escalation L0→L3)
    └────┬──────┘
         │ recovery success
         │──────────────► IDLE
         │ recovery failed
    ┌────▼──────┐
    │   DEAD    │ (alert sent, human intervention needed)
    └───────────┘
```

### Phased Rollout

**Phase 1: Core (Weeks 1-2)** — Ship what we know works, properly packaged.

- `cc-orch` CLI: spawn, send, status, kill, resume, list
- Agent registry (YAML config files → SQLite)
- Health watchdog with 4-level escalation
- tmux runtime (primary)
- Telegram bridge (one-to-one agent-bot mapping)
- `npm install -g cc-orchestrator`

**Phase 2: Intelligence (Weeks 3-4)** — Make it smart.

- Response capture (hook-based + SDK-based)
- Task queue with priorities and dependencies
- Agent SDK integration for ephemeral workers
- Context monitoring + auto-compact
- MCP server (so CC sessions can orchestrate via tools)

**Phase 3: Workflows (Weeks 5-6)** — Make it powerful.

- Fan-out/fan-in (broadcast + race)
- Review gates (work → review → iterate)
- Pipeline composition (chain agents)
- Cook-style DSL integration
- Dashboard (web UI)

**Phase 4: Open Source (Week 7+)** — Make it distributable.

- Documentation + tutorials
- Docker runtime plugin
- GitHub Actions integration
- Plugin system for custom runtimes/interfaces
- Community agents/skills marketplace

### Data Model

```sql
-- Core tables
CREATE TABLE agents (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  display_name TEXT,
  model TEXT DEFAULT 'claude-opus-4-6[1m]',
  workdir TEXT NOT NULL,
  claude_md_path TEXT,
  memory_dir TEXT,
  always_on BOOLEAN DEFAULT FALSE,
  status TEXT DEFAULT 'defined', -- defined|starting|idle|working|recovering|dead
  session_type TEXT DEFAULT 'tmux', -- tmux|sdk|docker
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE interfaces (
  id TEXT PRIMARY KEY,
  agent_id TEXT REFERENCES agents(id),
  type TEXT NOT NULL, -- telegram|http|mcp|slack
  config JSON NOT NULL, -- {"token": "...", "chat_id": "..."}
  active BOOLEAN DEFAULT TRUE
);

CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  agent_id TEXT REFERENCES agents(id),
  prompt TEXT NOT NULL,
  priority INTEGER DEFAULT 1, -- 0=P0, 1=P1, 2=P2
  status TEXT DEFAULT 'pending', -- pending|running|completed|failed|cancelled
  result TEXT,
  depends_on JSON, -- ["task_id_1", "task_id_2"]
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  started_at DATETIME,
  completed_at DATETIME
);

CREATE TABLE health_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id TEXT REFERENCES agents(id),
  event_type TEXT NOT NULL, -- crash|recovery|compact|alert|restart
  escalation_level INTEGER,
  details JSON,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_agent TEXT,
  to_agent TEXT REFERENCES agents(id),
  content TEXT NOT NULL,
  response TEXT,
  status TEXT DEFAULT 'pending', -- pending|delivered|responded|timeout
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  responded_at DATETIME
);
```

### CLI Design

```bash
# Session control
cc-orch spawn --name worker1 --task "Fix the tests" --workdir ./myproject
cc-orch send finn "What's my net worth?"
cc-orch status                          # All agents
cc-orch status finn                     # Specific agent
cc-orch kill worker1
cc-orch resume finn

# Agent management
cc-orch agent create --name finn --model opus --workdir ./agents/finn --claude-md ./finn.md
cc-orch agent create --name reviewer --model sonnet --template code-reviewer
cc-orch agent destroy old-worker
cc-orch agent list
cc-orch agent prime finn --skill financial-analysis

# Task orchestration
cc-orch task submit finn "Analyze Q1 expenses"
cc-orch task broadcast "Review this PR" --agents reviewer1,reviewer2,reviewer3
cc-orch task race "Implement the login page" --count 3 --pick "least code"
cc-orch task pipeline "Write specs" --then "Implement" --then "Test" --then "Review"

# Interfaces
cc-orch bridge telegram --agent finn --token BOT_TOKEN
cc-orch bridge http --port 3000
cc-orch bridge mcp --agent orchestrator

# Operations
cc-orch health                          # Health check all agents
cc-orch logs finn --tail 50
cc-orch compact finn                    # Force context compaction
```

---

## WHO — Target Users {#who}

### User Segments

**Segment 1: Us (Charles + CC-Claw)** — Dogfood first.
- 16 agents, Telegram bots, 24/7 operation
- Migrate from bash scripts to cc-orch
- Validate every feature against real production usage

**Segment 2: Power Users** — Claude Max subscribers running 3+ sessions.
- Developers who already use tmux to manage multiple CC sessions
- People who've tried Cook, Conductor, or CAS and hit limitations
- The "Boris Cherny pattern" — running 10-15 parallel sessions

**Segment 3: AI-First Teams** — Small teams (2-5 devs) sharing CC agents.
- Need shared agent registry, task routing, and visibility
- Currently using Conductor or building custom infra
- Want persistent specialized agents (reviewer, security, testing)

**Segment 4: Platform Builders** — Building products on top of CC.
- Need programmatic API, not TUI
- Building SaaS products that embed CC capabilities
- The Composio/Agent SDK crowd, but wanting higher-level orchestration

### Go-To-Market

1. **Open-source from day 1** — MIT license, public repo, `npm install -g cc-orchestrator`
2. **"Works in 5 minutes" onboarding** — `cc-orch init` scans for existing CC sessions and offers to manage them
3. **Migration guide from scripts** — show how each existing bash script maps to cc-orch
4. **Write the Cook/Conductor comparison** — position as "Conductor for Linux" and "Cook + persistence"
5. **Ship a compelling demo** — video of 5 agents working in parallel, visible in terminal, with Telegram control
6. **HN launch** — Cook got 307 points. We have a better story (battle-tested, 16 agents, 2 months of operation)

---

## Appendix A: Existing Prototype Analysis {#appendix-a}

### Current System Architecture

Our CC-Claw system manages 16 agents across these components:

| Component | Implementation | Lines | Key Pattern |
|-----------|---------------|-------|-------------|
| Session spawn | `claude-spawn.sh` | 85 | Git worktree + tmux + TASK.md |
| Message passing | `claude-msg.sh` | 36 | tmux load-buffer + paste-buffer |
| Status monitoring | `claude-status.sh` | 34 | Status file polling + pane capture |
| Crash recovery | `claude-restart.sh` | 261 | Hardcoded registry + session ID detection |
| Watchdog | `universal-watchdog.sh` | ~150 | */2 cron, crash markers, Telegram alerts |
| Agent creation | `create-agent.sh` | 179 | BotFather → agents.json → PM2 → tmux |
| Telegram bridge | `bot.py` | 500+ | python-telegram-bot, 4-level escalation |
| Agent registry | `agents.json` | ~200 | JSON, manual maintenance |
| Idle reaping | `idle-reaper.sh` | 50 | Pane activity timeout + prompt detection |
| Message queue | `/tmp/cc-queue/` prototype | ~100 | FIFO + reaction tracking |

**Total infrastructure:** ~25 shell scripts, ~3,750 lines of orchestration code.

### What Works Well

1. **Graduated escalation** — 4-level recovery (clear → compact → resume → fresh) catches 95%+ of issues without human intervention.
2. **Session persistence** — `--resume` with largest .jsonl file reliably restores agent context.
3. **Telegram as interface** — Mobile-accessible, async, notification-native. Better than any dashboard for a single operator.
4. **agents.json registry** — Single source of truth for all agent config. Simple, effective.
5. **PM2 for bridges** — Reliable process management for the bridge layer.
6. **tmux buffer injection** — Works reliably for message input. The load-buffer → paste-buffer pattern handles special characters.

### What Needs Fixing

1. **Fire-and-forget messaging** — `claude-msg.sh` injects but never gets a response back. The brain can't programmatically know what an agent replied.
2. **Hardcoded paths everywhere** — `/home/clover_mj/` appears in every script. Not portable.
3. **No response capture** — The only way to know what an agent said is to read it on Telegram. No programmatic access.
4. **Polling-based status** — Status files + tmux pane capture. No push notifications.
5. **Race conditions** — Concurrent message injection can jumble. No queue or serialization.
6. **Manual agent creation** — Despite `create-agent.sh`, still requires editing multiple files.
7. **No task queue** — Messages are injected immediately, even if agent is busy. Queue prototype exists but isn't integrated.
8. **Context exhaustion** — No proactive monitoring. Agents sometimes hit context limits before auto-compact kicks in.
9. **Dual registries** — `agents.json` (bridges) and `claude-restart.sh` (hardcoded arrays) can drift apart.
10. **No inter-agent communication** — Agents can only talk to brain, not to each other. The inbox system (`/home/clover_mj/inbox/`) is a workaround.

### Migration Path

Every existing component maps to a cc-orch equivalent:

| Current | cc-orch |
|---------|---------|
| `claude-spawn.sh` | `cc-orch spawn` |
| `claude-msg.sh` | `cc-orch send` |
| `claude-status.sh` | `cc-orch status` |
| `claude-restart.sh` | `cc-orch resume` + watchdog |
| `universal-watchdog.sh` | `cc-orch health` daemon |
| `create-agent.sh` | `cc-orch agent create` |
| `bot.py` bridge | `cc-orch bridge telegram` |
| `agents.json` | `cc-orch agent list` (SQLite) |
| `idle-reaper.sh` | `cc-orch` idle reap config |
| `tg-send.sh` | Interface layer |

---

## Appendix B: Competitor Deep Dives {#appendix-b}

### Conductor (conductor.build)

**What it is:** A native Mac app that wraps Claude Code and Codex in a polished GUI with worktree management, per-turn checkpoints, and GitHub integration.

**Key facts:**
- $2.8M seed from Ilya Sukhar (Matrix, Parse founder) and Alexandr Wang (Scale AI)
- Built by the Melty team (YC S24 AI code editor)
- Free, plans to monetize team collaboration features
- Ships pinned CC/Codex binaries — users must not update independently
- City-named workspaces (~/conductor/tokyo/)

**Architecture:** Each workspace is a git worktree. Conductor injects hooks that commit working state before each agent turn (checkpoint system). System prompts customize CC behavior per workspace. Supports Claude Code + Codex + OpenRouter + Bedrock + Vertex.

**Key features:** Checkpoints (per-turn undo), inline diff commenting synced to GitHub, one-click PR creation, todos as merge gates, slash commands, MCP support, Linear deeplink integration, Spotlight testing (sync worktree changes to repo root for hot-reload).

**Limitations:** Mac only. No sandboxing. No persistent agents. No agent-to-agent communication. No headless mode. Setup overhead for complex repos (each worktree re-runs install scripts). No API access.

**What we can learn:** Checkpoint system is genuinely useful — per-turn snapshots stored outside git history. Their UX focus is a moat. The "Todos as merge gate" pattern is worth stealing.

---

### Composio Agent Orchestrator

**What it is:** A plugin-based orchestration system for managing fleets of AI coding agents. Part of Composio ($29M funded, 27.6K stars).

**Key facts:**
- 5.6K stars, MIT, TypeScript, 530 commits, 33 releases
- Latest: @composio/ao-cli@0.2.2 (March 29, 2026)
- 8 swappable plugin slots (runtime, agent, workspace, tracker, notifier, terminal)

**Architecture:**
```
npm install -g @composio/ao
ao start https://github.com/your-org/your-repo
# Dashboard at localhost:3000
```
Orchestrator spawns worker agents per issue in isolated git worktrees. Agents read code, write tests, create PRs. CI failures and review comments auto-route back to managing agent. Supports Claude Code, Codex, Aider, OpenCode. Runtimes: tmux, Docker, k8s.

**Limitations:** Enterprise-focused, complex setup, tool code not inspectable, narrow scope (tool calls only), no per-agent identity or persistent memory.

---

### Cook

**What it is:** A CLI for orchestrating multiple Claude Code/Codex instances using a composable DSL. 351 stars, 307 HN points.

**Key insight:** Cook's magic is its left-to-right pipeline composition. Three token types: **Work** (a prompt), **Loop operators** (xN, review, ralph), **Composition operators** (vN/race, vs, pick/merge/compare). These compose: `cook "task" review v3 pick` = race 3 branches each running work→review, then pick best.

**Key features:** Docker sandbox, rate-limit auto-retry, `/cook` skill for CC, per-step model config, COOK.md project file.

**Limitations:** Ephemeral only (no persistent agents), no identity/memory, no inter-agent communication during runs, no response streaming, merge conflict handling unclear.

**What we can learn:** The DSL is elegant. We should support Cook-style composition as a cc-orch feature or integrate Cook directly.

---

### CAS (Coding Agent System)

**What it is:** A Rust-based orchestration infrastructure. 235K lines, 17 crates, 68 stars.

**Key insight:** CAS treats agent coordination as a distributed systems problem. Lease-based task claiming (like etcd leases), SQLite message queue, verification gates that prevent "done" claims on incomplete work, 4-tier memory inspired by MemGPT, TUI with session recording/playback.

**Limitations:** Heavy (235K lines of Rust for orchestration is over-engineering), early, niche. Impressive engineering but unclear product focus.

**What we can learn:** Verification gates (demo statements describing observable outcomes) are a great pattern. Lease-based task claiming solves the stale-task problem we've seen.

---

### Cline Kanban

**What it is:** A web-based kanban board for visualizing and managing parallel AI agent tasks. From the Cline team.

**Key facts:** Free, open-source, `npm i -g cline`, web app at localhost. Each task card gets its own terminal and isolated worktree. Supports Claude Code, Codex, Cline CLI.

**Limitations:** Thin orchestration layer — visual management, not infrastructure. No health monitoring, no crash recovery, no persistent agents, no inter-agent communication. More of a complement to an orchestrator than a replacement.

---

### Repowire

**What it is:** A mesh network enabling real-time communication between Claude Code sessions across repositories. 32 stars, Python, MIT.

**Key insight:** Repowire is the only project focused on **synchronous agent-to-agent communication.** `ask_peer` sends a query to another agent and blocks until response (300s timeout). This enables agents to consult each other in real-time rather than working in isolation.

**Architecture:** WebSocket daemon maintains session registry. Agents auto-register via lifecycle hooks. Communication patterns: ask_peer (sync), notify_peer (async), broadcast.

**Limitations:** Early stage, single-machine reliable, multi-machine experimental, 5-10 agents max. No task management or health monitoring.

**What we can learn:** The `ask_peer` pattern is exactly what our inbox system tried to solve but did poorly. Direct synchronous agent-to-agent queries should be a first-class feature.

---

### oh-my-claudecode (OMC)

**What it is:** A skill-based multi-agent orchestration layer that runs *within* a single Claude Code session. 858 stars, TypeScript.

**Key insight:** OMC proves that the **in-session approach** (skills, hooks, MCP tools, Task-tool delegation) can be incredibly powerful — 19 agents, 32 skills, 31 hooks. But it's fundamentally limited to a single context window. Agents are not independent processes; they're Task-tool invocations that share the parent's session.

**Architecture:** Hooks detect keywords → activate skills → delegate to specialized agents via Task tool. MCP server provides additional tools (LSP, AST, state management). Team mode leverages CC's native Agent Teams for multi-agent coordination within one session.

**Limitations:** Single-session scope. Agents share context budget. No persistent identity across sessions. No external interfaces. Max ~6 concurrent child agents.

**What we can learn:** OMC's agent definitions (model, tools, prompt per role) are well-designed. Their skill system (keyword triggers, auto-detection) is elegant. We should support importing OMC agent definitions as cc-orch agent templates.

---

### Anthropic Official Primitives

**Agent Teams (experimental):** Native multi-agent within CC. Shared task list, direct peer messaging, tmux/iTerm split panes. Limited to 3-5 teammates, all same model, no session resume, one team per session.

**Agent SDK:** Programmatic CC API. Resumable sessions, built-in tools, hooks as callbacks. The "right" way to build new orchestrators — but lower-level than what users want.

**Subagents:** In-session delegation with YAML frontmatter definitions. Isolation via worktrees. Cannot spawn sub-subagents.

**Hooks:** Shell commands triggered by CC lifecycle events. The integration point for external systems.

**Key takeaway:** Anthropic is shipping building blocks, not the assembled product. CC Orchestrator assembles them.

---

*Last updated: 2026-03-31*
*Research: 7 parallel agents, 30+ sources, 100K+ tokens of competitive intelligence*
*Existing prototype: 16 agents, 25 scripts, 3,750 lines, 2+ months of production operation*

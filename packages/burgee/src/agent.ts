/**
 * Agent detection, not just `isTTY` (N12). An agent may well have a terminal; what it
 * does not have is a person. Non-interactive is the default under a detected agent;
 * `FORCE_TTY=1` overrides. The variables mirror what `@vercel/detect-agent` probes; the
 * list is data, and `AI_AGENT` is the generic escape hatch any agent can set.
 */
export interface AgentProbe {
  /** Environment variable whose presence names the agent. */
  variable: string;
  agent: string;
}

export const AGENT_PROBES: readonly AgentProbe[] = [
  { variable: 'AI_AGENT', agent: 'generic' },
  { variable: 'CLAUDECODE', agent: 'claude-code' },
  { variable: 'CURSOR_AGENT', agent: 'cursor' },
  { variable: 'CODEX_THREAD_ID', agent: 'codex' },
  { variable: 'GEMINI_CLI', agent: 'gemini' },
];

export interface Detection {
  /** The agent named by the environment, if any; `AI_AGENT`'s own value when it names one. */
  agent?: string;
  /** Prompts and other blocking interaction are allowed. */
  interactive: boolean;
}

/** `AI_AGENT=1` says "an agent"; any other value names it. */
function agentName(hit: AgentProbe, value: string): string {
  if (hit.variable !== 'AI_AGENT' || value === '1') return hit.agent;
  return value;
}

export function detectAgent(env: Record<string, string | undefined>, tty: boolean, probes: readonly AgentProbe[] = AGENT_PROBES): Detection {
  let agent: string | undefined;
  for (const probe of probes) {
    const value = env[probe.variable];
    if (value !== undefined && value !== '') {
      agent = agentName(probe, value);
      break;
    }
  }
  const forced = env['FORCE_TTY'] === '1';
  const interactive = forced || (tty && agent === undefined);
  return agent === undefined ? { interactive } : { agent, interactive };
}

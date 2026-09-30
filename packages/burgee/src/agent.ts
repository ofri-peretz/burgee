/**
 * Agent detection, not just `isTTY` (N12). An agent may well have a terminal; what it
 * does not have is a person. `FORCE_TTY=1` overrides. `AI_AGENT` is the generic escape
 * hatch any agent can set.
 *
 * The list is the five variables `roundel/terminal`'s `AGENTS` holds, in the same order,
 * and it grows by one only for a variable that **uniquely** identifies an agent: set by the
 * agent, and never in a terminal a person types in. `CURSOR_TRACE_ID` fails that test — Cursor
 * sets it in every integrated terminal — so it is not here and must not be
 * (D-20260930-one-interactive-rule).
 *
 * Two answers come from here, and they are about different streams:
 *
 *   - `agent` is `ctx.agent`: which agent, if any, the environment names.
 *   - `interactive` is the **output** side: stdout is a terminal a person is reading, not an
 *     agent's capture. Help's colour reads it (O2, `colorFor`).
 *
 * Whether a person may be **asked** is not this function's answer. `ctx.interactive` is
 * roundel's `interactive()` — a terminal on stdin, no `CI`, no agent — computed in `ctx.ts`.
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
  /**
   * stdout is a terminal and no agent is named, or `FORCE_TTY=1`: the output side, which help's
   * colour reads. Whether to *ask* is `ctx.interactive`, roundel's rule over stdin and `CI`.
   */
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

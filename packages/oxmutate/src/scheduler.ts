/**
 * The server pool and its work-stealing queue.
 *
 * A server is a child process holding one warm Vitest (`child.ts`). Work is a queue of units;
 * an idle server takes the next one. A unit whose mutant runs away is killed with its server,
 * its unfinished part is split and put back at the front of the queue for the other servers,
 * and a spare server, already warm, takes the dead one's place. One unlucky test file can no
 * longer serialize a run behind its runaways (es-toolkit, 2026-10-26: 12 runaways in one static
 * shard set the whole mutation phase at 42.9 s while the other shards finished in 8 s).
 */
import { fork, type ChildProcess } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { ServerConfig, Unit } from './child.js';
import { exitReason } from './crash.js';
import type { Governor } from './governor.js';
import { beatFile, classifyStall, CPU_WINDOW_MS, cpuShare, LOOP_CPU, readBeat, type CpuSample, type Stall } from './heartbeat.js';
import { markReader, parseMark } from './progress-file.js';
import { env, killGroup, serverGroups, stderr } from './runtime.js';

const childJs = fileURLToPath(new URL('./child.js', import.meta.url));
/** The tail of a server's stderr kept for an error message. */
const STDERR_TAIL = 4000;
/** How often the watchdog reads a running unit's progress line. */
const WATCHDOG_POLL_MS = 50;
/** How long a server asked to close gets before it is killed (it gives itself the same). */
const CLOSE_GRACE_MS = 2000;

/** The mutant a unit's progress file says is running, if any. */
function inFlight(progress: string): string | undefined {
  try {
    return readFileSync(progress, 'utf8').trim().split(' ')[0] || undefined;
  } catch {
    return undefined;
  }
}

export interface UnitOutcome {
  /** The mutant in flight when the watchdog fired. */
  killedFor?: string | undefined;
  /** What the stopped run was doing: waiting with its worker idle, or busy (heartbeat.ts). */
  stall?: Stall | undefined;
  crashed?: boolean | undefined;
  /** The mutant in flight when the server crashed. */
  crashedFor?: string | undefined;
  /** How the crashed worker's process ended: `signal SIGKILL` (the kernel's out-of-memory kill, or a kill from outside), `exit code 134`. */
  exit?: string | undefined;
  /** The memory the server held once the unit was done, its test processes included (bytes; memory.ts `treeRss`). */
  rss?: number | undefined;
  /** Wall time from the unit being sent to its outcome, on this side of the IPC. */
  ms?: number | undefined;
  /** Mutants that ran past their budget blocked, not looping, and were given their grace in place. */
  graced?: number | undefined;
  /** How long the stopped run had been going, in ms, when the watchdog fired. */
  ranMs?: number | undefined;
  stderr: string;
}

const PERCENT = 100;
/** How many CPU samples a server keeps: a little over the window. */
const CPU_SAMPLES_KEPT = 8;

// Stryker disable all: diagnostics behind OXMUTATE_DEBUG_WATCHDOG; no verdict reads them
const debugStop = (o: { id: string; ran: number; stall: Stall; beat: { age: number; inTest: boolean }; share: number | undefined }): void => {
  const cpu = o.share === undefined ? '?' : `${String(Math.round(o.share * PERCENT))}%`;
  stderr.write(`oxmutate watchdog: stop ${o.id} after ${String(o.ran)} ms; ${o.stall}; beat ${Number.isFinite(o.beat.age) ? `${String(o.beat.age)} ms ago` : 'never'}${o.beat.inTest ? ' in a test' : ''}; cpu ${cpu} over ${String(CPU_WINDOW_MS)} ms\n`);
};
// Stryker restore all

/** The limit a run is held to: its budget, or the grace it was given if that is more (a graced mutant's next test may have the larger budget). */
export const limitOf = (gracedUntil: number | undefined, budget: number): number => Math.max(gracedUntil ?? 0, budget);

/** The stopped run's time as the stats list it: whole ms, and nothing for a unit that ended without a stop. */
export const stopMs = (outcome: Pick<UnitOutcome, 'killedFor' | 'ranMs'>): number[] => (outcome.killedFor ? [Math.round(outcome.ranMs ?? 0)] : []);

/** A busy run under LOOP_CPU, not graced yet and inside its limit, gets that limit once; says whether it did. */
export function graceOnce(graced: Map<string, number>, o: { id: string; ran: number; stall: Stall; share: number | undefined; limit: number | undefined }): boolean {
  const notLooping = o.stall === 'busy' && o.share !== undefined && o.share < LOOP_CPU;
  if (!notLooping || graced.has(o.id) || o.limit === undefined || o.limit <= o.ran) return false;
  graced.set(o.id, o.limit);
  return true;
}

/** Lowers a server's OS priority (`R15`); a failure is a warning, once. */
let priorityWarned = false;
function lowerPriority(pid: number): void {
  try {
    os.setPriority(pid, LOW_PRIORITY);
  } catch (error) {
    if (!priorityWarned) stderr.write(`oxmutate: could not lower the servers' priority (${error instanceof Error ? error.message : String(error)}); they run at the normal one\n`);
    priorityWarned = true;
  }
}
/** The niceness `resources.priority: 'low'` gives a server. */
const LOW_PRIORITY = 10;

/** Servers started by this process, for each one's temporary directory. */
let serversStarted = 0;

class Server {
  readonly child: ChildProcess;
  readonly ready: Promise<boolean>;
  stderr = '';
  /** Where this server's test workers beat (heartbeat.ts). */
  readonly beat: string;
  /** The server's latest CPU readings, oldest first (child.ts sends them). */
  private readonly cpu: CpuSample[] = [];
  private onMessage?: ((m: { type: string; rss?: number }) => void) | undefined;
  private onExit?: ((how: string) => void) | undefined;
  /** How the worker's process ended, once it has (`exitReason`). */
  private exitedBy = '';
  exited = false;

  constructor(configFile: string, cwd: string, execArgv: string[], { workDir, script = childJs }: { workDir: string; script?: string | undefined }) {
    // Its tests' temporary files go in the run's work directory and are removed with it: a killed
    // test never runs its cleanup, and runs had left 27,562 entries in the system's (2026-11-15).
    const tmp = path.join(workDir, `tmp-${String(++serversStarted)}`);
    mkdirSync(tmp, { recursive: true });
    const childEnv = { ...process.env, TMPDIR: tmp, TMP: tmp, TEMP: tmp };
    this.child = fork(script, [configFile], { cwd, stdio: ['ignore', 'ignore', 'pipe', 'ipc'], execArgv, detached: serverGroups, env: childEnv });
    this.beat = beatFile(workDir, this.child.pid);
    this.child.stderr?.on('data', (d: Buffer) => (this.stderr = (this.stderr + d.toString()).slice(-STDERR_TAIL)));
    this.ready = new Promise((resolve) => {
      const first = (m: { type: string }) => {
        if (m.type === 'ready') {
          this.child.off('message', first);
          resolve(true);
        }
      };
      this.child.on('message', first);
      this.child.once('exit', () => resolve(false));
    });
    this.child.on('message', (m: { type: string; at?: number; us?: number; rss?: number }) => {
      if (m.type === 'cpu') {
        this.cpu.push({ at: m.at ?? 0, us: m.us ?? 0 });
        if (this.cpu.length > CPU_SAMPLES_KEPT) this.cpu.shift();
        return;
      }
      this.onMessage?.(m);
    });
    this.child.once('exit', (code, signal) => {
      this.exited = true;
      this.exitedBy = exitReason(code, signal);
      this.onExit?.(this.exitedBy);
    });
  }

  /**
   * `grace`, when given: a mutant past its budget whose server is busy but burns under LOOP_CPU of a
   * core (a worker blocked in a synchronous call, or loading modules on a loaded machine) gets until
   * this limit in place before it is killed. A kill there costs a server start and a re-run with the
   * same 3x the grace gives; a loop burns its core and is killed at the budget, as before.
   */
  run(unit: Unit, budget: (id: string, testMs?: number) => number, grace?: (id: string, testMs?: number) => number): Promise<UnitOutcome> {
    // Opened once and read in place on every poll (progress-file.ts).
    const progress = markReader(unit.progress);
    const sent = performance.now();
    /** Each graced mutant and the time it was graced until. */
    const graced = new Map<string, number>();
    return new Promise((resolve) => {
      let settled = false;
      const finish = (o: UnitOutcome) => {
        if (settled) return;
        settled = true;
        clearInterval(timer);
        progress.close();
        this.onMessage = undefined;
        this.onExit = undefined;
        resolve({ ...o, ms: performance.now() - sent, ...(graced.size > 0 && { graced: graced.size }) });
      };
      const timer = setInterval(() => {
        const line = progress.read();
        if (!line) return;
        // A warm run marks the test it is running with that test's dry-run time: its limit is the test's own.
        const { id, since, testMs } = parseMark(line);
        const now = Date.now();
        const ran = now - since;
        if (ran > limitOf(graced.get(id), budget(id, testMs))) {
          // Read before the kill: an idle stop is a Timeout as it stands, a busy one is re-run (heartbeat.ts).
          const beat = readBeat(this.beat, now);
          const share = cpuShare(this.cpu, now);
          const stall = classifyStall({ beat, cpuShare: share });
          if (graceOnce(graced, { id, ran, stall, share, limit: grace?.(id, testMs) })) return;
          if (env['OXMUTATE_DEBUG_WATCHDOG']) debugStop({ id, ran, stall, beat, share });
          this.kill();
          finish({ killedFor: id, stall, ranMs: ran, stderr: this.stderr });
        }
      }, WATCHDOG_POLL_MS);
      this.onMessage = (m) => {
        if (m.type === 'done') finish({ stderr: this.stderr, ...(typeof m.rss === 'number' && { rss: m.rss }) });
      };
      this.onExit = (how) => finish({ crashed: true, crashedFor: inFlight(unit.progress), exit: how, stderr: this.stderr });
      if (this.exited) finish({ crashed: true, exit: this.exitedBy, stderr: this.stderr });
      else this.child.send({ type: 'run', unit });
    });
  }

  close(): void {
    if (this.exited) return;
    this.child.send({ type: 'close' });
    setTimeout(() => this.kill(), CLOSE_GRACE_MS).unref();
  }

  /** Kill the server and, where it leads a process group, every process its tests started. */
  kill(): void {
    if (!(serverGroups && this.child.pid !== undefined && killGroup(this.child.pid))) this.child.kill('SIGKILL');
  }
}

/** What a drain may add: `prepare` sees a unit as a server takes it and returns false to drop it; `grace` is a mutant's limit in place, for the test it is running when the mark names one (Server.run). */
export interface DrainHooks {
  prepare?: ((unit: Unit) => boolean) | undefined;
  grace?: ((unit: Unit, id: string, testMs?: number) => number) | undefined;
}

export interface Pool {
  /**
   * Run every unit; `after` is called with each outcome and may return follow-up units (`hooks`: DrainHooks).
   */
  drain(
    units: Unit[],
    budget: (unit: Unit, id: string, testMs?: number) => number,
    after: (unit: Unit, outcome: UnitOutcome) => Unit[] | Promise<Unit[]>,
    hooks?: DrainHooks,
  ): Promise<void>;
  close(): void;
  /** The process ids of the servers alive now, the spare included: what holds the pool's memory. */
  pids(): number[];
  /** `idle`: stops whose worker was idle (heartbeat.ts), of `killed`. `released`: servers closed for sitting idle (`resources.workerIdleTimeout`). `graced`: mutants given their grace in place instead of a kill. `peak`: the most units that ran at once since it was last set to 0. `stops`: how long each stopped run had gone, in ms, since it was last emptied. `recycled`: servers closed after a unit for holding more than `memoryCeiling`. `rssPeak`: the most memory one server held after a unit, in bytes. */
  stats: { spawned: number; killed: number; idle: number; crashed: number; released: number; recycled: number; rssPeak: number; graced: number; peak: number; stops: number[] };
}

/**
 * How long servers live (`resources.warmWorkers` and `resources.workerIdleTimeout`). `warm`: a server keeps its Vitest between units,
 * which is most of oxmutate's speed; `false` starts a fresh one per unit and closes it after, the
 * least memory held. `idleTimeoutMs`: a server with no unit for this long is closed, and a new one
 * starts if work comes later; 0 keeps every server until the run ends.
 */
export interface Lifecycle {
  warm: boolean;
  idleTimeoutMs: number;
  /**
   * `resources.workerMemoryLimit`, resolved (memory.ts `ceilingOf`): a warm server holding more than
   * this many bytes after a unit is closed and the warm spare takes its slot, so what it held goes back
   * to the machine before the next unit. Undefined: never.
   */
  memoryCeiling?: number | undefined;
}

/** Whether a server that held `rss` bytes after a unit is past the ceiling: never without both. */
export const overCeiling = (ceiling: number | undefined, rss: number | undefined): boolean => ceiling !== undefined && rss !== undefined && rss > ceiling;

/** How often idle servers are looked for. */
const IDLE_CHECK_MS = 1000;
/** The sweep's shortest interval: a short timeout is looked at about as often as it is long, never more than this often. */
// Stryker disable next-line NumericLiteral: a floor on the sweep's interval; no release a test can time tells 10 ms from 11
const MIN_IDLE_CHECK_MS = 10;

/** Where a pool keeps its files and how its servers live. */
export interface PoolPlace {
  workDir: string;
  tag: string;
  lifecycle?: Lifecycle | undefined;
  /** Holds a unit's start while the machine is past `resources.maxLoad` (governor.ts). */
  governor?: Governor | undefined;
  /** Start servers at a lowered OS priority (`resources.priority: 'low'`, `R15`). */
  lowPriority?: boolean | undefined;
  /** The server's entry point: `child.js`, or a stand-in that speaks its IPC in a test. */
  script?: string | undefined;
}

export function createPool(config: ServerConfig, size: number, place: PoolPlace): Pool {
  const { workDir, tag } = place;
  const lifecycle = place.lifecycle ?? { warm: true, idleTimeoutMs: 0 };
  const configFile = path.join(workDir, `server-${tag}.json`);
  writeFileSync(configFile, JSON.stringify(config));
  const stats = { spawned: 0, killed: 0, idle: 0, crashed: 0, released: 0, recycled: 0, rssPeak: 0, graced: 0, peak: 0, stops: [] as number[] };
  const spawn = (): Server => {
    stats.spawned++;
    const server = new Server(configFile, config.root, config.nodeArgs ?? [], { workDir, script: place.script });
    if (place.lowPriority && server.child.pid !== undefined) lowerPriority(server.child.pid);
    return server;
  };
  // Cold: nothing waits; each unit starts its own server. Warm: the slots and a spare start now.
  const servers: (Server | undefined)[] = Array.from({ length: size }, () => (lifecycle.warm ? spawn() : undefined));
  let spare: Server | undefined = lifecycle.warm ? spawn() : undefined;
  const idleSince: (number | undefined)[] = servers.map(() => performance.now());
  let spareSince = performance.now();
  const sweep = lifecycle.idleTimeoutMs > 0
    ? setInterval(() => {
        const now = performance.now();
        for (const [slot, server] of servers.entries()) {
          const since = idleSince[slot];
          if (server && since !== undefined && now - since >= lifecycle.idleTimeoutMs) {
            server.close();
            servers.fill(undefined, slot, slot + 1);
            stats.released++;
          }
        }
        if (spare && now - spareSince >= lifecycle.idleTimeoutMs) {
          spare.close();
          spare = undefined;
          stats.released++;
        }
      }, Math.max(MIN_IDLE_CHECK_MS, Math.min(IDLE_CHECK_MS, lifecycle.idleTimeoutMs)))
    : undefined;
  sweep?.unref();
  const tally = (outcome: UnitOutcome): void => {
    if (outcome.killedFor) stats.killed++;
    if (outcome.stall === 'idle') stats.idle++;
    if (outcome.crashed) stats.crashed++;
    stats.graced += outcome.graced ?? 0;
    stats.rssPeak = Math.max(stats.rssPeak, outcome.rss ?? 0);
    stats.stops.push(...stopMs(outcome));
  };
  const replacement = (): Server => {
    const next = spare ?? spawn();
    spare = lifecycle.warm ? spawn() : undefined;
    spareSince = performance.now();
    return next;
  };
  /** The slot's server, started if the slot has none (cold, or released while idle), and replaced if it never became ready. */
  const serverFor = async (slot: number): Promise<Server> => {
    idleSince.fill(undefined, slot, slot + 1);
    let server = servers[slot] ?? spawn();
    if (!(await server.ready)) {
      server = replacement();
      await server.ready;
    }
    servers.fill(server, slot, slot + 1);
    return server;
  };
  /** After a unit: cold, its server goes with it; warm, a killed or crashed one is replaced, and so is one past the memory ceiling. */
  const settle = (slot: number, server: Server, outcome: UnitOutcome): void => {
    const lost = Boolean(outcome.killedFor ?? outcome.crashed);
    if (!lifecycle.warm) {
      if (!lost) server.close();
      servers.fill(undefined, slot, slot + 1);
    } else if (lost) servers.fill(replacement(), slot, slot + 1);
    else if (overCeiling(lifecycle.memoryCeiling, outcome.rss)) {
      server.close();
      stats.recycled++;
      servers.fill(replacement(), slot, slot + 1);
    }
    idleSince.fill(performance.now(), slot, slot + 1);
  };

  return {
    stats,
    async drain(units, budget, after, hooks = {}) {
      const { prepare, grace } = hooks;
      const queue = [...units];
      let busy = 0;
      const waiters: (() => void)[] = [];
      const signal = () => {
        for (const w of waiters.splice(0)) w();
      };
      /** The next unit `prepare` keeps, or undefined when the queue is empty. */
      const take = (): Unit | undefined => {
        for (let unit = queue.shift(); unit; unit = queue.shift()) if (!prepare || prepare(unit)) return unit;
        return undefined;
      };
      await Promise.all(
        servers.map(async (_, slot) => {
          for (;;) {
            const unit = take();
            if (!unit) {
              if (busy === 0) {
                signal();
                return;
              }
              await new Promise<void>((r) => waiters.push(r));
              continue;
            }
            await place.governor?.hold(() => busy);
            busy++;
            stats.peak = Math.max(stats.peak, busy);
            const server = await serverFor(slot);
            const outcome = await server.run(unit, (id, ms) => budget(unit, id, ms), grace && ((id, ms) => grace(unit, id, ms)));
            tally(outcome);
            settle(slot, server, outcome);
            const more = await after(unit, outcome);
            queue.unshift(...more);
            busy--;
            signal();
          }
        }),
      );
    },
    pids() {
      return [...servers, spare].flatMap((s) => (s && !s.exited && s.child.pid !== undefined ? [s.child.pid] : []));
    },
    close() {
      if (sweep) clearInterval(sweep);
      for (const s of servers) s?.close();
      spare?.close();
      spare = undefined;
    },
  };
}

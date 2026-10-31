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
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { ServerConfig, Unit } from './child.js';

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
  crashed?: boolean | undefined;
  /** The mutant in flight when the server crashed. */
  crashedFor?: string | undefined;
  stderr: string;
}

class Server {
  readonly child: ChildProcess;
  readonly ready: Promise<boolean>;
  stderr = '';
  private onMessage?: ((m: { type: string }) => void) | undefined;
  private onExit?: ((code: number | null) => void) | undefined;
  exited = false;

  constructor(configFile: string, cwd: string, execArgv: string[]) {
    this.child = fork(childJs, [configFile], { cwd, stdio: ['ignore', 'ignore', 'pipe', 'ipc'], execArgv });
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
    this.child.on('message', (m: { type: string }) => this.onMessage?.(m));
    this.child.once('exit', (code) => {
      this.exited = true;
      this.onExit?.(code);
    });
  }

  run(unit: Unit, budget: (id: string) => number): Promise<UnitOutcome> {
    writeFileSync(unit.progress, '');
    return new Promise((resolve) => {
      let settled = false;
      const finish = (o: UnitOutcome) => {
        if (settled) return;
        settled = true;
        clearInterval(timer);
        this.onMessage = undefined;
        this.onExit = undefined;
        resolve(o);
      };
      const timer = setInterval(() => {
        let line = '';
        try {
          line = readFileSync(unit.progress, 'utf8').trim();
        } catch {
          return;
        }
        if (!line) return;
        const [id = '', since = '0'] = line.split(' ');
        if (Date.now() - Number(since) > budget(id)) {
          this.child.kill('SIGKILL');
          finish({ killedFor: id, stderr: this.stderr });
        }
      }, WATCHDOG_POLL_MS);
      this.onMessage = (m) => {
        if (m.type === 'done') finish({ stderr: this.stderr });
      };
      this.onExit = () => finish({ crashed: true, crashedFor: inFlight(unit.progress), stderr: this.stderr });
      if (this.exited) finish({ crashed: true, stderr: this.stderr });
      else this.child.send({ type: 'run', unit });
    });
  }

  close(): void {
    if (this.exited) return;
    this.child.send({ type: 'close' });
    setTimeout(() => this.child.kill('SIGKILL'), CLOSE_GRACE_MS).unref();
  }
}

export interface Pool {
  /**
   * Run every unit; `after` is called with each outcome and may return follow-up units. `prepare`, when
   * given, sees a unit as a server takes it, and returns false to drop it (nothing left to run).
   */
  drain(
    units: Unit[],
    budget: (unit: Unit, id: string) => number,
    after: (unit: Unit, outcome: UnitOutcome) => Unit[],
    prepare?: (unit: Unit) => boolean,
  ): Promise<void>;
  close(): void;
  stats: { spawned: number; killed: number; crashed: number };
}

export function createPool(config: ServerConfig, size: number, workDir: string, tag: string): Pool {
  const configFile = path.join(workDir, `server-${tag}.json`);
  writeFileSync(configFile, JSON.stringify(config));
  const stats = { spawned: 0, killed: 0, crashed: 0 };
  const spawn = (): Server => {
    stats.spawned++;
    return new Server(configFile, config.root, config.nodeArgs ?? []);
  };
  const servers: Server[] = Array.from({ length: size }, spawn);
  let spare: Server | undefined = spawn();
  const replacement = (): Server => {
    const next = spare ?? spawn();
    spare = spawn();
    return next;
  };

  return {
    stats,
    async drain(units, budget, after, prepare) {
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
            busy++;
            let server = servers[slot] as Server;
            if (!(await server.ready)) {
              server = replacement();
              servers[slot] = server;
              await server.ready;
            }
            const outcome = await server.run(unit, (id) => budget(unit, id));
            if (outcome.killedFor) stats.killed++;
            if (outcome.crashed) stats.crashed++;
            if (outcome.killedFor || outcome.crashed) {
              servers[slot] = replacement();
            }
            const more = after(unit, outcome);
            queue.unshift(...more);
            busy--;
            signal();
          }
        }),
      );
    },
    close() {
      for (const s of servers) s.close();
      spare?.close();
      spare = undefined;
    },
  };
}

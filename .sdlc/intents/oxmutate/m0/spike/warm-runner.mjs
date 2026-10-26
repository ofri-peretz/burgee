// M0 spike coordinator. Usage:
//   node --import ./register.mjs warm-runner.mjs --sandbox <stryker sandbox dir> \
//     --report <stryker json report> [--workers 4] [--timeout 5000] [--timeout-factor 1.5] \
//     [--check-every 100] [--specs src/array] [--out results.json]
// Reuses Stryker's instrumented sandbox and its mutant ids, so every verdict compares 1:1.
//
// Trust guards (M0 finding, 2026-10-26: warm workers share modules across spec files, which
// vitest isolates per file):
//   1. covering tests run grouped by file, in file order, cheapest file first
//   2. a kill that follows another file's tests is confirmed in a fresh worker, file by file
//   3. every `--check-every` mutants a worker re-runs the unmutated suite; a failure means
//      pollution: the worker is replaced and that window of mutants is re-run once
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { execFileSync, fork } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { fileURLToPath } from 'node:url';

/** A warm worker as a child process, with the slice of the Worker API the coordinator uses. */
class ChildWorker extends EventEmitter {
  constructor(file, data, heapMb) {
    super();
    this.killedByUs = false;
    this.child = fork(fileURLToPath(file), [], {
      execArgv: ['--import', fileURLToPath(new URL('./register.mjs', import.meta.url)), `--max-old-space-size=${heapMb}`],
      env: { ...process.env, SPIKE_WORKER_DATA: JSON.stringify(data) },
      serialization: 'advanced',
      stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
    });
    this.pid = this.child.pid;
    this.stderrTail = '';
    this.child.stderr.on('data', (d) => (this.stderrTail = (this.stderrTail + d).slice(-4000)));
    this.child.on('message', (m) => this.emit('message', m));
    this.exited = new Promise((resolve) =>
      this.child.once('exit', (code, signal) => {
        if (!this.killedByUs && (code !== 0 || signal)) {
          const err = new Error(`worker exited: ${code ?? signal}`);
          err.outOfMemory = /heap out of memory|Reached heap limit/i.test(this.stderrTail);
          this.emit('error', err);
        }
        this.emit('exit', code);
        resolve();
      }),
    );
  }
  postMessage(m) {
    if (this.child.connected) this.child.send(m);
  }
  async terminate() {
    this.killedByUs = true;
    if (this.child.exitCode === null && this.child.signalCode === null) this.child.kill('SIGKILL');
    await this.exited;
  }
}

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
};
const sandbox = path.resolve(arg('sandbox'));
const report = JSON.parse(readFileSync(arg('report'), 'utf8'));
const workerCount = Number(arg('workers', '4'));
const timeoutMs = Number(arg('timeout', '5000'));
const timeoutFactor = Number(arg('timeout-factor', '1.5')); // Stryker's default timeoutFactor
const checkEvery = Number(arg('check-every', '100'));
const outFile = arg('out', 'results.json');
const specDir = path.join(sandbox, arg('specs', 'src/array'));
const HIT_LIMIT_FACTOR = 100; // Stryker's own factor
const refresh = arg('refresh', 'on') === 'on';
const namespace = arg('namespace', '__stryker__');
const heapMb = Number(arg('heap-mb', '1024'));

const wallStart = performance.now();
let peakRssMb = 0;
const sampler = setInterval(() => {
  const pids = [process.pid, ...[...live].map((w) => w.pid)].join(',');
  try {
    const kb = execFileSync('ps', ['-o', 'rss=', '-p', pids], { encoding: 'utf8' })
      .split('\n').filter(Boolean).reduce((s, x) => s + Number(x), 0);
    peakRssMb = Math.max(peakRssMb, kb / 1024);
  } catch {}
}, 250);
const cpuStart = process.cpuUsage();

const specFiles = readdirSync(specDir)
  .filter((f) => f.endsWith('.spec.ts'))
  .sort()
  .map((f) => path.join(specDir, f));
const mutants = Object.values(report.files).flatMap((f) => f.mutants);
const strykerStatus = new Map(mutants.map((m) => [m.id, m.status]));
const fileOf = new Map(
  Object.entries(report.files).flatMap(([file, f]) => f.mutants.map((m) => [m.id, file])),
);

// ── Workers ───────────────────────────────────────────────────────────────────────────────────
const workerUrl = new URL('./worker.mjs', import.meta.url);
const live = new Set();
const spawn = (data) => {
  const w = new ChildWorker(workerUrl, { specFiles, timeoutMs, refresh, namespace, ...data }, heapMb);
  live.add(w);
  w.once('exit', () => live.delete(w));
  w.on('error', () => {}); // crashes are handled where a mutant is in flight; never fatal here
  return w;
};
const once = (w, type) =>
  new Promise((resolve, reject) => {
    const onMessage = (m) => {
      if (m.type === type) {
        w.off('message', onMessage);
        resolve(m);
      }
    };
    w.on('message', onMessage);
    w.once('error', reject);
  });
/** A one-shot fresh worker (static or confirm mode). Resolves with its message, or a crash. */
const oneShot = (data, type) =>
  new Promise((resolve) => {
    const w = spawn(data);
    const timer = setTimeout(async () => {
      await w.terminate();
      resolve({ status: 'Timeout', watchdog: true });
    }, timeoutMs * 4);
    w.once('message', async (m) => {
      if (m.type !== type) return;
      clearTimeout(timer);
      await w.terminate();
      resolve(m);
    });
    w.once('error', async () => {
      clearTimeout(timer);
      resolve({ status: 'RuntimeError' });
    });
  });

// ── Warm-up: import once, dry run once, per worker ────────────────────────────────────────────
const warmStart = performance.now();
const first = Array.from({ length: workerCount }, (_, i) => spawn({ reportCoverage: i === 0 }));
const readies = await Promise.all(first.map((w) => once(w, 'ready')));
const warmMs = performance.now() - warmStart;
const dry = readies[0];
const failing = dry.tests.filter((t) => !t.ok);
if (failing.length > 0) {
  console.error(`instrument fault: ${failing.length} test(s) fail unmutated; refusing to score`);
  for (const t of failing.slice(0, 10)) console.error(`  ${t.name}: ${t.error}`);
  process.exit(2);
}

// ── Coverage: mutant → covering tests, grouped by file, cheapest file first ───────────────────
const testInfo = new Map(dry.tests.map((t) => [t.id, t]));
const coveringRaw = new Map();
const hits = new Map();
for (const [testId, perMutant] of Object.entries(dry.coverage.perTest)) {
  for (const [mutantId, n] of Object.entries(perMutant)) {
    if (!coveringRaw.has(mutantId)) coveringRaw.set(mutantId, []);
    coveringRaw.get(mutantId).push(testId);
    hits.set(mutantId, (hits.get(mutantId) ?? 0) + n);
  }
}
/** [[testId, …] per file], files ordered by their cheapest covering test, tests in file order. */
const groups = new Map();
for (const [mutantId, ids] of coveringRaw) {
  const byFile = new Map();
  for (const id of ids.sort((a, b) => Number(a) - Number(b))) {
    const f = testInfo.get(id).file;
    if (!byFile.has(f)) byFile.set(f, []);
    byFile.get(f).push(id);
  }
  const cost = (g) => Math.min(...g.map((id) => testInfo.get(id).ms));
  groups.set(mutantId, [...byFile.values()].sort((a, b) => cost(a) - cost(b)));
}
const ordered = (id) => groups.get(id).flat();
const budgetFor = (id) => timeoutMs + ordered(id).reduce((s, t) => s + testInfo.get(t).ms, 0) * timeoutFactor;
const hitLimitFor = (id) => (hits.get(id) ?? 1) * HIT_LIMIT_FACTOR;
const staticIds = new Set(Object.keys(dry.coverage.static ?? {}));

const results = new Map();
const queue = [];
for (const m of mutants) {
  if (staticIds.has(m.id)) continue;
  if (!groups.has(m.id)) results.set(m.id, { status: 'NoCoverage', ms: 0 });
  else queue.push(m.id);
}

// ── Mutation phase: warm workers, one message per mutant ──────────────────────────────────────
const stats = { watchdog: 0, crashes: 0, checkpoints: 0, polluted: 0, requeued: 0, confirmations: 0, overturned: 0 };
const retried = new Set();
const toConfirm = [];
const mutationStart = performance.now();
await new Promise((done) => {
  let active = 0;
  const finish = () => {
    if (queue.length === 0 && active === 0) done();
  };
  const replace = async (w) => {
    w.removeAllListeners();
    w.on('error', () => {}); // a dying worker may still emit (e.g. ERR_WORKER_OUT_OF_MEMORY)
    await w.terminate();
    const fresh = spawn({});
    await once(fresh, 'ready');
    drive(fresh);
  };
  const drive = (w) => {
    active++;
    let sinceCheck = [];
    const next = () => {
      if (sinceCheck.length >= checkEvery || (queue.length === 0 && sinceCheck.length > 0)) {
        stats.checkpoints++;
        const window = sinceCheck;
        sinceCheck = [];
        let checkSettled = false;
        const onChecked = async (m) => {
          if (m.type !== 'checked' || checkSettled) return;
          checkSettled = true;
          w.off('message', onChecked);
          if (m.failing.length === 0) return next();
          stats.polluted++;
          for (const id of window) {
            if (retried.has(id)) continue;
            retried.add(id);
            results.delete(id);
            queue.push(id);
            stats.requeued++;
          }
          active--;
          await replace(w);
        };
        w.on('message', onChecked);
        w.once('error', () => onChecked({ type: 'checked', failing: ['<worker crashed>'] }));
        w.postMessage({ type: 'check' });
        return;
      }
      const id = queue.shift();
      if (id === undefined) {
        active--;
        return finish();
      }
      const budget = budgetFor(id);
      let settled = false;
      const watchdog = setTimeout(async () => {
        // A synchronous hang the hit counter did not break: kill the worker, count a timeout.
        if (settled) return;
        settled = true;
        stats.watchdog++;
        results.set(id, { status: 'Timeout', ms: budget, watchdog: true });
        active--;
        await replace(w);
        finish();
      }, budget);
      const onError = async (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(watchdog);
        // Out of memory is a runaway mutant (an unbounded loop that allocates): a Timeout, as when
        // the clock wins the race. Any other crash is a RuntimeError, as in Stryker.
        if (err?.outOfMemory) stats.outOfMemory = (stats.outOfMemory ?? 0) + 1;
        else stats.crashes++;
        results.set(id, { status: err?.outOfMemory ? 'Timeout' : 'RuntimeError', ms: 0, outOfMemory: !!err?.outOfMemory });
        active--;
        await replace(w);
        finish();
      };
      const onResult = (m) => {
        if (m.type !== 'result' || m.id !== id || settled) return;
        settled = true;
        clearTimeout(watchdog);
        w.off('message', onResult);
        w.off('error', onError);
        results.set(id, { status: m.status, killedBy: m.killedBy, ms: m.ms, refreshMs: m.refreshMs, testsRun: m.testsRun });
        sinceCheck.push(id);
        if (m.status !== 'Survived') {
          const killerFile = testInfo.get(m.killedBy).file;
          const ran = ordered(id).slice(0, m.testsRun - 1);
          if (ran.some((t) => testInfo.get(t).file !== killerFile)) toConfirm.push(id);
        }
        next();
      };
      w.on('message', onResult);
      w.once('error', onError);
      w.postMessage({ type: 'mutant', id, tests: ordered(id), hitLimit: hitLimitFor(id) });
    };
    next();
  };
  for (const w of first) drive(w);
});
const mutationMs = performance.now() - mutationStart;
await Promise.all([...live].map((w) => w.terminate()));

// ── Confirm cross-file kills: fresh worker per file group, killer's file first ────────────────
const pool = async (items, fn) => {
  const q = [...items];
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      for (let x = q.shift(); x !== undefined; x = q.shift()) await fn(x);
    }),
  );
};
const confirmStart = performance.now();
await pool(toConfirm, async (id) => {
  stats.confirmations++;
  const prior = results.get(id);
  const killerFile = testInfo.get(prior.killedBy).file;
  const gs = groups.get(id);
  const start = gs.findIndex((g) => testInfo.get(g[0]).file === killerFile);
  for (const g of gs.slice(start)) {
    const m = await oneShot({ confirmMutant: id, confirmTests: g, hitLimit: hitLimitFor(id) }, 'confirmed');
    if (m.status !== 'Survived') {
      results.set(id, { ...prior, status: m.status, confirmed: true });
      return;
    }
  }
  stats.overturned++;
  results.set(id, { ...prior, status: 'Survived', confirmed: true, overturnedFrom: prior.status });
});
const confirmMs = performance.now() - confirmStart;

// ── Static mutants: a fresh worker each, switch set before import ─────────────────────────────
const staticStart = performance.now();
await pool([...staticIds].filter((id) => strykerStatus.has(id)), async (id) => {
  const m = await oneShot({ staticMutant: id }, 'static');
  results.set(id, { status: m.status, killedBy: m.killedBy, ms: m.ms, static: true });
});
const staticMs = performance.now() - staticStart;

// ── Compare with Stryker ──────────────────────────────────────────────────────────────────────
const comparable = (s) => (s === 'Timeout' ? 'Killed' : s); // a timeout is a detection in both tools
const disagreements = [];
let agree = 0;
for (const m of mutants) {
  const ours = results.get(m.id)?.status ?? 'Missing';
  if (comparable(ours) === comparable(m.status)) agree++;
  else
    disagreements.push({
      id: m.id,
      file: fileOf.get(m.id),
      line: m.location.start.line,
      mutator: m.mutatorName,
      replacement: m.replacement,
      stryker: m.status,
      ours,
      static: staticIds.has(m.id),
      detail: results.get(m.id),
    });
}

const executed = [...results.values()].filter((r) => r.status !== 'NoCoverage' && !r.static);
const perMutant = executed.map((r) => r.ms).sort((a, b) => a - b);
const pct = (p) => perMutant[Math.min(perMutant.length - 1, Math.floor((p / 100) * perMutant.length))];
const count = (s) => [...results.values()].filter((r) => r.status === s).length;
const cpu = process.cpuUsage(cpuStart);
const summary = {
  subject: { sandbox, specFiles: specFiles.length, tests: dry.tests.length },
  workers: workerCount,
  mutants: mutants.length,
  static: staticIds.size,
  verdicts: Object.fromEntries(['Killed', 'Survived', 'Timeout', 'NoCoverage', 'RuntimeError'].map((s) => [s, count(s)])),
  agreement: { agree, total: mutants.length, pct: (100 * agree) / mutants.length },
  ms: {
    warmUp: warmMs,
    importPerWorker: Math.max(...readies.map((r) => r.importMs)),
    dryRun: dry.dryMs,
    mutationPhase: mutationMs,
    confirmPhase: confirmMs,
    staticPhase: staticMs,
    wall: performance.now() - wallStart,
  },
  perMutantMs: { executed: perMutant.length, median: pct(50), p95: pct(95), max: perMutant.at(-1) },
  perMutantPerWorkerMs: (mutationMs * workerCount) / Math.max(1, perMutant.length),
  testsPerMutant: executed.reduce((s, r) => s + (r.testsRun ?? 0), 0) / Math.max(1, executed.length),
  refreshMsTotal: executed.reduce((s, r) => s + (r.refreshMs ?? 0), 0),
  options: { timeoutMs, timeoutFactor, checkEvery, refresh, heapMb },
  guards: stats,
  cpuSeconds: (cpu.user + cpu.system) / 1e6,
  peakTotalRssMb: peakRssMb,
};
writeFileSync(outFile, JSON.stringify({ summary, disagreements, results: Object.fromEntries(results) }, null, 2));
console.log(JSON.stringify(summary, null, 2));
if (disagreements.length) {
  console.log(`\n${disagreements.length} disagreement(s):`);
  for (const d of disagreements.slice(0, 30))
    console.log(`  #${d.id} ${d.file}:${d.line} ${d.mutator} stryker=${d.stryker} ours=${d.ours}${d.static ? ' (static)' : ''}`);
}
clearInterval(sampler);
process.exit(0);

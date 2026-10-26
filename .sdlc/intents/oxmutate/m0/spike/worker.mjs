// One warm worker: imports every spec file once (instrumented sources come with them), then runs
// mutants on request by flipping Stryker's own switch (`__stryker__.activeMutant`) and re-running
// only the covering test callbacks. No re-import, no re-collection, no test-runner start per mutant.
//
// Modes (workerData):
//   default        warm worker: dry run, then 'mutant' and 'check' messages
//   staticMutant   switch set before import (module-load code sees it); run every test once
//   confirmMutant  fresh state, switch set after import; run only `confirmTests` (kill confirmation)
import { parentPort as threadPort, workerData as threadData } from 'node:worker_threads';

// Runs as a worker thread or as a forked child process (the default since M0 run 3: a thread's
// heap limit can abort the whole process; a child process dies alone).
const parentPort = threadPort ?? { postMessage: (m) => process.send(m), on: (e, f) => process.on(e, f) };
const workerData = threadData ?? JSON.parse(process.env.SPIKE_WORKER_DATA);
import { pathToFileURL } from 'node:url';

const ns = (globalThis[workerData.namespace ?? '__stryker__'] ??= {});
ns.mutantCoverage ??= { static: {}, perTest: {} };
if (workerData.staticMutant !== undefined) ns.activeMutant = workerData.staticMutant;
const registry = (globalThis.__spike__ ??= { tests: [], stack: [], file: undefined });

const TIMEOUT = Symbol('timeout');
async function runBody(body, timeoutMs) {
  const result = body();
  if (!result || typeof result.then !== 'function') return;
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => reject(TIMEOUT), timeoutMs);
  });
  try {
    await Promise.race([result, deadline]);
  } finally {
    clearTimeout(timer);
  }
}
const isHitLimit = (e) => e instanceof Error && /^(Stryker|oxmutate): Hit count limit/.test(e.message);

const importStart = performance.now();
for (const file of workerData.specFiles) {
  registry.file = file;
  await import(pathToFileURL(file).href);
}
registry.file = undefined;
const importMs = performance.now() - importStart;
const tests = registry.tests.map((t, i) => ({ ...t, id: String(i) }));
const testsOfFile = new Map();
for (const t of tests) {
  if (!testsOfFile.has(t.file)) testsOfFile.set(t.file, []);
  testsOfFile.get(t.file).push(t);
}

/**
 * Fresh fixtures: re-import a spec file as a new module instance and swap in its test bodies.
 * Source modules stay cached (warm); only the spec's own module-level state is renewed.
 * M0 finding: mutant 394 (`arr.slice().sort` → `arr.sort`) sorted a spec's shared fixture in
 * place, and the next mutant on the same worker saw the reordered fixture.
 */
let generation = 0;
async function refresh(files) {
  for (const file of files) {
    registry.sink = [];
    registry.file = file;
    await import(`${pathToFileURL(file).href}?r=${++generation}`);
    const fresh = registry.sink;
    registry.sink = undefined;
    registry.file = undefined;
    const old = testsOfFile.get(file);
    if (fresh.length !== old.length) throw new Error(`refresh: ${file} registered ${fresh.length} tests, expected ${old.length}`);
    fresh.forEach((t, i) => (old[i].body = t.body));
  }
}

/** Run the given tests under the active mutant; bail on the first failure. */
async function runMutant(testIds, timeoutMs) {
  let testsRun = 0;
  for (const id of testIds) {
    testsRun++;
    try {
      await runBody(tests[Number(id)].body, timeoutMs);
    } catch (e) {
      if (e === TIMEOUT || isHitLimit(e)) return { status: 'Timeout', killedBy: id, testsRun };
      return { status: 'Killed', killedBy: id, testsRun };
    }
  }
  return { status: 'Survived', testsRun };
}

/** Every test, unmutated: the pollution checkpoint. */
async function check(timeoutMs) {
  const failing = [];
  for (const t of tests) {
    try {
      await runBody(t.body, timeoutMs);
    } catch {
      failing.push(t.id);
    }
  }
  return failing;
}

function arm(id, hitLimit) {
  ns.activeMutant = id;
  ns.hitCount = 0;
  ns.hitLimit = hitLimit;
}
function disarm() {
  ns.activeMutant = undefined;
  ns.hitCount = undefined;
  ns.hitLimit = undefined;
}

if (workerData.staticMutant !== undefined) {
  const t0 = performance.now();
  const result = await runMutant(tests.map((t) => t.id), workerData.timeoutMs);
  parentPort.postMessage({ type: 'static', id: workerData.staticMutant, ...result, ms: performance.now() - t0 });
} else if (workerData.confirmMutant !== undefined) {
  const t0 = performance.now();
  arm(workerData.confirmMutant, workerData.hitLimit);
  const result = await runMutant(workerData.confirmTests, workerData.timeoutMs);
  disarm();
  parentPort.postMessage({ type: 'confirmed', id: workerData.confirmMutant, ...result, ms: performance.now() - t0 });
} else {
  // Dry run: every test once, unmutated, recording per-test coverage through Stryker's counters.
  const dry = [];
  const dryStart = performance.now();
  for (const t of tests) {
    ns.currentTestId = t.id;
    const t0 = performance.now();
    let ok = true;
    let error;
    try {
      await runBody(t.body, workerData.timeoutMs);
    } catch (e) {
      ok = false;
      error = e === TIMEOUT ? 'timeout' : String(e?.message ?? e).slice(0, 200);
    }
    dry.push({ id: t.id, file: t.file, name: t.name, ok, error, ms: performance.now() - t0 });
  }
  ns.currentTestId = undefined;
  parentPort.postMessage({
    type: 'ready',
    importMs,
    dryMs: performance.now() - dryStart,
    tests: dry,
    coverage: workerData.reportCoverage ? ns.mutantCoverage : undefined,
  });

  parentPort.on('message', async (msg) => {
    if (msg.type === 'mutant') {
      const t0 = performance.now();
      arm(msg.id, msg.hitLimit);
      const result = await runMutant(msg.tests, workerData.timeoutMs);
      disarm();
      const ms = performance.now() - t0;
      const r0 = performance.now();
      if (workerData.refresh !== false) {
        await refresh(new Set(msg.tests.slice(0, result.testsRun).map((id) => tests[Number(id)].file)));
      }
      parentPort.postMessage({ type: 'result', id: msg.id, ...result, ms, refreshMs: performance.now() - r0 });
    } else if (msg.type === 'check') {
      const t0 = performance.now();
      const failing = await check(workerData.timeoutMs);
      parentPort.postMessage({ type: 'checked', failing, ms: performance.now() - t0 });
    }
  });
}

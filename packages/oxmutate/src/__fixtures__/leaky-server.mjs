/**
 * A stand-in for `child.ts` that speaks its IPC and leaks: each unit keeps `LEAK_MB` of resident
 * memory it never frees, as a warm Vitest server keeps the module graph and whatever a mutant left in
 * it. It answers `done` with its own rss as `child.ts` does, so the pool's memory ceiling acts on it.
 *
 * Test scaffolding: `__fixtures__` is outside coverage, mutation and the build. It exits as the pool
 * closes it, by letting go of its IPC channel: nothing else keeps it alive.
 */
const LEAK_MB = Number(process.env['LEAK_MB'] ?? '64');
const held = [];
process.on('message', (msg) => {
  if (msg.type === 'run') {
    // Filled, so the pages are resident and count in rss.
    held.push(Buffer.alloc(LEAK_MB * 1024 * 1024, 1));
    process.send({ type: 'done', rss: process.memoryUsage.rss() });
  } else if (msg.type === 'close') process.disconnect();
});
process.send({ type: 'ready' });
export {};

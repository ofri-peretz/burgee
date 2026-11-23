/**
 * Which mutants run in a fresh worker straight away, and which run warm first (`.sdlc/intents/oxmutate-x2`,
 * "Path to 3x"). A fresh worker's verdict is the reference one; a warm verdict is believed only for a kill, and a
 * warm survivor runs fresh as well (coordinator.ts, 6b). So a mutant that is going to run fresh anyway, or that
 * costs more warm than fresh, should not run warm at all.
 *
 * Costs per mutant, from what the dry run measured (ms, `bench/container.mjs` on `pathe`, `ufo`, `gen`, 2026-11-22):
 *   fresh = START + cover        a worker's start (pathe 248, ufo 94, gen 78) and the covering tests' own time
 *   warm  = UNIT + BLOWUP * cover    a unit's share of its server's start, and the armed run: `pathe`'s `glob.spec.ts`
 *                                    took 599 ms a mutant warm, 443 of it armed, against 78 ms for the same tests
 *                                    fresh, which stops at its first failing test (BLOWUP is that ratio, 5.7)
 * `cover` is the sum of the dry-run times of the tests that cover the mutant. Fresh is cheaper from
 * `(START - UNIT) / (BLOWUP - 1)` = 49 ms of cover. Every file measured but one sits below 30 ms in all (`ufo` at most 17,
 * `gen` at most 4, `pathe`'s others at most 29); `glob.spec.ts` has 3,395 ms. START is the largest start measured, so
 * a project where it is smaller still runs warm: the side with the verified default.
 */
export const FRESH_START_MS = 250;
export const WARM_UNIT_MS = 20;
export const WARM_BLOWUP = 5.7;

/** The cover time at which a fresh worker costs less than the warm run of the same mutant. */
export const FRESH_FROM_COVER_MS = (FRESH_START_MS - WARM_UNIT_MS) / (WARM_BLOWUP - 1);

/** Whether a mutant whose covering tests take `coverMs` in the dry run is cheaper in a fresh worker than warm. */
export const freshIsCheaper = (coverMs: number): boolean => FRESH_START_MS + coverMs < WARM_UNIT_MS + WARM_BLOWUP * coverMs;

/**
 * A static mutant (one whose value is read while a module loads) runs warm in a live worker that re-collects the
 * files that load it, with every test of each armed, so its cover is every test of those files. Measured (container
 * mode, 2026-11-22): `ufo`, cover about 50 ms, 145 ms a mutant (0.8 s for 44 mutants on 8 workers); `pathe`,
 * cover 3,442 ms (its `glob.spec.ts` loads them), 1,700 ms a mutant (51.4 s for 243). A line through the two points:
 * 122 ms and 0.46 of the cover. Fresh costs START plus the tests up to the first failure, so it is cheaper from
 * `(START - STATIC_UNIT) / STATIC_PER_COVER` = 278 ms of cover. Two points make a hypothesis: `ufo` and `pathe` sit 5x
 * below and 12x above it, and the figures are in the report (`freshByFile`, `isolatedStages`) for the next to check.
 */
export const STATIC_UNIT_MS = 122;
export const STATIC_PER_COVER = 0.46;

/** The cover time at which a fresh worker costs less than the live static run of the same mutant. */
export const STATIC_FRESH_FROM_COVER_MS = (FRESH_START_MS - STATIC_UNIT_MS) / STATIC_PER_COVER;

/** Whether a static mutant whose loader files' tests take `coverMs` in the dry run is cheaper in a fresh worker than live. */
export const staticFreshIsCheaper = (coverMs: number): boolean => FRESH_START_MS < STATIC_UNIT_MS + STATIC_PER_COVER * coverMs;

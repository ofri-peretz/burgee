/**
 * What each docs site's home `<title>` says after the package's name: what the package does,
 * short. A search result and a model's citation show the title before anything else on the page,
 * so it is the first definition a reader meets (`.sdlc/intents/positioning/` R13).
 *
 * Until 2026-10-10 every title read `<name> — replaces X`, read out of the npm description, and
 * burgee's "the CLI framework that replaces commander and yargs": the first thing a reader learned
 * was a rival's name. The incumbents now sit where search still finds them — the meta
 * description's last sentence, which is the npm description's `Drop-in paths for …` clause
 * (D-20261009-positioning-home-title, decided 2026-10-10).
 *
 * One phrase per package, written here rather than derived: a description's first sentence is a
 * full definition, too long to be a title, and a truncated one stops mid-thought. Every key is a
 * package a docs app documents; `scripts/positioning-lock.test.ts` renders each app's home title
 * through {@link homeTitle} and fails one that names an incumbent, says "replaces", ranks, or
 * runs past the length a search result shows.
 */
export const HOME_TITLES: Readonly<Record<string, string>> = {
  burgee: 'a CLI framework built on one declaration',
  bellpull: 'subprocesses with one structured result',
  caique: 'prompts that are flags first',
  closeout: 'exit handlers that run once, on every path out',
  controlroom: 'keyboard-driven terminal screens',
  flagstaff: 'spinners, progress, boxes and tables',
  linegauge: 'measure, wrap and slice styled terminal text',
  paratext: 'terminal hyperlinks, images and notifications',
  roundel: 'colour for CLIs',
  seniority: 'config resolution with provenance',
};

/** `<name> — <what it does>`, or a build failure naming the package with no phrase. */
export function homeTitle(name: string): string {
  const does = HOME_TITLES[name];
  if (does === undefined) throw new Error(`docs-chassis/home-title: no home title for '${name}' — add what it does, short, to HOME_TITLES`);
  return `${name} — ${does}`;
}

/**
 * Artifact gate — cli-packaging R4 and R5 (floor K4, K5). Runs on the BUILT packages,
 * between build and publish, so what is about to reach npm is what gets checked:
 *
 *   - every `exports` target exists on disk;
 *   - the pack list contains no source maps, no tests, no agent docs;
 *   - every `bin` target is in the pack list and starts with `#!/usr/bin/env node`;
 *   - neither the gzipped tarball NOR the unpacked tree is more than 10% larger than
 *     the recorded baseline (a shrink in either is reported so the baseline can be
 *     lowered in the same PR).
 *
 * Exit code 1 on any failure. `--update-baseline` rewrites the baseline to what is built.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const BASELINE = join(root, ".sdlc/bands", "artifact-size-baseline.json");
const GROWTH_ALLOWED = 0.1;
const PERCENT = 100;

export interface Pkg {
  name: string;
  private?: boolean;
  bin?: string | Record<string, string>;
  exports?: Record<string, string | Record<string, string>>;
}
export interface PackEntry {
  name: string;
  size: number;
  unpackedSize: number;
  files: { path: string }[];
}
export type Baseline = Record<string, { size: number; unpackedSize: number }>;

const FORBIDDEN = [
  /\.map$/,
  /\.test\.[cm]?[jt]s$/,
  /(^|\/)AGENTS\.md$/,
  /(^|\/)CLAUDE\.md$/,
];

/** Every `exports` target must exist on disk — a build that skipped a file must not publish. */
function missingExportTargets(dir: string, pkg: Pkg): string[] {
  const problems: string[] = [];
  for (const [entry, target] of Object.entries(pkg.exports ?? {})) {
    if (entry === "./package.json") continue;
    const files = typeof target === "string" ? [target] : Object.values(target);
    for (const f of new Set(files)) {
      if (!existsSync(join(dir, f)))
        problems.push(
          `${pkg.name}: exports ${entry} -> ${f} does not exist (build first?)`,
        );
    }
  }
  return problems;
}

/** Nothing in the pack list may be a source map, a test, or agent instructions. */
function forbiddenInPack(pkg: Pkg, pack: PackEntry): string[] {
  return pack.files
    .filter(({ path }) => FORBIDDEN.some((re) => re.test(path)))
    .map(({ path }) => `${pkg.name}: would publish ${path}`);
}

/** The interpreter line every executable npm links onto a PATH has to start with. */
export const SHEBANG = "#!/usr/bin/env node";

/**
 * Every `bin` target ships, and starts with the shebang.
 *
 * npm links a bin by symlinking the file and marking it executable; it does not wrap it. A
 * bin without `#!/usr/bin/env node` is therefore handed to `/bin/sh` on macOS and Linux, which
 * reads `import { mkdirSync … }` as a shell command — burgee@0.10.0 shipped exactly that, so
 * `npx burgee` and the installed `burgee` printed `import: command not found` while eight
 * sibling bins worked. Nothing looked: `tsc` copies a shebang through when the source has one
 * and adds none when it does not, and every test ran the bin as `node dist/cli.js`, which
 * never reads line one.
 *
 * `read` is the file's text, injected so the lock test drives this without a build.
 */
export function binProblems(
  pkg: Pkg,
  pack: PackEntry,
  read: (file: string) => string | undefined,
): string[] {
  const bins =
    typeof pkg.bin === "string"
      ? { [pkg.name]: pkg.bin }
      : (pkg.bin ?? {});
  const packed = new Set(pack.files.map(({ path }) => path));
  const problems: string[] = [];
  for (const [command, target] of Object.entries(bins)) {
    const file = target.replace(/^\.\//, "");
    if (!packed.has(file)) {
      problems.push(
        `${pkg.name}: bin ${command} -> ${target} is not in the pack list`,
      );
      continue;
    }
    const first = (read(file) ?? "").split("\n", 1)[0] ?? "";
    if (first.trimEnd() !== SHEBANG)
      problems.push(
        `${pkg.name}: bin ${command} -> ${target} does not start with "${SHEBANG}" (it starts ${JSON.stringify(first.slice(0, 40))}); the installed command runs under /bin/sh`,
      );
  }
  return problems;
}

/** The tarball ratchets: growth past the allowance fails, a shrink is reported so the baseline can follow. */
/**
 * The two numbers a consumer pays, and they do not move together.
 *
 * `size` is the gzipped tarball — the download. `unpackedSize` is what lands on
 * disk and what Node reads at require time. Both were RECORDED from the first
 * commit; only the tarball was ever CHECKED, which is wrong in both directions:
 *
 *   - An unpacked regression rode in free as long as it compressed well.
 *   - A pure rename failed a release. burgee 0.4.0 moved `dist/` from flat to
 *     nested (`dist/commander-command.js` -> `dist/commander/command.js`) and
 *     grew 5.9% unpacked against 12.1% packed — gzip pays for every new path, so
 *     the gate fired on a layout change while the code grew half as much.
 *
 * Reporting both says which happened. A tarball that grows while unpacked holds
 * steady is a packaging question; both growing together is code.
 */
const DIMENSIONS = [
  { key: "size", label: "gzipped tarball" },
  { key: "unpackedSize", label: "unpacked" },
] as const;

export function sizeVerdict(
  pkg: Pkg,
  pack: PackEntry,
  baseline: Baseline,
  update: boolean,
): string[] {
  const was = baseline[pkg.name];
  if (was === undefined || update) {
    baseline[pkg.name] = { size: pack.size, unpackedSize: pack.unpackedSize };
    return [];
  }
  const problems: string[] = [];
  for (const { key, label } of DIMENSIONS) {
    const before = was[key];
    const now = pack[key];
    if (now > before * (1 + GROWTH_ALLOWED)) {
      const pct = (((now - before) / before) * PERCENT).toFixed(1);
      problems.push(
        `${pkg.name}: ${label} grew ${pct}% (${before} -> ${now} bytes); bump the baseline deliberately or trim`,
      );
      continue;
    }
    if (now < before)
      process.stdout.write(
        `  ${pkg.name}: ${label} shrank ${before} -> ${now} bytes; lower the baseline\n`,
      );
  }
  return problems;
}

function check(
  dir: string,
  pkg: Pkg,
  baseline: Baseline,
  update: boolean,
): string[] {
  const [pack] = JSON.parse(
    execFileSync("npm", ["pack", "--dry-run", "--json"], {
      cwd: dir,
      encoding: "utf8",
    }),
  ) as PackEntry[];
  if (pack === undefined) return [`${pkg.name}: npm pack produced nothing`];
  return [
    ...missingExportTargets(dir, pkg),
    ...forbiddenInPack(pkg, pack),
    ...binProblems(pkg, pack, (file) =>
      existsSync(join(dir, file))
        ? readFileSync(join(dir, file), "utf8")
        : undefined,
    ),
    ...sizeVerdict(pkg, pack, baseline, update),
  ];
}

/**
 * Read the baseline, or `undefined` when there is not one yet.
 *
 * Opened rather than stat-ed first: a check-then-act on a path this process is about to
 * write can get two different answers. Only ENOENT means "no baseline" — a corrupt file
 * throws, because silently treating it as absent would rewrite the ratchet from nothing
 * and let the next regression through, which is the one thing this script exists to stop.
 */
function readBaseline(): Baseline | undefined {
  try {
    return JSON.parse(readFileSync(BASELINE, "utf8")) as Baseline;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

function main(): void {
  const update = process.argv.includes("--update-baseline");
  const existing = readBaseline();
  const baseline: Baseline = existing ?? {};
  const problems: string[] = [];
  for (const dir of readdirSync(join(root, "packages"))) {
    const full = join(root, "packages", dir);
    // Build residue of a folded-away workspace has no package.json; skip it, do not crash.
    if (!existsSync(join(full, "package.json"))) continue;
    const pkg = JSON.parse(
      readFileSync(join(full, "package.json"), "utf8"),
    ) as Pkg;
    if (pkg.private === true) continue;
    problems.push(...check(full, pkg, baseline, update));
  }
  if (update || existing === undefined)
    writeFileSync(BASELINE, `${JSON.stringify(baseline, null, 2)}\n`);
  for (const p of problems) process.stdout.write(`✖ ${p}\n`);
  process.stdout.write(
    problems.length === 0
      ? "✓ published artifacts check out\n"
      : `${problems.length} problem(s)\n`,
  );
  process.exitCode = problems.length === 0 ? 0 : 1;
}

/*
 * Run only when invoked, not when imported. `sizeVerdict` is a pure function and its
 * lock tests it directly; without this guard, importing it ran the whole scan — which
 * needs every package BUILT, so the unit test would depend on `dist/` being present.
 */
if (
  process.argv[1] !== undefined &&
  import.meta.url.endsWith(basename(process.argv[1]))
) {
  main();
}

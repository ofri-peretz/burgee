/**
 * provedone's commands, declared once so burgee projects each to `--json`, `--schema`, `--mcp`
 * and completions (spec Design: a burgee CLI, so an agent calls it as a tool). Each handler reads
 * files and runs commands, then hands the facts to a pure module; the text a person or a model
 * reads is the least that answers the question, and `--json` carries the rest.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { defineCommand, defineProgram, UsageError } from 'burgee';

import { doneLine, doneReport, type Stamp } from './done.js';
import { decide, MODES, sessionOf, type Decision, type LogEntry, type Mode } from './gate.js';
import { checkIntent, criteria, evidenceRows, expectedExit, fillTemplate, indexDrift, missingOutput, SLUG, statusOf, unevidenced, type Finding } from './intents.js';
import { checkedLine, digest, prBlock, trailers, verdict, type Check, type Receipt, type Verdict } from './receipt.js';
import { appendLines, branchOf, gitUser, readLines, runnable, runShell, storeDir } from './store.js';

/** The installed package's version, read from the manifest beside dist/ so `--version` cannot drift. */
export const VERSION = (JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }).version;

const TEXT = Symbol.for('burgee.text');
type Data = Record<string | symbol, unknown>;
const withText = (data: Record<string, unknown>, text: string): Data => Object.assign(data, { [TEXT]: () => text });

/** A usage refusal (exit 2) whose `fix` burgee prints on its own line and puts in the envelope. */
class Refusal extends UsageError {
  constructor(
    message: string,
    readonly fix: string,
  ) {
    super(message);
  }
}

/** A runtime failure (exit 1). burgee carries `fix` only on a usage error, so it rides in the message, as oxmutate's do. */
class Failure extends Error {
  constructor(message: string, fix: string) {
    super(`${message}. fix: ${fix}`);
  }
}

const root = {
  type: 'string',
  description: 'the repository to read (default: the current directory)',
} as const;
const dir = {
  type: 'string',
  description: 'the intents directory, from the root (default .sdlc/intents)',
} as const;
const commandTimeout = {
  type: 'number',
  description: 'seconds each command may run (default 600)',
} as const;
const DEFAULT_TIMEOUT_S = 600;
const MS_PER_S = 1000;
const ISO_DATE = 10;

const rootOf = (options: { root?: string | undefined }): string => resolve(options.root ?? '');
const DEFAULT_DIR = '.sdlc/intents';
const intentsOf = (top: string, options: { dir?: string | undefined }): string => join(top, options.dir ?? DEFAULT_DIR);
/** The names a design file beside `intent.md` takes: burgee's `spec.md`, eslint's `design.md`. */
const SPEC_NAMES = ['spec.md', 'design.md'] as const;
/** The design file name the repository's `_template/` holds, else `spec.md`. */
const specNameOf = (intents: string): string => SPEC_NAMES.find((name) => existsSync(join(intents, '_template', name))) ?? 'spec.md';
const timeoutOf = (options: { commandTimeout?: number | undefined }): number => (options.commandTimeout ?? DEFAULT_TIMEOUT_S) * MS_PER_S;
const read = (file: string): string | undefined => (existsSync(file) ? readFileSync(file, 'utf8') : undefined);
const kebab = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^a-z\d]+/gu, '-')
    .replace(/^-|-$/gu, '');
const STAMPS = 'stamps.jsonl';
const GATE_LOG = 'gate.jsonl';

const newCommand = defineCommand({
  name: 'new',
  description: "Write an intent and its spec from the repository's templates",
  arguments: [{ name: 'slug', description: 'the intent, in kebab case', required: true }],
  options: {
    root,
    dir,
    owner: {
      type: 'string',
      description: 'the owner handle (default: git config user.name)',
    },
    date: {
      type: 'string',
      description: 'the opened date (default: today, UTC)',
    },
  },
  effects: 'non_idempotent',
  examples: [
    {
      command: 'provedone intent new faster-help --owner @me',
      description: 'intent.md and spec.md, from _template/',
    },
  ],
  run: async ({ args, options }) => {
    if (!SLUG.test(args.slug)) throw new Refusal(`"${args.slug}" is not a slug`, `provedone intent new ${kebab(args.slug)}`);
    const top = rootOf(options);
    const intents = intentsOf(top, options);
    const target = join(intents, args.slug);
    if (existsSync(target)) throw new Failure(`${target} already exists`, `edit ${join(target, 'intent.md')}, or pick another slug`);
    const templates = ['intent.md', specNameOf(intents)].map((name) => [name, read(join(intents, '_template', name))] as const);
    const missing = templates.find(([, text]) => text === undefined);
    if (missing !== undefined) throw new Failure(`no template ${join(intents, '_template', missing[0])}`, `add _template/${missing[0]} under ${intents}`);
    const date = options.date ?? new Date().toISOString().slice(0, ISO_DATE);
    const owner = options.owner ?? (await gitUser(top)) ?? 'owner';
    mkdirSync(target, { recursive: true });
    const written = templates.map(([name, text]) => {
      writeFileSync(join(target, name), fillTemplate(text as string, date, owner));
      return join(target, name);
    });
    return withText({ changed: true, written }, written.join('\n'));
  },
});

interface Rerun {
  readonly intent: string;
  readonly criterion: string;
  readonly command: string;
  readonly exit: number;
  readonly expected: number;
  readonly missing: readonly string[];
}

interface Evidence {
  readonly reruns: Rerun[];
  readonly notRerun: { intent: string; criterion: string }[];
}

/** Re-run every evidence row of every shipped intent whose command is one plain shell command (spec R3). */
const rerunEvidence = async (texts: ReadonlyMap<string, string>, top: string, timeoutMs: number): Promise<Evidence> => {
  const evidence: Evidence = { reruns: [], notRerun: [] };
  for (const [slug, text] of texts) {
    if (statusOf(text) !== 'shipped') continue;
    for (const row of evidenceRows(text)) {
      if (row.command === undefined || !runnable(row.command, top)) evidence.notRerun.push({ intent: slug, criterion: row.criterion });
      else {
        // eslint-disable-next-line reliability/no-await-in-loop -- one at a time: evidence commands share the tree and the machine, and a recorded output was measured alone
        const ran = await runShell(row.command, top, timeoutMs);
        evidence.reruns.push({
          intent: slug,
          criterion: row.criterion,
          command: row.command,
          exit: ran.exit,
          expected: expectedExit(row.output),
          missing: missingOutput(row.output, ran.output),
        });
      }
    }
  }
  return evidence;
};

const staleLine = (r: Rerun): string =>
  `${r.intent}: \`${r.command}\` ${r.exit === r.expected ? `no longer prints ${r.missing.map((m) => `\`${m}\``).join(', ')}` : `exits ${String(r.exit)}, recorded ${String(r.expected)}`}. fix: re-run it and update the evidence row, or restore what it proved`;

const checkCommand = defineCommand({
  name: 'check',
  description: "Check every intent against the rules; with --evidence, re-run each shipped intent's evidence commands",
  options: {
    root,
    dir,
    evidence: {
      type: 'boolean',
      description: 're-run every evidence row whose command is one plain shell command',
    },
    commandTimeout,
  },
  effects: 'read_only',
  examples: [
    {
      command: 'provedone intent check',
      description: 'one line per broken rule, each with a fix',
    },
    {
      command: 'provedone intent check --evidence --json',
      description: 'the re-runs too, and every row that could not be re-run',
    },
  ],
  run: async ({ options }) => {
    const top = rootOf(options);
    const intents = intentsOf(top, options);
    if (!existsSync(intents)) throw new Failure(`no intents directory at ${intents}`, 'run `provedone intent new <slug>` after adding _template/, or pass --dir');
    const slugs = readdirSync(intents, { withFileTypes: true })
      .filter((e) => e.isDirectory() && e.name !== '_template')
      .map((e) => e.name)
      .sort();
    const texts = new Map(slugs.map((slug) => [slug, read(join(intents, slug, 'intent.md')) ?? ''] as const));
    const fallback = specNameOf(intents);
    const findings: Finding[] = [
      ...slugs.flatMap((slug) => {
        const spec = SPEC_NAMES.find((name) => existsSync(join(intents, slug, name))) ?? fallback;
        return checkIntent(slug, texts.get(slug) as string, read(join(intents, slug, spec)), { dir: options.dir ?? DEFAULT_DIR, spec });
      }),
      ...indexDrift(read(join(intents, 'README.md')) ?? '', new Map(slugs.map((slug) => [slug, statusOf(texts.get(slug) as string)]))),
    ];
    const noEvidence = slugs.filter((slug) => unevidenced(texts.get(slug) as string));
    const asked = options.evidence === true;
    const { reruns, notRerun } = asked ? await rerunEvidence(texts, top, timeoutOf(options)) : { reruns: [], notRerun: [] };
    const stale = reruns.filter((r) => r.exit !== r.expected || r.missing.length > 0);
    const problems = findings.length + stale.length;
    const lines = [
      ...findings.map((f) => `${f.intent}: ${f.message}. fix: ${f.fix}`),
      ...stale.map(staleLine),
      `${String(slugs.length)} intents, ${String(problems)} problems, ${String(noEvidence.length)} shipped with no evidence${asked ? `, ${String(reruns.length)} re-run, ${String(notRerun.length)} not re-run` : ''}`,
    ];
    return withText(
      {
        exitCode: problems > 0 ? 1 : 0,
        intents: slugs.length,
        findings,
        noEvidence,
        reruns,
        notRerun,
      },
      lines.join('\n'),
    );
  },
});

const intentCommand = defineCommand({
  name: 'intent',
  description: 'Write intents, and check them and their evidence',
  commands: [newCommand, checkCommand],
});

interface StampOptions {
  readonly run?: string[] | undefined;
  readonly notChecked?: string[] | undefined;
  readonly none?: string | undefined;
  readonly intent?: string | undefined;
  readonly criterion?: number | undefined;
}

/** The refusals of `stamp`, before anything runs (spec R4: the not-checked list is required). */
const refuseStamp = (options: StampOptions): void => {
  const runs = options.run ?? [];
  if (options.none === undefined && runs.length === 0) throw new Refusal('nothing to stamp', 'provedone stamp --run "<command>" --not-checked "<gap>", or provedone stamp --none "<reason>"');
  if (options.none !== undefined && runs.length > 0) throw new Refusal('--none and --run together', 'drop --none: the commands are the receipt');
  if (options.none === undefined && (options.notChecked ?? []).length === 0) throw new Refusal('no --not-checked', 'add --not-checked "<what you did not check>", or --not-checked nothing');
  if ((options.criterion === undefined) !== (options.intent === undefined)) throw new Refusal('--intent and --criterion go together', 'pass both, or neither');
};

const stampCommand = defineCommand({
  name: 'stamp',
  description: 'Run the commands that prove a change and print its receipt: Verified-by: trailers, or the PR block with --pr',
  options: {
    run: {
      type: 'string',
      multiple: true,
      separator: false,
      description: 'a command that proves the change; run here, its exit code and output digest recorded',
    },
    capture: {
      type: 'string',
      multiple: true,
      description: 'a screenshot or terminal capture of the running app, by path',
    },
    notChecked: {
      type: 'string',
      multiple: true,
      separator: false,
      description: 'what was not checked; required, "nothing" when nothing',
    },
    none: {
      type: 'string',
      description: 'stamp the change unverified, and say why',
    },
    intent: {
      type: 'string',
      description: 'the intent this proves, for `provedone done`',
    },
    criterion: {
      type: 'number',
      description: 'the success criterion of --intent this proves, from 1',
    },
    pr: {
      type: 'boolean',
      description: 'print the PR "How this was checked" block instead of the trailers',
    },
    root,
    commandTimeout,
  },
  effects: 'non_idempotent',
  examples: [
    {
      command: 'provedone stamp --run "npm test" --not-checked "the docs site"',
      description: 'two trailers to paste into the commit message',
    },
    {
      command: 'provedone stamp --none "comment-only change"',
      description: 'Verified-by: none, with its reason',
    },
    {
      command: 'provedone stamp --intent faster-help --criterion 2 --run "npm run bench" --not-checked nothing --pr',
      description: 'evidence for criterion 2, as a PR block',
    },
  ],
  run: async ({ options }) => {
    refuseStamp(options);
    const top = rootOf(options);
    const branch = await branchOf(top);
    const at = new Date().toISOString();
    const checks: Check[] = [];
    for (const command of options.run ?? []) {
      // eslint-disable-next-line reliability/no-await-in-loop -- in the order given: `npm run build` before the test that reads dist/, as the person typed them
      const ran = await runShell(command, top, timeoutOf(options));
      checks.push({ command, exit: ran.exit, digest: digest(ran.output) });
    }
    const notChecked = (options.notChecked ?? []).filter((gap) => gap !== 'nothing');
    const receipt: Receipt = {
      checks,
      captures: options.capture ?? [],
      notChecked,
      ...(options.none === undefined ? {} : { none: options.none }),
    };
    const cited = options.intent === undefined ? {} : { intent: options.intent, criterion: options.criterion as number };
    appendLines(
      join(await storeDir(top), STAMPS),
      checks.map((c): Stamp => ({ branch, at, ...c, ...cited })),
    );
    const failed = checks.filter((c) => c.exit !== 0);
    const text = options.pr === true ? prBlock(receipt) : trailers(receipt).join('\n');
    const warning = failed.length > 0 ? `\nerror: ${failed.map((c) => `\`${c.command}\` exited ${String(c.exit)}`).join(', ')}\nfix: make it pass and stamp again; a failing command is not a receipt` : '';
    return withText(
      {
        exitCode: failed.length > 0 ? 1 : 0,
        changed: true,
        receipt,
        trailers: trailers(receipt),
        checked: checkedLine(receipt),
        pr: prBlock(receipt),
      },
      `${text}${warning}`,
    );
  },
});

const gateText = (v: Verdict, decision: Decision, mode: Mode): string => {
  if (v.ok) return `provedone: ${v.reason}`;
  if (decision.bypass) return `provedone: ${v.reason}; passed after two blocks in this session, logged. fix: ${String(v.fix)}`;
  return `provedone${mode === 'observe' ? ' (observe, not blocking)' : ''}: ${v.reason}. fix: ${String(v.fix)}`;
};

const modeOf = (asked: Mode | undefined, env: Readonly<Record<string, string | undefined>>): Mode => {
  const fromEnv = env['PROVEDONE_MODE'] as Mode;
  return asked ?? (MODES.includes(fromEnv) ? fromEnv : 'observe');
};

const gateCommand = defineCommand({
  name: 'gate',
  description: 'Pass or block a commit message or PR body on its receipt: off, observe (log only) or enforce',
  arguments: [
    {
      name: 'file',
      description: 'the commit message or PR body; lefthook passes {1}',
      required: true,
    },
  ],
  options: {
    mode: {
      type: 'string',
      choices: MODES,
      description: 'off, observe or enforce (default: PROVEDONE_MODE, else observe)',
    },
    root,
  },
  effects: 'non_idempotent',
  examples: [
    {
      command: 'provedone gate .git/COMMIT_EDITMSG',
      description: 'observe: always passes, logs what enforce would block',
    },
    {
      command: 'provedone gate pr-body.md --mode enforce',
      description: 'blocks a PR body with no receipt',
    },
  ],
  run: async ({ args, options, env }) => {
    const mode = modeOf(options.mode, env);
    if (mode === 'off') return withText({ mode, ok: true, blocked: false, bypass: false }, 'provedone: off');
    const message = read(resolve(args.file));
    if (message === undefined) throw new Refusal(`no file ${args.file}`, 'pass the commit message file, as lefthook does with {1}');
    const top = rootOf(options);
    const v = verdict(message);
    const logFile = join(await storeDir(top), GATE_LOG);
    const session = sessionOf(env, await branchOf(top));
    const decision = decide(mode, v, readLines<LogEntry>(logFile), session);
    appendLines(logFile, [
      {
        at: new Date().toISOString(),
        session,
        mode,
        ok: v.ok,
        ...decision,
        reason: v.reason,
      } satisfies LogEntry,
    ]);
    return withText({ exitCode: decision.blocked ? 1 : 0, mode, ...v, ...decision }, gateText(v, decision, mode));
  },
});

const doneCommand = defineCommand({
  name: 'done',
  description: "Fail unless every success criterion of an intent has a passing command stamped on this branch; print the PR's Checked: line",
  arguments: [{ name: 'slug', description: 'the intent the PR cites', required: true }],
  options: { root, dir },
  effects: 'read_only',
  examples: [
    {
      command: 'provedone done faster-help',
      description: 'the Checked: line, or one fix per criterion with no evidence',
    },
  ],
  run: async ({ args, options }) => {
    const top = rootOf(options);
    const intent = read(join(intentsOf(top, options), args.slug, 'intent.md'));
    if (intent === undefined) throw new Failure(`no intent ${args.slug}`, `provedone intent new ${args.slug}`);
    const list = criteria(intent);
    if (list.length === 0) throw new Failure(`${args.slug} lists no success criteria`, 'add `- ` items under its `## Success criteria`');
    const report = doneReport({
      slug: args.slug,
      criteria: list,
      rows: evidenceRows(intent),
      stamps: readLines<Stamp>(join(await storeDir(top), STAMPS)),
      branch: await branchOf(top),
    });
    const open = report.filter((r) => r.fix !== undefined);
    const line = doneLine(report);
    return withText(
      {
        exitCode: open.length > 0 ? 1 : 0,
        intent: args.slug,
        criteria: report,
        checked: line,
      },
      [line, ...open.map((r) => `C${String(r.n)} has no evidence. fix: ${String(r.fix)}`)].join('\n'),
    );
  },
});

export const program = defineProgram({
  name: 'provedone',
  version: VERSION,
  description: 'Every change says how it was verified, and a gate reads it',
  commands: [stampCommand, gateCommand, doneCommand, intentCommand],
});

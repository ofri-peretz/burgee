/**
 * The rules of `scripts/intent-artifacts-lock.test.ts` (spec R2), as data any repository can run:
 * each finding names the intent, the rule and the `fix:`. Pure: the caller reads the files.
 */
import { codeSpans, items, section, tableRows } from './markdown.js';

export const STATUSES = ['draft', 'review', 'approved', 'shipped', 'dropped'] as const;
export const INTENT_SECTIONS = ['## What is wanted', '## Why now', '## Constraints'] as const;
export const SUCCESS_HEADINGS = ['Success criteria', 'How we will know it worked'] as const;
export const REJECTION = /^## (Rejected\b|Explicit non-goals|Non-goals|Out of scope|Risks and rejected)/mu;
/** Where a shipped intent records how it was checked: a heading, or an evidence table. */
export const EVIDENCE = /^## (Shipped|Restated)\b|^\| *Criterion *\|/mu;

export interface Finding {
  readonly intent: string;
  readonly rule: string;
  readonly message: string;
  readonly fix: string;
}

/** The status an intent's header declares, or undefined. */
export const statusOf = (intent: string): string | undefined => /^\*\*Status:\*\*\s*([a-z]+)/mu.exec(intent)?.[1];

/** Every finding for one intent: its `intent.md` text and, when it has one, its `spec.md` text. */
export const checkIntent = (slug: string, intent: string, spec: string | undefined): Finding[] => {
  const found: Finding[] = [];
  const add = (rule: string, message: string, fix: string): void => {
    found.push({ intent: slug, rule, message, fix });
  };
  if (!/^# Intent — \S/mu.test(intent)) add('title', 'no `# Intent — <title>` line', 'make the first line `# Intent — <short title>`');
  const status = statusOf(intent);
  if (!(STATUSES as readonly (string | undefined)[]).includes(status)) {
    add('status', `unknown or missing status "${String(status)}"`, `write \`**Status:** <${STATUSES.join('|')}>\` under the title`);
  }
  for (const heading of INTENT_SECTIONS) if (!intent.includes(heading)) add('section', `lacks ${heading}`, `add a \`${heading}\` section`);
  if (section(intent, SUCCESS_HEADINGS) === undefined) add('success', 'no `## Success criteria`', 'add `## Success criteria`: each line checkable by a person or a command');
  if ((status === 'approved' || status === 'shipped') && spec === undefined) {
    add('spec', `is "${String(status)}" but has no spec.md`, `write .sdlc/intents/${slug}/spec.md, or set the status back to review`);
  }
  if (spec !== undefined && !REJECTION.test(spec)) add('rejected', 'spec.md records nothing rejected', 'add `## Rejected alternatives` or `## Out of scope` to spec.md');
  return found;
};

/** True when a shipped intent records no evidence: no `## Shipped`, no `## Restated`, no evidence table. */
export const unevidenced = (intent: string): boolean => statusOf(intent) === 'shipped' && !EVIDENCE.test(intent);

/** One finding per index row of `readme` whose status cell disagrees with the intent's own header. */
export const indexDrift = (readme: string, statuses: ReadonlyMap<string, string | undefined>): Finding[] =>
  [...statuses].flatMap(([slug, real]) =>
    readme
      .split('\n')
      .filter((line) => line.startsWith('|') && line.includes(`[\`${slug}/\`]`))
      .flatMap((row) => {
        const shown = (row.split('|').at(-2) as string).trim();
        return (STATUSES as readonly string[]).includes(shown) && shown !== real
          ? [
              {
                intent: slug,
                rule: 'index',
                message: `the index says "${shown}", the intent says "${String(real)}"`,
                fix: `set the index row's status to "${String(real)}"`,
              },
            ]
          : [];
      }),
  );

/** The success criteria of an intent, in order, numbered from 1. */
export const criteria = (intent: string): string[] => {
  const body = section(intent, SUCCESS_HEADINGS);
  return body === undefined ? [] : items(body);
};

/** Criterion, command, output: a row with fewer cells is not evidence. */
const EVIDENCE_CELLS = 3;

export interface EvidenceRow {
  readonly criterion: string;
  readonly command: string | undefined;
  readonly output: string;
}

/**
 * Each row of an evidence table (`| Criterion | Command… | Output |`). `command` is set only when
 * the cell is one code span and nothing else: a plain shell command (spec R3). Anything with prose
 * around it is a description of what ran, which cannot be re-run, and says so as `undefined`.
 */
export const evidenceRows = (intent: string): EvidenceRow[] =>
  tableRows(intent, 'Criterion')
    .filter((row) => row.length >= EVIDENCE_CELLS)
    .map((row) => {
      const [criterion, command, output] = row as [string, string, string];
      return { criterion, command: /^`[^`]+`$/u.test(command) ? codeSpans(command)[0] : undefined, output };
    });

/** The exit code an output cell records (`exit 2`), else 0. */
export const expectedExit = (output: string): number => Number(/\bexit (\d+)\b/u.exec(output)?.[1] ?? 0);

/** The code spans of an output cell that the re-run's output no longer contains. */
export const missingOutput = (output: string, actual: string): string[] => codeSpans(output).filter((span) => !actual.includes(span));

/** The `<YYYY-MM-DD>` and `<handle>` of a template, filled. */
export const fillTemplate = (template: string, date: string, owner: string): string => template.replaceAll('<YYYY-MM-DD>', date).replaceAll('<handle>', owner);

/** A slug `intent new` accepts: lowercase words joined by `-`. */
export const SLUG = /^[a-z\d]+(?:-[a-z\d]+)*$/u;

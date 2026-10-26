/**
 * `localised-human-surfaces` R1 — the catalog and the strings the engine prints are one set.
 *
 * English is printed from its call sites and never from `messages.ts` (that file says why), so
 * the two copies are held together here, read from the syntax tree of the files that write
 * them:
 *
 *   - **every catalog template is written somewhere**, with each `{name}` standing where the
 *     call site interpolates: an entry that differs from today's string by one character fails;
 *   - **every usage error and hint the engine writes has an entry**: the message and hint of
 *     each `new UsageError(…)` / `new ConfigError(…)`, and each `hint:` and `message:` a
 *     failure is built from. A new one written without an entry fails, so a pack can never fall
 *     silently behind the engine.
 */
import { readFileSync } from 'node:fs';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import { MESSAGES } from './messages.js';

/** The engine's files that write a human string; the front-ends are graded and stay out (R1). */
const WRITERS = [
  'execute.ts',
  'failure.ts',
  'fields.ts',
  'formats.ts',
  'globals.ts',
  'help.ts',
  'init.ts',
  'parse-refusals.ts',
  'relations.ts',
  'root-help.ts',
  'schema-surface.ts',
  'stdin-dash.ts',
  'surfaces.ts',
  'typed-args.ts',
  'unknown-option.ts',
  'usage.ts',
  'validate.ts',
];

/**
 * Entries whose English is assembled rather than written whole: the engine lower-cases
 * `suggestSimilar`'s `(Did you mean one of …?)` into this hint (`surfaces.ts`), so its words
 * are in `suggest.ts`, which is commander's port and graded as it is.
 */
const ASSEMBLED = new Set(['hint.didYouMeanOneOf']);

/** A call-site literal with every interpolation as `{}`, the shape a template is compared in. */
function shapeOf(node: ts.Node): string | undefined {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isTemplateExpression(node)) return [node.head.text, ...node.templateSpans.map((s) => `{}${s.literal.text}`)].join('');
  return undefined;
}

const templateShape = (template: string): string => template.replaceAll(/\{\w+\}/gu, '{}');

interface Written {
  /** Every literal in the file, as shapes. */
  all: Set<string>;
  /** The literals a failure is built from: UsageError/ConfigError arguments, `hint:`, `message:`. */
  failures: { file: string; shape: string }[];
}

function read(): Written {
  const all = new Set<string>();
  const failures: Written['failures'] = [];
  for (const file of WRITERS) {
    const source = ts.createSourceFile(file, readFileSync(new URL(file, import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
    const branches = (node: ts.Node): ts.Node[] => (ts.isConditionalExpression(node) ? [...branches(node.whenTrue), ...branches(node.whenFalse)] : [node]);
    const failure = (node: ts.Node): void => {
      for (const branch of branches(node)) {
        const shape = shapeOf(branch);
        if (shape !== undefined && shape !== '') failures.push({ file, shape });
      }
    };
    const visit = (node: ts.Node): void => {
      const shape = shapeOf(node);
      if (shape !== undefined) all.add(shape);
      if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && ['UsageError', 'ConfigError'].includes(node.expression.text)) for (const arg of node.arguments ?? []) failure(arg);
      if (ts.isPropertyAssignment(node) && ts.isIdentifier(node.name) && ['hint', 'message'].includes(node.name.text)) failure(node.initializer);
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return { all, failures };
}

const written = read();

/** A template as the pattern its English instances match, so a literal hint (`did you mean --json?`) is an instance of one. */
const pattern = (template: string): RegExp => new RegExp(`^${template.replaceAll(/[.*+?^$()|[\]\\]/gu, '\\$&').replaceAll(/\\?\{\w+\\?\}/gu, '.+')}$`, 'u');

describe('the catalog (R1)', () => {
  it('writes every template where it is used, to the character', () => {
    const missing = Object.entries(MESSAGES).filter(([id, template]) => !ASSEMBLED.has(id) && !written.all.has(templateShape(template)));
    expect(missing).toEqual([]);
  });

  it('has an entry for every usage error and hint the engine writes', () => {
    const shapes = Object.values(MESSAGES).map(templateShape);
    const templates = Object.values(MESSAGES).map(pattern);
    const uncatalogued = written.failures.filter(({ shape }) => !shapes.includes(shape) && !templates.some((p) => p.test(shape)) && !COMMANDS.some((p) => p.test(shape)));
    expect(uncatalogued).toEqual([]);
  });

  it('names each placeholder once, as a word', () => {
    for (const template of Object.values(MESSAGES)) {
      const names = [...template.matchAll(/\{(\w+)\}/gu)].map((m) => m[1]);
      expect(new Set(names).size).toBe(names.length);
    }
  });
});

/**
 * Failure text that is not a sentence of the engine's, so never translated: a hint that is a
 * command line, run as typed (`completion bash|zsh|fish|pwsh|fig`), and a refused locale pack's
 * message, which is the family's code before the plugin host's own words (R4).
 */
const COMMANDS = [/^completion \{\}\|fig$/u, /^\{\} \{\}$/u];

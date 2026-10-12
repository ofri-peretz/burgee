/**
 * `localised-human-surfaces` R6 — caique's catalog and the chrome it writes are one set: every
 * template is written where it is used, to the character, so a pack can never fall behind the
 * English it is matched against. Read from the syntax tree of the files that write them.
 */
import { readFileSync } from 'node:fs';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import { MESSAGES } from './messages.js';

/** The native chrome; the clack and inquirer façades are graded and stay out. */
const WRITERS = ['ask.ts', 'binding.ts', 'decide.ts'];

/** A call-site literal with every interpolation as `{}`. */
function shapeOf(node: ts.Node): string | undefined {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isTemplateExpression(node)) return [node.head.text, ...node.templateSpans.map((s) => `{}${s.literal.text}`)].join('');
  return undefined;
}

const written = new Set<string>();

function visit(node: ts.Node): void {
  const shape = shapeOf(node);
  if (shape !== undefined) written.add(shape);
  ts.forEachChild(node, visit);
}

for (const file of WRITERS) visit(ts.createSourceFile(file, readFileSync(new URL(file, import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true));

/**
 * `decide()` assembles its no-terminal refusal from three parts: the condition, then the
 * `--interactive` clause when the caller asked for one. These four templates are the four
 * sentences it can produce, so each is held to its parts rather than to one literal.
 */
const ASSEMBLED: Record<string, string[]> = {
  'caique.requiredNobody': ['{} is required when {}{}', 'nobody is there to answer'],
  'caique.requiredNobodyAsked': ['{} is required when {}{}', 'nobody is there to answer', ' (--interactive needs {})', 'a person, and CI or an agent is driving this'],
  'caique.requiredNoTerminal': ['{} is required when {}{}', 'there is no terminal'],
  'caique.requiredNoTerminalAsked': ['{} is required when {}{}', 'there is no terminal', ' (--interactive needs {})', 'a terminal on stdin'],
};

describe('caique’s catalog (R6)', () => {
  it('writes every template where it is used, to the character', () => {
    const missing = Object.entries(MESSAGES).filter(([id, template]) => {
      const parts = ASSEMBLED[id];
      if (parts !== undefined) return !parts.every((p) => written.has(p));
      return !written.has(template.replaceAll(/\{\w+\}/gu, '{}'));
    });
    expect(missing).toEqual([]);
  });

  it('keeps every id under caique., so one pack can carry another package’s messages beside these', () => {
    expect(Object.keys(MESSAGES).filter((id) => !id.startsWith('caique.'))).toEqual([]);
  });
});

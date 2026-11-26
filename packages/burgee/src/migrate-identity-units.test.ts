/**
 * U12-4 at the level of one file: which imports stay on an incumbent another dependency still
 * installs, the names each target's classes are listed under, and the note each one carries,
 * word for word. `migrate-u12.test.ts` holds the same rule over a whole project.
 */
import { describe, expect, it } from 'vitest';

import { FACADE_EXPORTS, MAPPING, rewriteSource } from './migrate.js';

const through = (from: string, deps: string[] = ['dep']): ReadonlyMap<string, readonly string[]> => new Map([[from, deps]]);
const kept = (source: string, from: string, deps?: string[]): unknown => rewriteSource(source, new Set(), through(from, deps)).kept;

describe('the classes each target cannot share', () => {
  it.each([
    ['commander', ['CommanderError', 'InvalidArgumentError', 'InvalidOptionArgumentError']],
    ['@commander-js/extra-typings', ['CommanderError', 'InvalidArgumentError', 'InvalidOptionArgumentError']],
    ['yargs', ['YError']],
    ['@inquirer/core', ['AbortPromptError', 'CancelPromptError', 'ExitPromptError', 'HookError', 'ValidationError']],
    ['ansi-escapes', ['CapabilityError']],
    ['term-img', ['UnsupportedTerminalError']],
    ['cosmiconfig', ['ConfigError', 'LoaderError']],
  ])('keeps a namespace import of %s for %j', (from, names) => {
    expect(kept(`import * as m from '${from}';\n`, from)).toMatchObject([{ names }]);
  });

  it('moves an unreadable import of an incumbent whose target lists no class', () => {
    expect(kept("import * as c from 'chalk';\n", 'chalk')).toEqual([]);
  });

  it('moves a mock, which binds nothing', () => {
    expect(kept("vi.mock('@inquirer/core');\n", '@inquirer/core')).toEqual([]);
  });
});

const tail = (deps: string, classes: string): string => `${deps} still throws the '@inquirer/core' ${classes}, which caique/inquirer's are not instanceof, so this import stays on '@inquirer/core'`;

describe('the note a kept import carries', () => {
  it('names one class, and every dependency that installs the incumbent', () => {
    expect(kept("import { ExitPromptError } from '@inquirer/core';\n", '@inquirer/core', ['a', 'b'])).toMatchObject([{ note: `ExitPromptError: ${tail('a, b', 'class')}` }]);
  });

  it('names two classes in the plural', () => {
    expect(kept("import { ExitPromptError, HookError } from '@inquirer/core';\n", '@inquirer/core', ['a'])).toMatchObject([{ note: `ExitPromptError, HookError: ${tail('a', 'classes')}` }]);
  });

  it('says an unreadable import may name every class', () => {
    expect(kept("import * as core from '@inquirer/core';\n", '@inquirer/core', ['a'])).toMatchObject([
      { note: `this import may name AbortPromptError, CancelPromptError, ExitPromptError, HookError, ValidationError: ${tail('a', 'classes')}` },
    ]);
  });

  it('keeps a type-only import of names the target lacks, and says so', () => {
    expect(rewriteSource("import type { Nope, Nah } from 'commander';\n").kept).toEqual([
      { line: 1, specifier: 'commander', names: ['Nope', 'Nah'], note: "burgee/commander does not export Nope, Nah; this type-only import stays on 'commander', so keep its types installed" },
    ]);
  });
});

describe('a sibling whose state the incumbent reads', () => {
  it('is no business of a file that rewrites no such incumbent', () => {
    expect(rewriteSource("import { x } from '@clack/core';\nimport chalk from 'chalk';\n").refused).toEqual([]);
  });
});

describe('the export tables', () => {
  it('list every target an incumbent moves to', () => {
    expect([...new Set(Object.values(MAPPING))].filter((to) => FACADE_EXPORTS[to] === undefined)).toEqual([]);
  });
});

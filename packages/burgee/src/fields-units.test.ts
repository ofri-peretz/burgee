/**
 * `--json=<fields>` piece by piece: the declaration it trusts, the refusals it names, and the
 * fields it picks from a result.
 */
import { describe, expect, it } from 'vitest';

import { listFields, checkFields, jsonFields, selectFields } from './fields.js';
import { type CommandNode } from './manifest.js';

const node = (fields?: string[]): CommandNode => ({ path: ['app', 'remote', 'add'], options: {}, ...(fields === undefined ? {} : { fields }) });

describe('--json=<fields>, piece by piece', () => {
  it('refuses a declaration with any empty name, naming the command as typed', () => {
    for (const bad of [[''], ['a', '']]) expect(() => listFields(node(bad))).toThrow(`burgee: command "remote add" declares fields ${JSON.stringify(bad)}; declare distinct, non-empty names without commas`);
    expect(() => listFields(node(['a', 'b,c']))).toThrow(/declares fields/);
  });

  it('lists the declared fields as a success, and refuses a command with none in its own words', () => {
    expect(listFields(node(['a', 'b']))).toEqual({ ok: true, data: { fields: ['a', 'b'] }, meta: {} });
    expect(() => listFields(node())).toThrow(expect.objectContaining({ message: '"remote add" declares no fields to list', hint: 'run "remote add --json" to see its whole result' }));
  });

  it('says field for one unknown name and fields for two', () => {
    expect(() => checkFields(['x'], node(['a']))).toThrow(expect.objectContaining({ message: 'unknown field "x"', hint: 'valid fields: a' }));
    expect(() => checkFields(['x', 'y'], node(['a']))).toThrow(expect.objectContaining({ message: 'unknown fields "x", "y"' }));
  });

  it('picks only the fields a row has, and reads no field off a list inside a list', () => {
    expect(selectFields([{ a: 1 }, { b: 2 }], ['a'])).toStrictEqual([{ a: 1 }, {}]);
    expect(() => selectFields([[1]], ['0'])).toThrow(/unknown field "0"/);
  });

  it('trims the names typed after --json=', () => {
    expect(jsonFields(['--json= a , b'], node(['a', 'b']), []).fields).toEqual(['a', 'b']);
  });
});

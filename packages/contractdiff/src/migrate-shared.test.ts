import { describe, expect, it } from 'vitest';

import { camel, commandParts, configText, editScripts, finding, placeOf, scripts } from './migrate-shared.js';

describe('scripts', () => {
  it('reads the string scripts and nothing else', () => {
    expect(scripts({ 'package.json': '{"scripts":{"a":"x","b":1}}' })).toEqual({ a: 'x' });
    expect(scripts({ 'package.json': '{"scripts":"x"}' })).toEqual({});
    expect(scripts({ 'package.json': '{"scripts":null}' })).toEqual({});
    expect(scripts({ 'package.json': 'nope' })).toEqual({});
    expect(scripts({})).toEqual({});
  });
});

describe('editScripts', () => {
  const text = '{\n  "scripts": {\n    "a": "old a",\n    "b": "old b"\n  }\n}\n';

  it('rewrites each script in place and keeps the rest of the text', () => {
    expect(editScripts({ 'package.json': text }, { a: 'new a', b: 'new "b"' })).toEqual({
      edits: [{ path: 'package.json', before: text, after: '{\n  "scripts": {\n    "a": "new a",\n    "b": "new \\"b\\""\n  }\n}\n' }],
      findings: [],
    });
  });

  it('edits nothing when nothing is replaced, or there is no package.json', () => {
    expect(editScripts({ 'package.json': text }, {})).toEqual({ edits: [], findings: [] });
    expect(editScripts({}, {})).toEqual({ edits: [], findings: [] });
  });
});

it('turns kebab-case into camelCase, and leaves the rest', () => {
  expect(camel('root-types-no-schema-prefix')).toBe('rootTypesNoSchemaPrefix');
  expect(camel('enum')).toBe('enum');
  expect(camel('a-1')).toBe('a-1');
});

it('writes a config as two-space JSON with a final newline', () => {
  expect(configText({ input: 'a', targets: {} })).toBe('{\n  "input": "a",\n  "targets": {}\n}\n');
});

it('builds a finding', () => {
  expect(finding('c', 'p', 'm', 'f')).toEqual({ code: 'c', pointer: 'p', message: 'm', fix: 'f' });
});

it('splits a command at its separators, keeping them with their spaces', () => {
  expect(commandParts('a && b||c ;d | e&&f')).toEqual(['a', ' && ', 'b', '||', 'c', ' ;', 'd', ' | ', 'e', '&&', 'f']);
  expect(commandParts('one')).toEqual(['one']);
});

describe('placeOf', () => {
  it('gives the folder of a file, and a folder as it is', () => {
    expect(placeOf('src/api/types.ts')).toEqual({ out: 'src/api', file: 'src/api/types.ts' });
    expect(placeOf('./v1.d.ts')).toEqual({ out: '.', file: './v1.d.ts' });
    expect(placeOf('schema.ts')).toEqual({ out: '.', file: 'schema.ts' });
    expect(placeOf('src/generated')).toEqual({ out: 'src/generated', file: undefined });
    // A dot in a folder name is not a file's: only the last segment is read.
    expect(placeOf('src/v1.0/api')).toEqual({ out: 'src/v1.0/api', file: undefined });
    expect(placeOf('.')).toEqual({ out: '.', file: undefined });
    // The extension is the name's last part: a name that ends in a dot has none.
    expect(placeOf('src/api.v2.')).toEqual({ out: 'src/api.v2.', file: undefined });
  });
});

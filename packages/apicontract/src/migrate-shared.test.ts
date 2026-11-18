import { describe, expect, it } from 'vitest';

import { camel, commandParts, configText, editScripts, finding, scripts } from './migrate-shared.js';

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

/**
 * Bundling: a document whose `$ref`s name other files, read from where it lives, as one document.
 * openapi-typescript 7 bundles with Redocly before it generates; this does what that bundler does
 * to the files a document reaches, so the generated types are the ones upstream prints:
 *
 * - A reference to a schema, parameter, response, request body, header, example, link, callback or
 *   security scheme (Swagger 2.0: definition, parameter, response) is hoisted into the document's
 *   components and the `$ref` points there. Anything else, a path item among them, is written in place.
 * - The hoisted member is named by the last token of the pointer it came from (`#/definitions/Pet`
 *   gives `Pet`), then by more tokens joined with `-` when that name is taken by something else, then
 *   by the file's name (`pet_Pet`), then with `-2`, `-3`…; a reference to a whole file is named by
 *   the file (`./pet.yaml` gives `pet`). A member already in the document under that name with the
 *   same content is reused, and one that is itself a `$ref` to the same target is replaced by it.
 * - The members are added after the document's own, in the order their references are left, so a
 *   member a hoisted one refers to comes before it.
 *
 * A file that is not there, a pointer that leads nowhere in it and a remote address are refused
 * with a `fix:` line naming them. A document with no reference into another file is returned as given.
 */
import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, extname, relative, resolve } from 'node:path';

import { parse as parseYaml } from 'seniority/yaml';

import { type Dict, dict, isDict } from './gen-ts-dict.js';
import { GenerateError } from './gen-ts-index.js';
import { childPath, pointerOf } from './gen-ts-ref.js';

// The members that hold other objects, by the kind of the object holding them. `*` before a kind
// is a map of that kind; an array is read as a list of the kind it is given.
const CHILDREN: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  root: { paths: '*pathItem', webhooks: '*pathItem', components: 'components', definitions: '*schema', parameters: '*parameter', responses: '*response' },
  components: {
    schemas: '*schema',
    parameters: '*parameter',
    responses: '*response',
    requestBodies: '*requestBody',
    headers: '*header',
    examples: '*example',
    links: '*link',
    callbacks: '*callback',
    pathItems: '*pathItem',
    securitySchemes: '*securityScheme',
  },
  pathItem: { get: 'operation', put: 'operation', post: 'operation', delete: 'operation', options: 'operation', head: 'operation', patch: 'operation', trace: 'operation', parameters: 'parameter' },
  operation: { parameters: 'parameter', requestBody: 'requestBody', responses: '*response', callbacks: '*callback' },
  callback: { '*': 'pathItem' },
  parameter: { schema: 'schema', items: 'schema', content: '*mediaType', examples: '*example' },
  header: { schema: 'schema', content: '*mediaType', examples: '*example' },
  requestBody: { content: '*mediaType' },
  response: { schema: 'schema', headers: '*header', content: '*mediaType', links: '*link' },
  mediaType: { schema: 'schema', examples: '*example', encoding: '*encoding' },
  encoding: { headers: '*header' },
  schema: {
    properties: '*schema',
    patternProperties: '*schema',
    dependentSchemas: '*schema',
    $defs: '*schema',
    definitions: '*schema',
    allOf: 'schema',
    anyOf: 'schema',
    oneOf: 'schema',
    prefixItems: 'schema',
    items: 'schema',
    additionalItems: 'schema',
    additionalProperties: 'schema',
    unevaluatedItems: 'schema',
    unevaluatedProperties: 'schema',
    propertyNames: 'schema',
    contains: 'schema',
    not: 'schema',
    if: 'schema',
    then: 'schema',
    else: 'schema',
  },
};

// Where a reference of each kind is hoisted to: OpenAPI 3 `components` groups, Swagger 2.0 root members.
const GROUPS_3: Readonly<Record<string, string>> = {
  schema: 'schemas',
  parameter: 'parameters',
  response: 'responses',
  requestBody: 'requestBodies',
  header: 'headers',
  example: 'examples',
  link: 'links',
  callback: 'callbacks',
  securityScheme: 'securitySchemes',
};
const GROUPS_2: Readonly<Record<string, string>> = { schema: 'definitions', parameter: 'parameters', response: 'responses' };

// Values that are data, not part of the document's structure: a `$ref` inside one is not a reference.
const DATA_MEMBERS: ReadonlySet<string> = new Set(['example', 'default', 'enum', 'const']);

const isData = (key: string): boolean => DATA_MEMBERS.has(key) || key.startsWith('x-');

const hasExternalRef = (node: unknown): boolean => {
  if (typeof node !== 'object' || node === null) return false;
  const { $ref } = node as { $ref?: unknown };
  if (typeof $ref === 'string' && !$ref.startsWith('#')) return true;
  // Data included: a property named `default` is not data, and walking a copy that changes nothing costs nothing.
  return Object.values(node).some((member) => hasExternalRef(member));
};

const escape = (token: string): string => token.replaceAll('~', '~0').replaceAll('/', '~1');

/** An own member of an object or array, by RFC 6901, as `gen-ts-ref.ts` reads one. */
const follow = (node: unknown, fragment: string): unknown => {
  let at = node;
  for (const token of pointerOf(`#${fragment}`)) {
    // eslint-disable-next-line conventions/consistent-existence-index-check -- Own members only: `#/toString` must not resolve to an inherited function
    if (typeof at !== 'object' || at === null || !Object.hasOwn(at, token)) return undefined;
    at = (at as Dict)[token];
  }
  return at;
};

const same = (left: unknown, right: unknown): boolean => JSON.stringify(left) === JSON.stringify(right);

const REMOTE = /^[a-z][\d+.a-z-]*:/iu;

/** The file a reference names, resolved against the file it is written in, and the pointer into it. */
const targetOf = (ref: string, from: string): { path: string; fragment: string } => {
  const [address = '', fragment = ''] = ref.split('#');
  return { path: address === '' ? from : resolve(dirname(from), decodeURI(address)), fragment };
};

// A map's members are each of the kind; an object's members are what `CHILDREN` says, and data is not read.
const kindOf = (kind: string, key: string): string | undefined => {
  if (kind.startsWith('*')) return kind.slice(1);
  if (isData(key)) return undefined;
  const children = new Map(Object.entries(CHILDREN[kind] ?? {}));
  return children.get(key) ?? children.get('*') ?? 'other';
};

/** Where a reference is written: the kind of object it stands for, the file, and the pointer in it. */
interface Site {
  readonly kind: string;
  readonly from: string;
  readonly at: string;
}

/** What a target is known by: its file and the pointer in it. */
const keyOf = ({ from, at }: Site): string => `${from}${at}`;

/**
 * The document read from `file`, with every `$ref` into another file bundled into it. The
 * document is not changed; one that names no other file is returned as given.
 */
export const bundle = (document: unknown, file: string): unknown => {
  if (!isDict(document) || !hasExternalRef(document)) return document;
  const openapi = document.swagger === undefined;
  const groups = new Map(Object.entries(openapi ? GROUPS_3 : GROUPS_2));
  // OpenAPI 3 keeps its members in `components`; Swagger 2.0 at the root.
  const own = openapi ? dict(document.components) : document;
  const shown = (path: string): string => relative(dirname(file), path).replaceAll('\\', '/');
  const where = ({ from, at }: Site): string => (from === file ? at : `${shown(from)}${at}`);

  const files = new Map<string, unknown>([[file, document]]);
  const load = (path: string, ref: string, site: Site): unknown => {
    const cached = files.get(path);
    if (cached !== undefined) return cached;
    if (!existsSync(path)) {
      throw new GenerateError(
        `Can't resolve $ref at ${where(site)}: \`${ref}\` names ${shown(path)}, which does not exist.`,
        `add ${shown(path)} next to ${basename(file)}, or replace the \`$ref\` with what it names`,
      );
    }
    const text = readFileSync(path, 'utf8');
    let parsed: unknown;
    try {
      parsed = path.endsWith('.json') ? JSON.parse(text) : parseYaml(text);
    } catch (error) {
      throw new GenerateError(`${shown(path)} is not JSON or YAML (${(error as Error).message}).`, `correct ${shown(path)}`);
    }
    files.set(path, parsed);
    return parsed;
  };

  // Where each target went, by `<file>#<pointer>`; what was hoisted, by group, in the order it was
  // left; and the references met while their target was still being read, written once it is named.
  const names = new Map<string, string>();
  const hoisted = new Map<string, Map<string, unknown>>();
  const waiting = new Map<string, Dict[]>();
  const inlining = new Set<string>();

  // Redocly names a member when its reference is left, after what it refers to has been bundled.
  const nameFor = (group: string, path: string, fragment: string, content: unknown): string => {
    const existing = new Map(Object.entries(dict(own[group])));
    const taken = hoisted.get(group) ?? new Map<string, unknown>();
    const fits = (name: string): boolean => {
      if (taken.has(name)) return same(taken.get(name), content);
      if (!existing.has(name)) return true;
      const member = dict(existing.get(name));
      if (typeof member.$ref !== 'string') return same(member, content);
      const other = targetOf(member.$ref, file);
      return other.path === path && other.fragment === fragment;
    };
    let name = '';
    for (const token of pointerOf(`#${fragment}`).toReversed()) {
      name = name === '' ? token : `${token}-${name}`;
      if (fits(name)) return name;
    }
    const base = basename(path, extname(path));
    name = name === '' ? base : `${base}_${name}`;
    let candidate = name;
    for (let serial = 2; !fits(candidate); serial += 1) candidate = `${name}-${String(serial)}`;
    return candidate;
  };

  const local = (group: string, name: string): string => (openapi ? `#/components/${group}/${escape(name)}` : `#/${group}/${escape(name)}`);

  /** A target that is not a component is written where its reference was; one that contains itself cannot be. */
  const inline = (value: unknown, ref: string, site: Site, into: Site): unknown => {
    const key = keyOf(into);
    if (inlining.has(key)) {
      throw new GenerateError(`Can't bundle $ref at ${where(site)}: \`${ref}\` contains itself, and is written in place.`, 'move the part that repeats into a schema, which is hoisted and named');
    }
    inlining.add(key);
    const out = walk(value, into);
    inlining.delete(key);
    return out;
  };

  const hoist = (node: Dict, group: string, value: unknown, into: Site): Dict => {
    const key = keyOf(into);
    const known = names.get(key);
    if (known !== undefined) return { ...node, $ref: local(group, known) };
    const out = { ...node };
    const pending = waiting.get(key);
    if (pending !== undefined) {
      pending.push(out);
      return out;
    }
    const references = [out];
    waiting.set(key, references);
    const content = walk(value, into);
    const name = nameFor(group, into.from, into.at.slice(1), content);
    names.set(key, name);
    const members = hoisted.get(group) ?? new Map<string, unknown>();
    hoisted.set(group, members);
    if (!members.has(name)) members.set(name, content);
    for (const each of references) each.$ref = local(group, name);
    waiting.delete(key);
    return out;
  };

  const reference = (node: Dict, ref: string, site: Site): unknown => {
    // The document's own references stay as written; one inside another file points into that file.
    if (ref.startsWith('#') && site.from === file) return node;
    if (REMOTE.test(ref)) {
      throw new GenerateError(
        `Can't resolve $ref at ${where(site)}: \`${ref}\` is a remote address, and this package does not fetch.`,
        `download it next to ${basename(file)} and point the \`$ref\` at the copy`,
      );
    }
    const { path, fragment } = targetOf(ref, site.from);
    const value = follow(load(path, ref, site), fragment);
    if (value === undefined) {
      throw new GenerateError(`Can't resolve $ref at ${where(site)}: \`${ref}\` leads nowhere in ${shown(path)}.`, `point the \`$ref\` at a member ${shown(path)} has`);
    }
    const into: Site = { kind: site.kind, from: path, at: `#${fragment}` };
    const group = groups.get(site.kind);
    return group === undefined ? inline(value, ref, site, into) : hoist(node, group, value, into);
  };

  const walk = (node: unknown, site: Site): unknown => {
    if (Array.isArray(node)) return node.map((member: unknown, index) => walk(member, { ...site, at: childPath(site.at, String(index)) }));
    if (!isDict(node)) return node;
    const { $ref } = node;
    if (!site.kind.startsWith('*') && typeof $ref === 'string') return reference(node, $ref, site);
    return Object.fromEntries(
      Object.entries(node).map(([key, member]) => {
        const kind = kindOf(site.kind, key);
        return [key, kind === undefined ? member : walk(member, { kind, from: site.from, at: childPath(site.at, key) })];
      }),
    );
  };

  let root = dict(walk(document, { kind: 'root', from: file, at: '#' }));
  for (const [group, members] of hoisted) {
    const holder = openapi ? dict(root.components) : root;
    const merged = { [group]: { ...dict(holder[group]), ...Object.fromEntries(members) } };
    root = openapi ? { ...root, components: { ...holder, ...merged } } : { ...root, ...merged };
  }
  return root;
};

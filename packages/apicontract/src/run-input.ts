/**
 * The spec a run reads (apicontract-gen-command R3): JSON or YAML, with the config's OpenAPI
 * Overlays applied in order, then read into a `Contract` by the adapter that recognises it. YAML is
 * read with the parser the OpenAPI reader already uses, so there is no new dependency.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { parse as parseYaml } from 'seniority/yaml';

import { bundle } from './gen-ts-bundle.js';
import { applyOverlays } from './input-overlay.js';
import { ConfigError } from './run-config.js';

type Apply = (document: unknown, overlays: readonly unknown[]) => unknown;

/** C0 and C1 controls YAML calls non-printable (tab, line feed, carriage return and NEL are printable). */
const NON_PRINTABLE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u0084\u0086-\u009F]/gu;

/**
 * YAML, and if it fails only because text was mis-encoded somewhere (docusign's and sendgrid's
 * descriptions, 2026-11-18 corpus), again with each non-printable character read as U+FFFD: the
 * structure is untouched, and a strict parse of the same file would refuse the whole document.
 */
const parseYamlLeniently = (text: string): unknown => {
  try {
    return parseYaml(text);
  } catch (error) {
    // `search`, not `test`: a global pattern's `test` carries `lastIndex` from one document to the next.
    if (text.search(NON_PRINTABLE) === -1) throw error;
    // ponytail: replaced silently; surface a finding once readDocument has a findings channel.
    return parseYaml(text.replaceAll(NON_PRINTABLE, '\uFFFD'));
  }
};

/** A JSON or YAML file, parsed. `file` names the config that pointed at it, for the refusal. */
export const readDocument = (path: string, file: string): unknown => {
  if (!existsSync(path)) throw new ConfigError(file, [`${path} does not exist. fix: point \`input\` at the spec, relative to the config`]);
  const text = readFileSync(path, 'utf8');
  try {
    return path.endsWith('.json') ? (JSON.parse(text) as unknown) : parseYamlLeniently(text);
  } catch (error) {
    throw new ConfigError(file, [`${path} is not JSON or YAML (${(error as Error).message}). fix: correct the file, or point \`input\` at another`]);
  }
};

export interface InputOptions {
  readonly root: string;
  readonly file: string;
  readonly input: string;
  readonly overlays: readonly string[];
}

/**
 * The document a run generates from, overlays applied in the order the config lists them, then the
 * files its `$ref`s name, next to it, bundled in: only here is the document's location known.
 */
export const readInput = ({ root, file, input, overlays }: InputOptions, apply: Apply = applyOverlays): unknown => {
  const path = resolve(root, input);
  const document = readDocument(path, file);
  return bundle(overlays.length === 0 ? document : apply(document, overlays.map((overlay) => readDocument(resolve(root, overlay), file))), path);
};

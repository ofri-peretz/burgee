/**
 * The spec a run reads (apicontract-gen-command R3): JSON or YAML, with the config's OpenAPI
 * Overlays applied in order, then read into a `Contract` by the adapter that recognises it. YAML is
 * read with the parser the OpenAPI reader already uses, so there is no new dependency.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { parse as parseYaml } from 'seniority/yaml';

import { applyOverlays } from './input-overlay.js';
import { ConfigError } from './run-config.js';

type Apply = (document: unknown, overlays: readonly unknown[]) => unknown;

/** A JSON or YAML file, parsed. `file` names the config that pointed at it, for the refusal. */
export const readDocument = (path: string, file: string): unknown => {
  if (!existsSync(path)) throw new ConfigError(file, [`${path} does not exist. fix: point \`input\` at the spec, relative to the config`]);
  const text = readFileSync(path, 'utf8');
  try {
    return path.endsWith('.json') ? (JSON.parse(text) as unknown) : parseYaml(text);
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

/** The document a run generates from, overlays applied in the order the config lists them. */
export const readInput = ({ root, file, input, overlays }: InputOptions, apply: Apply = applyOverlays): unknown => {
  const document = readDocument(resolve(root, input), file);
  if (overlays.length === 0) return document;
  return apply(document, overlays.map((overlay) => readDocument(resolve(root, overlay), file)));
};

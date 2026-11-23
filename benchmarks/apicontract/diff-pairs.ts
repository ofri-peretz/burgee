/**
 * contractdiff-bench R2: the pairs. Each pair is a pinned OpenAPI 3.x document (`old.json`) and the
 * same document with one catalogue edit applied (`new.json`), written to the corpus cache, never the
 * repository. Both sides are serialised the same way, so formatting is never the difference.
 *
 * `--sample N --seed S` takes N pairs: the documents in a seeded order, one edit each, the edits in
 * turn (a document that has nowhere for its turn's edit gets the next one that applies), so labels
 * stay near half and half and every edit is planted. No `--sample`: every edit on every document.
 * The timing pairs (D4) are three edits on the Stripe and GitHub specs, the largest pinned.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { parse as parseYaml } from 'seniority/yaml';

import { expandPins, type Pin, seeded } from './corpus-lib.js';
import { type Edit, EDITS, isOpenApi3, type Label } from './diff-edits.js';
import { fetchAll } from './fetch.js';
import { cacheRoot, readPins } from './net.js';

export interface Pair {
  /** `<document id>#<edit id>`. */
  readonly id: string;
  readonly document: string;
  readonly edit: string;
  readonly label: Label;
  readonly timing: boolean;
  readonly old: string;
  readonly new: string;
}

/** The documents whose pairs time each tool (D4): the two largest hand-maintained specs. */
export const TIMING_DOCUMENTS = ['github:descriptions/api.github.com/api.github.com.json', 'stripe:openapi/spec3.json'];
export const TIMING_EDITS = ['description-changed', 'response-property-added', 'operation-removed'];

/** Documents fetched per round while a sample is filled: most of the corpus is Swagger 2.0. */
const ROUND = 64;

/** `items` in the order a seeded Fisher–Yates shuffle leaves them. */
export function shuffled<T>(items: readonly T[], seed: number): T[] {
  const random = seeded(seed);
  const pool = [...items];
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [pool[i], pool[j]] = [pool[j] as T, pool[i] as T];
  }
  return pool;
}

/** A pinned document read as JSON or YAML; `undefined` when it is neither. */
export function parseDocument(text: string, file: string): unknown {
  try {
    return /\.ya?ml$/i.test(file) ? parseYaml(text) : JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** What a sample picks from one document: the edit at `turn`, or the next one after it that applies. */
export function pick(document: Readonly<Record<string, unknown>>, turn: number, edits: readonly Edit[] = EDITS): { edit: Edit; changed: Record<string, unknown> } | undefined {
  for (let offset = 0; offset < edits.length; offset += 1) {
    const edit = edits[(turn + offset) % edits.length] as Edit;
    const changed = edit.apply(document);
    if (changed !== undefined) return { edit, changed };
  }
  return undefined;
}

const folderOf = (id: string): string => id.replaceAll(/[^\w.-]+/g, '_');

interface Planted {
  readonly document: string;
  readonly edit: Edit;
  readonly old: unknown;
  readonly changed: unknown;
  readonly timing: boolean;
}

function writePair(root: string, { document, edit, old, changed, timing }: Planted): Pair {
  const dir = path.join(root, folderOf(document), edit.id);
  mkdirSync(dir, { recursive: true });
  const files = { old: path.join(dir, 'old.json'), new: path.join(dir, 'new.json') };
  writeFileSync(files.old, `${JSON.stringify(old, undefined, 2)}\n`);
  writeFileSync(files.new, `${JSON.stringify(changed, undefined, 2)}\n`);
  return { id: `${document}#${edit.id}`, document, edit: edit.id, label: edit.label, timing, ...files };
}

async function readOpenApi3(pins: readonly Pin[]): Promise<{ pin: Pin; document: Record<string, unknown> }[]> {
  const fetched = await fetchAll(pins);
  return fetched.flatMap(({ pin, file }) => {
    const document = parseDocument(readFileSync(file, 'utf8'), file);
    return isOpenApi3(document) ? [{ pin, document }] : [];
  });
}

/** Every edit in `edits` that applies to a document, as planted pairs. */
const everyEdit = (pin: Pin, document: Record<string, unknown>, edits: readonly Edit[], timing: boolean): Planted[] =>
  edits.flatMap((edit) => {
    const changed = edit.apply(document);
    return changed === undefined ? [] : [{ document: pin.id, edit, old: document, changed, timing }];
  });

/**
 * The documents in `order`, a round at a time (the corpus does not fit in memory parsed), each
 * planted by `plant`, until `enough` says stop.
 */
async function plantAll(order: readonly Pin[], plant: (pin: Pin, document: Record<string, unknown>, count: number) => Planted[], enough: (count: number) => boolean, root: string): Promise<Pair[]> {
  const pairs: Pair[] = [];
  for (let start = 0; start < order.length && !enough(pairs.length); start += ROUND) {
    // eslint-disable-next-line reliability/no-await-in-loop -- one round at a time, so only a round of parsed documents is held
    for (const { pin, document } of await readOpenApi3(order.slice(start, start + ROUND))) {
      if (enough(pairs.length)) break;
      pairs.push(...plant(pin, document, pairs.length).map((planted) => writePair(root, planted)));
    }
  }
  return pairs;
}

export interface PairOptions {
  readonly sample?: number | undefined;
  readonly seed?: number | undefined;
  /** Where pairs are written; default `<cache>/diff-pairs`. */
  readonly root?: string | undefined;
}

/** The labelled pairs a flag set selects, after the timing pairs, written to disk. */
export async function buildPairs(options: PairOptions = {}): Promise<Pair[]> {
  const root = options.root ?? path.join(cacheRoot(), 'diff-pairs');
  const openapi = expandPins(readPins()).filter((pin) => pin.family === 'openapi');
  const timingEdits = EDITS.filter((edit) => TIMING_EDITS.includes(edit.id));
  const timing = await plantAll(
    openapi.filter((pin) => TIMING_DOCUMENTS.includes(pin.id)),
    (pin, document) => everyEdit(pin, document, timingEdits, true),
    () => false,
    root,
  );
  const order = shuffled(
    openapi.filter((pin) => !TIMING_DOCUMENTS.includes(pin.id)),
    options.seed ?? 1,
  );
  const { sample } = options;
  const pairs =
    sample === undefined
      ? await plantAll(order, (pin, document) => everyEdit(pin, document, EDITS, false), () => false, root)
      : await plantAll(
          order,
          (pin, document, count) => {
            const picked = pick(document, count);
            return picked === undefined ? [] : [{ document: pin.id, edit: picked.edit, old: document, changed: picked.changed, timing: false }];
          },
          (count) => count >= sample,
          root,
        );
  return [...timing, ...pairs];
}

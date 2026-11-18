/**
 * Two contracts compared (apicontract-diff spec.md R3): operations matched by id, then, for one
 * whose id changed, by method and path read from its `source` pointer; payloads matched by name;
 * every change classified for the question `mode` and `side` ask.
 *
 * It works on the model, so it reads any format an adapter reads into it, OpenAPI, JSON Schema,
 * AsyncAPI or MCP, the same way.
 */
import { type Contract, type Direction, type Operation, type Payload } from './core/model.js';
import { classify, type Mode, type Side, type Verdict } from './diff-classify.js';
import { ruleId } from './diff-rules.js';
import { compareSchemas, type Effect, serverReceives } from './diff-schema.js';

export interface Finding {
  /** oasdiff's rule id where the change is one oasdiff names, else ours, `ac-`-prefixed. */
  readonly id: string;
  readonly scheme: 'oasdiff' | 'apicontract';
  readonly verdict: Verdict;
  readonly effect: Effect;
  readonly operation: string;
  /** JSON Pointer to the operation in the new document, or in the old one when it was removed. */
  readonly source: string;
  /** Which document `source` points into. */
  readonly document: 'old' | 'new';
  /** The payload's name; absent for a change to the operation itself. */
  readonly payload?: string;
  readonly direction: Direction;
  /** JSON Pointer into the payload's schema. */
  readonly pointer: string;
  readonly before: unknown;
  readonly after: unknown;
  readonly fix: string;
}

export interface Comparison {
  readonly mode: Mode;
  readonly side: Side;
  /** `breaking` if any finding is; else `unknown` if any is; else `non-breaking`. */
  readonly verdict: Verdict;
  readonly summary: Readonly<Record<Verdict, number>>;
  /** Sorted by verdict (breaking, unknown, non-breaking), then where. */
  readonly findings: readonly Finding[];
}

export interface CompareOptions {
  readonly mode?: Mode | undefined;
  readonly side?: Side | undefined;
}

const RANK: Readonly<Record<Verdict, number>> = { breaking: 0, unknown: 1, 'non-breaking': 2 };

/** `get /pets/{}` from `#/paths/~1pets~1{id}/get`: what an operation is when its id changes. Path parameter names do not count. */
export const routeOf = (source: string): string | undefined => {
  const match = /^#?\/paths\/(?<path>[^/]+)\/(?<method>[a-z]+)$/.exec(source);
  if (match === null) return undefined;
  const { path, method } = match.groups as { path: string; method: string };
  return `${method} ${path.replaceAll(/\{[^}]*\}/g, '{}')}`;
};

/** Pairs of operations, old with new; an unpaired one was removed or added. Ids first, then routes. */
const pair = (a: readonly Operation[], b: readonly Operation[]): [Operation | undefined, Operation | undefined][] => {
  const rest = [...b];
  const take = (match: (operation: Operation) => boolean): Operation | undefined => {
    const index = rest.findIndex(match);
    return index === -1 ? undefined : rest.splice(index, 1)[0];
  };
  const pairs: [Operation | undefined, Operation | undefined][] = a.map((operation) => [operation, take((other) => other.id === operation.id)]);
  for (const entry of pairs) {
    const route = routeOf((entry[0] as Operation).source);
    if (entry[1] === undefined && route !== undefined) entry[1] = take((other) => routeOf(other.source) === route);
  }
  return [...pairs, ...rest.map((operation): [undefined, Operation] => [undefined, operation])];
};

/** The direction an operation is called in: its first payload the server receives, else its first payload. */
const callDirection = (operation: Operation): Direction =>
  (operation.payloads.find((payload) => serverReceives(payload.direction)) ?? operation.payloads[0])?.direction ?? 'request';

/** What kind of payload a name is: a parameter, a request body, a response, or anything else. */
const kindOf = (name: string): 'parameter' | 'request-body' | 'response' | 'payload' => {
  if (name.startsWith('param:')) return 'parameter';
  if (name.startsWith('body')) return 'request-body';
  return name.startsWith('response:') ? 'response' : 'payload';
};

/** `response:200` for every payload of that status, `body` for every body media type; else the name itself. */
const groupOf = (name: string): string => name.split(':').slice(0, kindOf(name) === 'response' ? 2 : 1).join(':');

/** The rule for a payload that appeared or disappeared: whole status, whole body, or one media type of it. */
const presenceRule = (name: string, others: readonly Payload[], change: 'added' | 'removed'): string => {
  const kind = kindOf(name);
  const whole = !others.some((other) => groupOf(other.name) === groupOf(name));
  if (kind === 'response') return `response-${whole ? 'status' : 'media-type'}-${change}`;
  if (kind === 'request-body') return `request-body-${whole ? '' : 'media-type-'}${change}`;
  return `payload-${change}`;
};

interface Raw {
  readonly rule: string;
  readonly payload?: string;
  readonly direction: Direction;
  readonly pointer: string;
  readonly before: unknown;
  readonly after: unknown;
  readonly effect: Effect;
}

interface Pair {
  readonly old: Operation;
  readonly nu: Operation;
}

/**
 * A payload on one side only. An undeclared parameter is one nobody sent, so declaring an optional
 * one is neutral; an absent body or response is one nobody sends, so it is the `false` schema.
 */
const comparePresence = (name: string, { old, nu }: Pair): Raw[] => {
  const before = old.payloads.find((payload) => payload.name === name);
  const present = (before ?? nu.payloads.find((payload) => payload.name === name)) as Payload;
  const base = { payload: name, direction: present.direction, pointer: '' };
  const removed = before !== undefined;
  const { required, schema } = present;
  if (kindOf(name) === 'parameter') {
    if (removed) return [{ ...base, rule: 'parameter-removed', before: schema, after: undefined, effect: required ? 'widens' : 'neutral' }];
    return [{ ...base, rule: required ? 'required-parameter-added' : 'parameter-added', before: undefined, after: schema, effect: required ? 'narrows' : 'neutral' }];
  }
  if (schema === false) return [];
  if (removed) return [{ ...base, rule: presenceRule(name, nu.payloads, 'removed'), before: schema, after: undefined, effect: 'narrows' }];
  return [{ ...base, rule: presenceRule(name, old.payloads, 'added'), before: undefined, after: schema, effect: 'widens' }];
};

const comparePayload = (documents: { old: unknown; new: unknown }, before: Payload, after: Payload): Raw[] => {
  const { name, direction } = after;
  const changes: Raw[] = compareSchemas(before.schema, after.schema, direction, documents).map((change) => ({ ...change, payload: name, direction }));
  if (before.required === after.required) return changes;
  const rule = `${kindOf(name)}-became-${after.required ? 'required' : 'optional'}`;
  return [{ rule, payload: name, direction, pointer: '', before: before.required, after: after.required, effect: after.required ? 'narrows' : 'widens' }, ...changes];
};

const comparePayloads = (a: Contract, b: Contract, pair: Pair): Raw[] => {
  const names = [...new Set([...pair.old.payloads, ...pair.nu.payloads].map((payload) => payload.name))].sort();
  return names.flatMap((name) => {
    const before = pair.old.payloads.find((payload) => payload.name === name);
    const after = pair.nu.payloads.find((payload) => payload.name === name);
    if (before === undefined || after === undefined) return comparePresence(name, pair);
    return comparePayload({ old: a.document, new: b.document }, before, after);
  });
};

/** The operation itself appeared or disappeared, judged in the direction it is called in. */
const compareOperation = (old: Operation | undefined, nu: Operation | undefined): Raw => {
  const added = old === undefined;
  return {
    rule: added ? 'operation-added' : 'operation-removed',
    direction: callDirection((nu ?? old) as Operation),
    pointer: '',
    before: old?.id,
    after: nu?.id,
    effect: added ? 'widens' : 'narrows',
  };
};

const fixFor = (raw: Raw, verdict: Verdict, operation: string): string => {
  const where = `${operation}${raw.payload === undefined ? '' : ` ${raw.payload}`}${raw.pointer}`;
  if (verdict === 'unknown') return `review ${where} by hand: apicontract cannot tell what \`${raw.rule}\` does to the values it accepts`;
  if (verdict === 'non-breaking') return 'nothing to do';
  if (raw.effect === 'narrows') return `keep accepting at ${where} what the old contract accepted, or release this as a major version`;
  return `keep ${where} within what the old contract allowed, or release this as a major version`;
};

const overall = (summary: Readonly<Record<Verdict, number>>): Verdict => {
  if (summary.breaking > 0) return 'breaking';
  return summary.unknown > 0 ? 'unknown' : 'non-breaking';
};

const whereOf = (finding: Finding): string => `${finding.source} ${finding.payload ?? ''} ${finding.pointer} ${finding.id}`;

/** Compare `a` (old) with `b` (new): every change, classified. */
export const compareContracts = (a: Contract, b: Contract, options: CompareOptions = {}): Comparison => {
  const mode = options.mode ?? 'backward';
  const side = options.side ?? 'caller';
  const findings = pair(a.operations, b.operations).flatMap(([old, nu]) => {
    const operation = (nu ?? old) as Operation;
    const raws = old === undefined || nu === undefined ? [compareOperation(old, nu)] : comparePayloads(a, b, { old, nu });
    return raws.map((raw): Finding => {
      const verdict = classify(raw, raw.direction, mode, side);
      return {
        ...ruleId(raw.rule, raw.direction, raw.payload, raw.pointer),
        verdict,
        effect: raw.effect,
        operation: operation.id,
        source: operation.source,
        document: nu === undefined ? 'old' : 'new',
        ...(raw.payload === undefined ? {} : { payload: raw.payload }),
        direction: raw.direction,
        pointer: raw.pointer,
        before: raw.before,
        after: raw.after,
        fix: fixFor(raw, verdict, operation.id),
      };
    });
  });
  findings.sort((x, y) => RANK[x.verdict] - RANK[y.verdict] || whereOf(x).localeCompare(whereOf(y), 'en'));
  const count = (verdict: Verdict): number => findings.filter((finding) => finding.verdict === verdict).length;
  const summary = { breaking: count('breaking'), unknown: count('unknown'), 'non-breaking': count('non-breaking') };
  return { mode, side, verdict: overall(summary), summary, findings };
};

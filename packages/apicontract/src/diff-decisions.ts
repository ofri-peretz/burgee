/**
 * Decision markers (apicontract-diff-decisions spec.md): the reason for a change, written in the
 * contract beside the member it is about, and read back by `diff`.
 *
 * `x-change` names the decision behind a change, `x-sunset` the date a member goes, `x-replaced-by`
 * what takes its place; OpenAPI's own `deprecated` rides along. They are read here, never diffed:
 * `diff-schema.ts` keeps skipping every `x-` keyword (R1). This module reads a contract's markers
 * (`readDecisions`, R2 to R4) and holds a change to them (`checkDecisions`, R5 to R10).
 *
 * A decision is keyed by operation id, payload name and the JSON Pointer `diff-schema.ts` uses, so
 * a marker and a finding at the same member meet under the same key.
 */
import { type Contract, type Direction, type Operation } from './core/model.js';
import { pointerGet } from './core/resolve.js';
import { type Finding } from './diff-contract.js';
import { isDict } from './diff-normalise.js';

type Dict = Readonly<Record<string, unknown>>;

/** `warn` prints and appears in SARIF at `warning`; `error` also fails the run (R11). `off` never gets here. */
export type DecisionLevel = 'warn' | 'error';

export const MARKERS = ['x-change', 'x-sunset', 'x-replaced-by'] as const;
type Marker = (typeof MARKERS)[number];

/** What one member says about its own change. Only the markers that are present and valid are set. */
export interface Decision {
  /** The decision behind the change: an ADR id, a ticket, a URL. Opaque; never fetched. */
  readonly change?: string;
  /** `YYYY-MM-DD`: the member is removed after this date. */
  readonly sunset?: string;
  /** A sibling member's name, or a JSON Pointer relative to the member's parent. */
  readonly replacedBy?: string;
  readonly deprecated?: boolean;
  readonly operation: string;
  /** The payload's name; empty for a marker on the operation itself. */
  readonly payload: string;
  /** JSON Pointer into the payload's schema. */
  readonly pointer: string;
}

/** What `readDecisions` knows about one contract. */
export interface Decisions {
  /** Every member that carries a marker, by {@link keyOf}. */
  readonly decisions: ReadonlyMap<string, Decision>;
  /** Every member the walk reached, with or without a marker, by {@link keyOf}. */
  readonly members: ReadonlySet<string>;
  /** R2 to R4: markers misplaced, misspelled or holding a bad value. */
  readonly problems: readonly Finding[];
}

/** One member's key: the operation, the payload (empty for the operation itself) and the pointer. */
export const keyOf = (operation: string, payload: string, pointer: string): string => `${operation}\n${payload}\n${pointer}`;

const token = (key: string): string => key.replaceAll('~', '~0').replaceAll('/', '~1');

const arrayOf = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

/** Words a reader quotes back: where a finding is, for its `fix:` line. */
export const wordsFor = (...parts: readonly (string | undefined)[]): string => parts.filter((part) => part !== undefined && part !== '').join(' ');

// --- Findings ---

/** Where a decision finding points: the new document, or the old one for a removal. */
export interface Place {
  readonly operation: string;
  /** JSON Pointer to the operation (or, outside one, to the offending object) in `document`. */
  readonly source: string;
  readonly document: 'old' | 'new';
  readonly payload?: string | undefined;
  readonly direction: Direction;
  readonly pointer: string;
}

/**
 * A decision finding, shaped as every other `diff` finding so SARIF, `--json` and text need no new
 * path. `warn` is the `unknown` verdict (SARIF `warning`), `error` is `breaking` (SARIF `error`).
 */
export const decisionFinding = (
  level: DecisionLevel,
  rule: string,
  place: Place,
  detail: {
    readonly before: unknown;
    readonly after: unknown;
    readonly fix: string;
  },
): Finding => ({
  id: `ac-decision-${rule}`,
  scheme: 'apicontract',
  verdict: level === 'error' ? 'breaking' : 'unknown',
  effect: 'neutral',
  operation: place.operation,
  source: place.source,
  document: place.document,
  ...(place.payload === undefined ? {} : { payload: place.payload }),
  direction: place.direction,
  pointer: place.pointer,
  before: detail.before,
  after: detail.after,
  fix: detail.fix,
});

// --- Values (R4) ---

const DATE = /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})$/;

/** `YYYY-MM-DD` naming a day that exists: `2027-02-30` is not one. */
export const isDate = (value: unknown): value is string => {
  const parts = typeof value === 'string' ? DATE.exec(value)?.groups : undefined;
  if (parts === undefined) return false;
  const day = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)));
  return day.toISOString().startsWith(String(value));
};

const POINTER = /^(?:\/(?:[^~/]|~[01])*)*$/;

/** A JSON Pointer (`/properties/amountCents`), or a sibling's name (no `/`). */
const isReplacement = (value: unknown): value is string => {
  if (typeof value !== 'string' || value === '') return false;
  return value.startsWith('/') ? POINTER.test(value) : !value.includes('/');
};

const isText = (value: unknown): value is string => typeof value === 'string' && value.trim() !== '';

const FORMS: Readonly<Record<Marker, readonly [accepts: (value: unknown) => boolean, fix: string]>> = {
  'x-change': [isText, 'write `x-change: <the decision>`: an ADR id, a ticket or a URL, as non-empty text'],
  'x-sunset': [isDate, 'write `x-sunset: 2027-03-01`: a real date as YYYY-MM-DD'],
  'x-replaced-by': [isReplacement, "write `x-replaced-by:` as a sibling member's name (`amountCents`) or a JSON Pointer to one (`/properties/amountCents`)"],
};

/** What a holder says, markers checked: a bad one is reported through `invalid` and left out. */
const markersOf = (holder: Dict, invalid: (marker: Marker, value: unknown, fix: string) => void): Pick<Decision, 'change' | 'sunset' | 'replacedBy' | 'deprecated'> => {
  const valid = (marker: Marker): string | undefined => {
    const value = holder[marker];
    if (value === undefined) return undefined;
    const [accepts, fix] = FORMS[marker];
    if (accepts(value)) return value as string;
    invalid(marker, value, fix);
    return undefined;
  };
  const change = valid('x-change');
  const sunset = valid('x-sunset');
  const replacedBy = valid('x-replaced-by');
  return {
    ...(change === undefined ? {} : { change }),
    ...(sunset === undefined ? {} : { sunset }),
    ...(replacedBy === undefined ? {} : { replacedBy }),
    ...(holder.deprecated === true ? { deprecated: true } : {}),
  };
};

// --- Spelling (R3) ---

/** Levenshtein distance, row by row. */
const distance = (a: string, b: string): number => {
  const last = [...a].reduce(
    (row, left, i) =>
      [...b].reduce<number[]>((next, right, j) => [...next, Math.min((row[j + 1] as number) + 1, (next[j] as number) + 1, (row[j] as number) + (left === right ? 0 : 1))], [i + 1]),
    Array.from({ length: b.length + 1 }, (_, j) => j),
  );
  return last.at(-1) as number;
};

/** The marker a near-miss `x-` key was meant for: within edit distance 2, and not a marker already. */
const meant = (key: string): Marker | undefined => {
  if (!key.startsWith('x-') || (MARKERS as readonly string[]).includes(key)) return undefined;
  const near = MARKERS.map((marker) => [marker, distance(key, marker)] as const).filter(([, steps]) => steps <= 2);
  return near.sort((x, y) => x[1] - y[1])[0]?.[0];
};

// --- The walk ---

interface Scan {
  readonly contract: Contract;
  readonly level: DecisionLevel;
  readonly decisions: Map<string, Decision>;
  readonly members: Set<string>;
  readonly problems: Finding[];
}

interface At {
  readonly operation: Operation;
  /** Empty for the operation itself. */
  readonly payload: string;
  readonly direction: Direction;
  /** The `$ref`s open on the current path: one seen again is a cycle. */
  readonly open: ReadonlySet<string>;
}

const place = (at: At, pointer: string): Place => ({
  operation: at.operation.id,
  source: at.operation.source,
  document: 'new',
  ...(at.payload === '' ? {} : { payload: at.payload }),
  direction: at.direction,
  pointer,
});

const lookup = (document: unknown, ref: string): unknown => {
  try {
    return pointerGet(document, ref);
  } catch {
    // A pointer that leads nowhere is a document the adapter reports on; here it is no member.
    return undefined;
  }
};

/** A Reference Object followed to the thing it names, as the OpenAPI reader does. */
const deref = (document: unknown, value: unknown): Dict | undefined => {
  let node = value;
  const seen = new Set<string>();
  while (isDict(node) && typeof node.$ref === 'string' && !seen.has(node.$ref)) {
    seen.add(node.$ref);
    node = lookup(document, node.$ref);
  }
  return isDict(node) ? node : undefined;
};

/** Note what `holder` says about the member at `pointer`; a marker already noted there wins. */
const record = (scan: Scan, at: At, pointer: string, holder: Dict): void => {
  const fields = markersOf(holder, (marker, value, fix) => {
    scan.problems.push(
      decisionFinding(scan.level, 'invalid', place(at, pointer), {
        before: value,
        after: undefined,
        fix: `${wordsFor(at.operation.id, at.payload, pointer)} has a bad \`${marker}\`. fix: ${fix}`,
      }),
    );
  });
  if (Object.keys(fields).length === 0) return;
  const key = keyOf(at.operation.id, at.payload, pointer);
  scan.decisions.set(key, {
    ...fields,
    ...scan.decisions.get(key),
    operation: at.operation.id,
    payload: at.payload,
    pointer,
  });
};

const COMPOSITIONS = ['oneOf', 'anyOf', 'allOf'] as const;

/** The subschemas the diff walks into, with the pointer it reports them at. */
const childrenOf = (schema: Dict, pointer: string): (readonly [unknown, string])[] => [
  ...Object.entries(isDict(schema.properties) ? schema.properties : {}).map(([name, child]) => [child, `${pointer}/properties/${token(name)}`] as const),
  [schema.additionalProperties, `${pointer}/additionalProperties`] as const,
  [schema.items, `${pointer}/items`] as const,
  ...arrayOf(schema.prefixItems).map((child, index) => [child, `${pointer}/prefixItems/${String(index)}`] as const),
  ...COMPOSITIONS.flatMap((keyword) => arrayOf(schema[keyword]).map((child, index) => [child, `${pointer}/${keyword}/${String(index)}`] as const)),
];

const localRef = (schema: Dict): string | undefined => (typeof schema.$ref === 'string' && schema.$ref.startsWith('#') ? schema.$ref : undefined);

/**
 * Every member of a payload's schema, as `diff-schema.ts` names them: local references followed
 * (the target's markers belong to the member that points at it), and an `allOf` branch read both
 * where it is and as merged into its parent, where `normalise` puts it.
 */
const walk = (scan: Scan, at: At, schema: unknown, pointer: string): void => {
  if (!isDict(schema)) return;
  scan.members.add(keyOf(at.operation.id, at.payload, pointer));
  record(scan, at, pointer, schema);
  const ref = localRef(schema);
  if (ref !== undefined && !at.open.has(ref)) walk(scan, { ...at, open: new Set([...at.open, ref]) }, lookup(scan.contract.document, ref), pointer);
  for (const [child, where] of childrenOf(schema, pointer)) walk(scan, at, child, where);
  for (const branch of arrayOf(schema.allOf)) walk(scan, at, branch, pointer);
};

/** The parameter objects of an operation, by the payload name the OpenAPI reader gives them. */
const parametersOf = (document: unknown, operation: Operation, declared: Dict): Map<string, Dict> => {
  const parent = lookup(document, operation.source.slice(0, operation.source.lastIndexOf('/')));
  const entries = [...arrayOf(isDict(parent) ? parent.parameters : undefined), ...arrayOf(declared.parameters)];
  return new Map(
    entries.flatMap((entry) => {
      const parameter = deref(document, entry);
      return parameter === undefined ? [] : [[`param:${String(parameter.in)}:${String(parameter.name)}`, parameter] as const];
    }),
  );
};

/** Every object under `node`, references followed: where a marker is read from a schema. */
const markSubtree = (document: unknown, node: unknown, marked: Set<object>): void => {
  if (typeof node !== 'object' || node === null || marked.has(node)) return;
  marked.add(node);
  const ref = isDict(node) ? localRef(node) : undefined;
  if (ref !== undefined) markSubtree(document, lookup(document, ref), marked);
  for (const child of Object.values(node)) markSubtree(document, child, marked);
};

/** Keys whose values are data, not contract: a marker-like key in an example is no marker. */
const DATA = new Set(['example', 'examples', 'default', 'enum', 'const']);

/** The objects a marker may sit on (R2): operations and parameters, and everything inside a payload schema. */
interface Holders {
  readonly objects: Set<object>;
  readonly schemas: Set<object>;
}

/** R2 and R3 over the whole document: a marker off its positions, a near-miss spelling anywhere. */
const scanDocument = (scan: Scan, holders: Holders, node: unknown, pointer: string): void => {
  if (typeof node !== 'object' || node === null) return;
  if (isDict(node)) {
    const here = `#${pointer}`;
    const enclosing = scan.contract.operations.find((operation) => here === operation.source || here.startsWith(`${operation.source}/`));
    const where = (): Place => ({
      operation: enclosing?.id ?? '(document)',
      source: here,
      document: 'new',
      direction: 'request',
      pointer: '',
    });
    const allowed = holders.objects.has(node) || holders.schemas.has(node);
    for (const key of Object.keys(node)) {
      const right = meant(key);
      if (right !== undefined) {
        scan.problems.push(
          decisionFinding(scan.level, 'misspelled', where(), {
            before: key,
            after: right,
            fix: `\`${key}\` at ${here} is not a marker. fix: rename it \`${right}\``,
          }),
        );
      } else if (!allowed && (MARKERS as readonly string[]).includes(key)) {
        scan.problems.push(
          decisionFinding(scan.level, 'misplaced', where(), {
            before: key,
            after: node[key],
            fix: `\`${key}\` at ${here} is not on a schema member, an operation or a parameter. fix: move it onto the member it describes, or remove it`,
          }),
        );
      }
    }
  }
  for (const [key, child] of Object.entries(node)) {
    if (!DATA.has(key)) scanDocument(scan, holders, child, `${pointer}/${token(key)}`);
  }
};

const sorted = (findings: readonly Finding[]): Finding[] => {
  const unique = new Map(
    findings.map((finding) => [[finding.id, finding.operation, finding.source, finding.payload ?? '', finding.pointer, String(finding.before)].join('\n'), finding] as const),
  );
  return [...unique.values()].sort((x, y) =>
    `${x.operation} ${x.source} ${x.payload ?? ''} ${x.pointer} ${x.id}`.localeCompare(`${y.operation} ${y.source} ${y.payload ?? ''} ${y.pointer} ${y.id}`, 'en'),
  );
};

/**
 * Read one contract's markers (R1 to R4). Pure: the same contract gives the same result.
 * `level` only decides how the problems are graded.
 */
export const readDecisions = (contract: Contract, level: DecisionLevel = 'warn'): Decisions => {
  const scan: Scan = {
    contract,
    level,
    decisions: new Map(),
    members: new Set(),
    problems: [],
  };
  const holders: Holders = { objects: new Set(), schemas: new Set() };
  for (const operation of contract.operations) {
    const declared = lookup(contract.document, operation.source);
    const parameters = isDict(declared) ? parametersOf(contract.document, operation, declared) : new Map<string, Dict>();
    scan.members.add(keyOf(operation.id, '', ''));
    if (isDict(declared)) {
      holders.objects.add(declared);
      record(scan, { operation, payload: '', direction: 'request', open: new Set() }, '', declared);
    }
    for (const payload of operation.payloads) {
      const at = {
        operation,
        payload: payload.name,
        direction: payload.direction,
        open: new Set<string>(),
      };
      const parameter = parameters.get(payload.name);
      scan.members.add(keyOf(operation.id, payload.name, ''));
      if (parameter !== undefined) {
        holders.objects.add(parameter);
        record(scan, at, '', parameter);
      }
      walk(scan, at, payload.schema, '');
      markSubtree(contract.document, payload.schema, holders.schemas);
    }
  }
  scanDocument(scan, holders, contract.document, '');
  return {
    decisions: scan.decisions,
    members: scan.members,
    problems: sorted(scan.problems),
  };
};

/** Each member of `contract` that carries a marker (R1): operation id, payload and pointer to its decision. */
export const decisionsOf = (contract: Contract): ReadonlyMap<string, Decision> => readDecisions(contract).decisions;

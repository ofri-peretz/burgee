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
import { type Comparison, type Finding, pair } from './diff-contract.js';
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
  /** Whether a member exists, with or without a marker, by {@link keyOf}. */
  readonly members: { has: (key: string) => boolean };
  /** R2 to R4: markers misplaced, misspelled or holding a bad value. */
  readonly problems: readonly Finding[];
}

/** One member's key: the operation, the payload (empty for the operation itself) and the pointer. */
export const keyOf = (operation: string, payload: string, pointer: string): string => `${operation}\n${payload}\n${pointer}`;

const token = (key: string): string => key.replaceAll('~', '~0').replaceAll('/', '~1');

// Stryker disable next-line ArrayDeclaration: equivalent, a value that is not an array reads as a list whose one entry is no schema, parameter or branch, and every reader skips what is not a dict
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
  level: DecisionLevel | undefined,
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

const DATE = /(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})/;

/** `YYYY-MM-DD` naming a day that exists: `2027-02-30` is not one. */
export const isDate = (value: unknown): value is string => {
  // A value that is not text can still read as a date here; the comparison at the end refuses it.
  const parts = DATE.exec(String(value))?.groups;
  if (parts === undefined) return false;
  const day = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)));
  // The round trip is the whole check: it refuses a day that does not exist and any text around the date.
  return day.toISOString().slice(0, 'YYYY-MM-DD'.length) === value;
};

const POINTER = /^(?:\/(?:[^~/]|~[01])*)*$/;

/** A JSON Pointer (`/properties/amountCents`), or a sibling's name (no `/`). */
export const isReplacement = (value: unknown): value is string => {
  if (typeof value !== 'string' || value === '') return false;
  return value.startsWith('/') ? POINTER.test(value) : !value.includes('/');
};

export const isText = (value: unknown): value is string => typeof value === 'string' && value.trim() !== '';

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
export const distance = (a: string, b: string): number => {
  const last = [...a].reduce(
    (row, left, i) =>
      [...b].reduce<number[]>((next, right, j) => [...next, Math.min((row[j + 1] as number) + 1, (next[j] as number) + 1, (row[j] as number) + (left === right ? 0 : 1))], [i + 1]),
    Array.from({ length: b.length + 1 }, (_, j) => j),
  );
  return last.at(-1) as number;
};

/** The marker a near-miss `x-` key was meant for: within edit distance 2, and not a marker already. */
export const meant = (key: string): Marker | undefined => {
  if (!key.startsWith('x-') || (MARKERS as readonly string[]).includes(key)) return undefined;
  // The markers are further than 4 edits from each other, so at most one is within 2 of a key.
  return MARKERS.find((marker) => distance(key, marker) <= 2);
};

// --- The walk ---

interface Scan {
  readonly contract: Contract;
  readonly level: DecisionLevel | undefined;
  readonly decisions: Map<string, Decision>;
  readonly members: Set<string>;
  readonly problems: Finding[];
  /** Per `$ref`: whether nothing it reaches carries a marker, so walking it can record nothing. */
  readonly markerFree: Map<string, boolean>;
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

/** A reference in a URI fragment with a `%` that is not an escape cannot be decoded. */
const BAD_ESCAPE = /%(?![\dA-Fa-f]{2})/;

/**
 * What a local reference (`#`, `#/a/b`) points at, or nothing. `diff` reads a document an adapter
 * already accepted, so a reference that leads nowhere (outside the document, a missing member, a
 * bad escape) is no member here, and is not an error.
 */
export const lookup = (document: unknown, ref: string): unknown => {
  const fragment = ref.slice(1);
  if (!ref.startsWith('#') || BAD_ESCAPE.test(fragment)) return undefined;
  if (fragment === '') return document;
  if (!fragment.startsWith('/')) return undefined;
  return decodeURIComponent(fragment)
    .slice(1)
    .split('/')
    .reduce((node, part) => {
      const key = part.replaceAll('~1', '/').replaceAll('~0', '~');
      // eslint-disable-next-line conventions/consistent-existence-index-check -- Own members only: `#/toString` must not resolve to an inherited function
      return (isDict(node) || Array.isArray(node)) && Object.hasOwn(node, key) ? (node as Record<string, unknown>)[key] : undefined;
    }, document);
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

const localRef = (schema: Dict): string | undefined => (typeof schema.$ref === 'string' ? schema.$ref : undefined);

/**
 * Every member of a payload's schema, as `diff-schema.ts` names them: local references followed
 * (the target's markers belong to the member that points at it), and an `allOf` branch read both
 * where it is and as merged into its parent, where `normalise` puts it.
 */
const follow = (scan: Scan, at: At, schema: Dict, pointer: string): void => {
  const ref = localRef(schema);
  if (ref === undefined) return;
  if (!at.open.has(ref) && !isMarkerFree(scan, ref)) walk(scan, { ...at, open: new Set([...at.open, ref]) }, lookup(scan.contract.document, ref), pointer);
};

/** Whether any key under `node` (references not followed) is a marker. */
const holdsMarker = (node: unknown): boolean => {
  if (Array.isArray(node)) return node.some((item) => holdsMarker(item));
  if (!isDict(node)) return false;
  return Object.entries(node).some(([key, child]) => (MARKERS as readonly string[]).includes(key) || holdsMarker(child));
};

/**
 * Whether no schema `ref` reaches, through any chain of references, carries a marker. The walk
 * follows references path by path, which on a schema graph as shared as Stripe's reaches each
 * schema along millions of paths (contractdiff-bench): a part that can record nothing is skipped,
 * and {@link memberIn} answers for the members it would have listed.
 */
const isMarkerFree = (scan: Scan, ref: string): boolean => {
  const known = scan.markerFree.get(ref);
  // Stryker disable next-line ConditionalExpression: equivalent, the cache only saves repeating the same walk
  if (known !== undefined) return known;
  // Stryker disable next-line ArrayDeclaration: equivalent, the start is popped first and its references lead back to it at most once more
  const seen = new Set<string>([ref]);
  const queue = [ref];
  let free = true;
  while (free && queue.length > 0) {
    const target = lookup(scan.contract.document, queue.pop() as string);
    if (holdsMarker(target)) free = false;
    for (const next of refsIn(target)) {
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  // Stryker disable next-line CallExpression: equivalent, the cache only saves repeating the same walk
  scan.markerFree.set(ref, free);
  return free;
};

/** The local references anywhere under a value. */
// Stryker disable next-line ArrayDeclaration: equivalent, a name that is no pointer looks up nothing, and nothing holds no marker
const refsIn = (node: unknown, into: string[] = []): string[] => {
  if (Array.isArray(node)) for (const item of node) refsIn(item, into);
  else if (isDict(node)) {
    const ref = localRef(node);
    if (ref !== undefined) into.push(ref);
    for (const child of Object.values(node)) refsIn(child, into);
  }
  return into;
};

/** The schemas a member's next step can be read from: itself, what it references, and its `allOf` branches, as the walk reads them. */
const facesOf = (document: unknown, schema: unknown, seen: Set<unknown> = new Set()): Dict[] => {
  // Stryker disable next-line ArrayDeclaration: equivalent, a face that is not a schema has no children to match
  if (!isDict(schema) || seen.has(schema)) return [];
  seen.add(schema);
  const ref = localRef(schema);
  // Stryker disable next-line ArrayDeclaration: equivalent, a face that is not a schema has no children to match
  return [schema, ...(ref === undefined ? [] : facesOf(document, lookup(document, ref), seen)), ...arrayOf(schema.allOf).flatMap((branch) => facesOf(document, branch, seen))];
};

/** Whether `pointer` names a member under `schema`, in the walk's own pointer vocabulary ({@link childrenOf}). */
const memberIn = (document: unknown, schema: unknown, pointer: string): boolean => {
  if (pointer === '') return isDict(schema);
  return facesOf(document, schema).some((face) => childrenOf(face, '').some(([child, where]) => (pointer === where || pointer.startsWith(`${where}/`)) && memberIn(document, child, pointer.slice(where.length))));
};

const walk = (scan: Scan, at: At, schema: unknown, pointer: string): void => {
  if (!isDict(schema)) return;
  scan.members.add(keyOf(at.operation.id, at.payload, pointer));
  record(scan, at, pointer, schema);
  follow(scan, at, schema, pointer);
  for (const [child, where] of childrenOf(schema, pointer)) walk(scan, at, child, where);
  for (const branch of arrayOf(schema.allOf)) walk(scan, at, branch, pointer);
};

/** Whether `key` names a member of `contract` that the walk skipped as unable to hold a marker. */
const memberOf = (contract: Contract, key: string): boolean => {
  const [id, payload, pointer] = key.split('\n') as [string, string, string];
  const schema = contract.operations.find((operation) => operation.id === id)?.payloads.find((candidate) => candidate.name === payload)?.schema;
  return memberIn(contract.document, schema, pointer);
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
  // Stryker disable next-line ConditionalExpression: equivalent, a primitive that is marked anyway has no children to walk and is never looked up
  if (!(isDict(node) || Array.isArray(node))) return;
  if (marked.has(node)) return;
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

/** R2 and R3 for one object: each of its keys that is a near-miss spelling, or a marker where none may be. */
const audit = (scan: Scan, holders: Holders, node: object, pointer: string): void => {
  const here = `#${pointer}`;
  // Looked up only when a finding is made: a scan of every node against every operation is
  // quadratic, minutes on a spec with a thousand operations (contractdiff-bench, Stripe).
  const where = (): Place => ({
    operation: scan.contract.operations.find((operation) => here === operation.source || here.startsWith(`${operation.source}/`))?.id ?? '(document)',
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
          after: (node as Dict)[key],
          fix: `\`${key}\` at ${here} is not on a schema member, an operation or a parameter. fix: move it onto the member it describes, or remove it`,
        }),
      );
    }
  }
};

/** R2 and R3 over the whole document: a marker off its positions, a near-miss spelling anywhere. */
const scanDocument = (scan: Scan, holders: Holders, node: unknown, pointer: string): void => {
  if (typeof node !== 'object' || node === null) return;
  audit(scan, holders, node, pointer);
  for (const [key, child] of Object.entries(node)) {
    if (!DATA.has(key)) scanDocument(scan, holders, child, `${pointer}/${token(key)}`);
  }
};

/** The findings in the order found, each once: an `allOf` branch is read twice, and says what is wrong with it twice. */
const unique = (findings: readonly Finding[]): Finding[] => [
  ...new Map(
    findings.map((finding) => [JSON.stringify([finding.id, finding.operation, finding.source, finding.payload, finding.pointer, finding.before]), finding] as const),
  ).values(),
];

/**
 * Read one contract's markers (R1 to R4). Pure: the same contract gives the same result.
 * `level` only decides how the problems are graded; without one they are warnings.
 */
export const readDecisions = (contract: Contract, level?: DecisionLevel): Decisions => {
  const scan: Scan = {
    contract,
    level,
    decisions: new Map(),
    members: new Set(),
    problems: [],
    markerFree: new Map(),
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
    members: { has: (key) => scan.members.has(key) || memberOf(contract, key) },
    problems: unique(scan.problems),
  };
};

/** Each member of `contract` that carries a marker (R1): operation id, payload and pointer to its decision. */
export const decisionsOf = (contract: Contract): ReadonlyMap<string, Decision> => readDecisions(contract).decisions;

// --- Holding a change to its decision (R5 to R10) ---

export interface DecisionOptions {
  /** `YYYY-MM-DD`: the day a sunset is judged against. The caller pins it; nothing here reads the clock. */
  readonly today: string;
  readonly level: DecisionLevel;
  /** `--changeset` was given: it writes a major bump for a breaking verdict, which is the version move R10 asks for. */
  readonly changeset?: boolean | undefined;
}

interface Sides {
  readonly old: Decisions;
  readonly nu: Decisions;
  readonly oldContract: Contract;
  readonly newContract: Contract;
  /** The old operation each operation id of the new contract was paired with (ids first, then routes), as the diff paired them; one that was added is its own. */
  readonly oldOf: ReadonlyMap<string, Operation>;
  readonly options: DecisionOptions;
}

/** `/a/b` and every ancestor of it, down to the root `''`. */
export const prefixes = (pointer: string): string[] => {
  const parts = pointer.split('/');
  return parts.map((_, index) => parts.slice(0, parts.length - index).join('/'));
};

/** A member a finding or a decision is at: `payload` is absent for the operation itself. */
interface Member {
  readonly operation: string;
  readonly payload?: string | undefined;
  readonly pointer: string;
}

/** The decision in force at a member `wanted` accepts: its own, an ancestor's up to the payload root, or the operation's. */
const inForce = (side: Decisions, member: Member, wanted: (decision: Decision) => boolean): Decision | undefined => {
  // Stryker disable next-line ConditionalExpression,ArrayDeclaration: equivalent, a finding on the operation has no payload, and the keys built for a payload that is absent find no decision; the operation's own key follows either way
  const own = member.payload === undefined ? [] : prefixes(member.pointer).map((pointer) => keyOf(member.operation, member.payload as string, pointer));
  const keys = [...own, keyOf(member.operation, '', '')];
  return keys.map((key) => side.decisions.get(key)).find((decision) => decision !== undefined && wanted(decision));
};

/** A member whose sunset date has come: it was deprecated, and the date is on or before today (R8). */
// Stryker disable next-line ConditionalExpression: equivalent, `undefined <= today` is false whichever way the check for a sunset goes
const carriedOut = (today: string) => (decision: Decision) => decision.deprecated === true && decision.sunset !== undefined && decision.sunset <= today;

const hasChange = (decision: Decision): boolean => decision.change !== undefined;

const placeOf = (finding: Finding): Place => ({
  operation: finding.operation,
  source: finding.source,
  document: finding.document,
  payload: finding.payload,
  direction: finding.direction,
  pointer: finding.pointer,
});

/** The operation of the new contract a decision is on: it was read from there. */
const operationOf = (sides: Sides, decision: Decision): Operation => sides.newContract.operations.find((candidate) => candidate.id === decision.operation) as Operation;

/** Where a decision was written, for a finding about it: the new document, at the operation that carries it. */
const placeOfDecision = (sides: Sides, decision: Decision): Place => {
  const operation = operationOf(sides, decision);
  return {
    operation: operation.id,
    source: operation.source,
    document: 'new',
    ...(decision.payload === '' ? {} : { payload: decision.payload }),
    direction: operation.payloads.find((payload) => payload.name === decision.payload)?.direction ?? 'request',
    pointer: decision.pointer,
  };
};

const wordsOfDecision = (decision: Decision): string => wordsFor(decision.operation, decision.payload, decision.pointer);

interface Held {
  readonly findings: Finding[];
  /** The `x-change` decisions that let a breaking change through (R10 asks each for a version move). */
  readonly decidedBy: Map<string, Decision>;
}

/** R5, R8: a breaking change needs an `x-change` on the new side, or a sunset carried out on the old one. */
const holdBreaking = (sides: Sides, comparison: Comparison): Held => {
  const held: Held = { findings: [], decidedBy: new Map() };
  for (const finding of comparison.findings.filter((candidate) => candidate.verdict === 'breaking')) {
    const oldMember = { ...finding, operation: (sides.oldOf.get(finding.operation) as Operation).id };
    if (inForce(sides.old, oldMember, carriedOut(sides.options.today)) !== undefined) continue;
    const decision = inForce(sides.nu, finding, hasChange);
    if (decision !== undefined) {
      held.decidedBy.set(keyOf(decision.operation, decision.payload, decision.pointer), decision);
      continue;
    }
    const where = wordsFor(finding.operation, finding.payload, finding.pointer);
    held.findings.push(
      decisionFinding(sides.options.level, 'missing', placeOf(finding), {
        before: finding.before,
        after: finding.after,
        fix: `breaking change (\`${finding.id}\`) at ${where} with no decision. fix: add \`x-change: <the decision>\` to ${where}, or an ancestor or its operation, naming who decided it; or revert the change`,
      }),
    );
  }
  return held;
};

/** Whether a change in the diff is at the member a decision is on, or inside it. */
export const covers = (decision: Decision, finding: Finding): boolean => {
  if (finding.operation !== decision.operation) return false;
  if (decision.payload === '' || finding.payload === undefined) return true;
  return finding.payload === decision.payload && (finding.pointer === decision.pointer || finding.pointer.startsWith(`${decision.pointer}/`));
};

/** R6: an `x-change` whose member did not change, and that is not one carried over from the old side. */
const holdStale = (sides: Sides, comparison: Comparison): Finding[] =>
  [...sides.nu.decisions.values()]
    .filter((decision) => decision.change !== undefined && !comparison.findings.some((finding) => covers(decision, finding)))
    .filter((decision) => sides.old.decisions.get(keyOf((sides.oldOf.get(decision.operation) as Operation).id, decision.payload, decision.pointer))?.change !== decision.change)
    .map((decision) =>
      decisionFinding(sides.options.level, 'stale', placeOfDecision(sides, decision), {
        before: undefined,
        after: decision.change,
        fix: `\`x-change: ${decision.change}\` at ${wordsOfDecision(decision)} records a change that is not in this diff. fix: remove the marker, or make the change it records`,
      }),
    );

/** R7: a sunset date before today on a member that is still in the contract. */
const holdOverdue = (sides: Sides): Finding[] =>
  [...sides.nu.decisions.values()]
    // Stryker disable next-line ConditionalExpression: equivalent, `undefined < today` is false whichever way the first test goes
    .filter((decision) => decision.sunset !== undefined && decision.sunset < sides.options.today)
    .map((decision) =>
      decisionFinding(sides.options.level, 'overdue', placeOfDecision(sides, decision), {
        before: decision.sunset,
        after: sides.options.today,
        fix: `${wordsOfDecision(decision)} was to go after ${decision.sunset as string} and is still here. fix: remove it as decided, or move \`x-sunset\` to a date that still holds`,
      }),
    );

/** The member a decision's `x-replaced-by` names: a sibling by name, or a JSON Pointer from the member's parent. */
export const replacementKey = (decision: Decision): string => {
  const value = decision.replacedBy as string;
  if (decision.payload === '') return keyOf(value, '', '');
  if (decision.pointer === '')
    return keyOf(decision.operation, decision.payload.startsWith('param:') ? `${decision.payload.slice(0, decision.payload.lastIndexOf(':') + 1)}${value}` : value, '');
  const tokens = decision.pointer.split('/');
  const parent = tokens.slice(0, tokens.at(-2) === 'properties' ? -2 : -1).join('/');
  return keyOf(decision.operation, decision.payload, value.startsWith('/') ? `${parent}${value}` : `${parent}/properties/${token(value)}`);
};

/** R9: an `x-replaced-by` that names nothing in the new contract. */
const holdReplacements = (sides: Sides): Finding[] =>
  [...sides.nu.decisions.values()]
    .filter((decision) => decision.replacedBy !== undefined && !sides.nu.members.has(replacementKey(decision)))
    .map((decision) =>
      decisionFinding(sides.options.level, 'replacement-missing', placeOfDecision(sides, decision), {
        before: decision.replacedBy,
        after: undefined,
        fix: `${wordsOfDecision(decision)} is replaced by \`${decision.replacedBy as string}\`, which is not in the new contract. fix: add that member, or point \`x-replaced-by\` at one that exists`,
      }),
    );

/** The major in a `/v3/` segment of the path an operation is declared under, from its `source` (`#/paths/~1v3~1wallet/get`). */
export const segmentOf = (operation: Operation): string | undefined => {
  const { major } = (/^#\/(?:paths|webhooks)\/[^/]*?~1v(?<major>\d+)(?=~1|\/|$)/.exec(operation.source)?.groups ?? {}) as { major?: string };
  return major;
};

const infoVersion = (contract: Contract): unknown => (isDict(contract.document) && isDict(contract.document.info) ? contract.document.info.version : undefined);

/** The major of a version: `4.0.0`, `v4`, or the number `4`. */
export const majorOf = (version: unknown): string | undefined => {
  const { major } = (/^v?(?<major>\d+)/.exec(String(version))?.groups ?? {}) as { major?: string };
  return major;
};

/** R10: the operation's path gained a new major segment, or `info.version`'s major moved, or `--changeset` writes the bump. */
const versionMoved = (sides: Sides, decision: Decision): boolean => {
  if (sides.options.changeset) return true;
  const [was, is] = [segmentOf(sides.oldOf.get(decision.operation) as Operation), segmentOf(operationOf(sides, decision))];
  const [oldMajor, newMajor] = [majorOf(infoVersion(sides.oldContract)), majorOf(infoVersion(sides.newContract))];
  return (is !== undefined && is !== was) || (oldMajor !== undefined && newMajor !== undefined && oldMajor !== newMajor);
};

/** R10: a breaking change let through by an `x-change` is a new major version, in the path, in `info.version` or in the changeset. */
const holdVersions = (sides: Sides, decidedBy: ReadonlyMap<string, Decision>): Finding[] =>
  [...decidedBy.values()]
    .filter((decision) => !versionMoved(sides, decision))
    .map((decision) =>
      decisionFinding(sides.options.level, 'unversioned', placeOfDecision(sides, decision), {
        before: infoVersion(sides.oldContract),
        after: infoVersion(sides.newContract),
        fix: `\`x-change: ${decision.change as string}\` at ${wordsOfDecision(decision)} decides a breaking change, and the major version did not move. fix: move the path to a new major segment (/v3/ to /v4/), raise the major of \`info.version\`, or pass \`--changeset\` to write a major bump`,
      }),
    );

/**
 * Hold a comparison to the decisions written in the contracts. Markers are read on the new side,
 * because they are the decision; the old side is read for a sunset carried out (R8) and for a
 * marker carried over (R6). Returns every decision finding, graded at `options.level`.
 */
export const checkDecisions = (old: Contract, nu: Contract, comparison: Comparison, options: DecisionOptions): Finding[] => {
  const oldOf = new Map(pair(old.operations, nu.operations).map(([before, after]) => [((after ?? before) as Operation).id, (before ?? after) as Operation] as const));
  const sides: Sides = { old: readDecisions(old, options.level), nu: readDecisions(nu, options.level), oldContract: old, newContract: nu, oldOf, options };
  const held = holdBreaking(sides, comparison);
  return unique([
    ...sides.nu.problems,
    ...held.findings,
    ...holdStale(sides, comparison),
    ...holdOverdue(sides),
    ...holdReplacements(sides),
    ...holdVersions(sides, held.decidedBy),
  ]);
};

/** `comparison` with its decision findings, and, at level `error` only, a verdict that counts them. */
export const withDecisions = (comparison: Comparison, decisions: readonly Finding[], level: DecisionLevel): Comparison => ({
  ...comparison,
  decisions,
  verdict: level === 'error' && decisions.length > 0 ? 'breaking' : comparison.verdict,
});

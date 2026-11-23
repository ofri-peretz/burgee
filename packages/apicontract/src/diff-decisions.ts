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
  /** The old operation each new operation id was paired with (ids first, then routes), as the diff paired them. */
  readonly oldIdOf: ReadonlyMap<string, string>;
  readonly options: DecisionOptions;
}

/** `/a/b` and every ancestor of it, down to the root `''`. */
const prefixes = (pointer: string): string[] => {
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
  const keys = [
    ...(member.payload === undefined ? [] : prefixes(member.pointer).map((pointer) => keyOf(member.operation, member.payload as string, pointer))),
    keyOf(member.operation, '', ''),
  ];
  return keys.map((key) => side.decisions.get(key)).find((decision) => decision !== undefined && wanted(decision));
};

/** A member whose sunset date has come: it was deprecated, and the date is on or before today (R8). */
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

interface Held {
  readonly findings: Finding[];
  /** The `x-change` decisions that let a breaking change through (R10 asks each for a version move). */
  readonly decidedBy: Map<string, Decision>;
}

/** R5, R8: a breaking change needs an `x-change` on the new side, or a sunset carried out on the old one. */
const holdBreaking = (sides: Sides, comparison: Comparison): Held => {
  const held: Held = { findings: [], decidedBy: new Map() };
  for (const finding of comparison.findings.filter((candidate) => candidate.verdict === 'breaking')) {
    const oldMember = { ...finding, operation: sides.oldIdOf.get(finding.operation) ?? finding.operation };
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

/** Where a decision was written, for a finding about it: the new document, at the operation that carries it. */
const placeOfDecision = (sides: Sides, decision: Decision): Place => {
  const operation = sides.newContract.operations.find((candidate) => candidate.id === decision.operation) as Operation;
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

/** Whether a change in the diff is at the member a decision is on, or inside it. */
const covers = (decision: Decision, finding: Finding): boolean => {
  if (finding.operation !== decision.operation) return false;
  if (decision.payload === '' || finding.payload === undefined) return true;
  return finding.payload === decision.payload && (decision.pointer === '' || finding.pointer === decision.pointer || finding.pointer.startsWith(`${decision.pointer}/`));
};

/** R6: an `x-change` whose member did not change, and that is not one carried over from the old side. */
const holdStale = (sides: Sides, comparison: Comparison): Finding[] =>
  [...sides.nu.decisions.values()]
    .filter((decision) => decision.change !== undefined && !comparison.findings.some((finding) => covers(decision, finding)))
    .filter(
      (decision) => sides.old.decisions.get(keyOf(sides.oldIdOf.get(decision.operation) ?? decision.operation, decision.payload, decision.pointer))?.change !== decision.change,
    )
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
    .filter((decision) => decision.sunset !== undefined && decision.sunset < sides.options.today)
    .map((decision) =>
      decisionFinding(sides.options.level, 'overdue', placeOfDecision(sides, decision), {
        before: decision.sunset,
        after: sides.options.today,
        fix: `${wordsOfDecision(decision)} was to go after ${decision.sunset as string} and is still here. fix: remove it as decided, or move \`x-sunset\` to a date that still holds`,
      }),
    );

/** The member a decision's `x-replaced-by` names: a sibling by name, or a JSON Pointer from the member's parent. */
const replacementKey = (decision: Decision): string => {
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

/** A `/v3/` or `/v3` segment of a path: its number. */
const MAJOR_SEGMENT = /\/v(?<major>\d+)(?=\/|$)/;

/** The path an OpenAPI operation is declared under, from its `source` pointer. */
const pathOf = (operation: Operation | undefined): string =>
  /^#\/(?:paths|webhooks)\/(?<path>[^/]+)\//
    .exec(operation?.source ?? '')
    ?.groups?.path?.replaceAll('~1', '/')
    .replaceAll('~0', '~') ?? '';

const infoVersion = (contract: Contract): string | undefined => {
  const version = isDict(contract.document) && isDict(contract.document.info) ? contract.document.info.version : undefined;
  return typeof version === 'string' || typeof version === 'number' ? String(version) : undefined;
};

const majorOf = (version: string | undefined): string | undefined => /^v?(?<major>\d+)/.exec(version ?? '')?.groups?.major;

/** R10: the operation's path gained a new major segment, or `info.version`'s major moved, or `--changeset` writes the bump. */
const versionMoved = (sides: Sides, decision: Decision): boolean => {
  if (sides.options.changeset === true) return true;
  const [before, after] = [sides.oldIdOf.get(decision.operation) ?? decision.operation, decision.operation].map((id, index) =>
    (index === 0 ? sides.oldContract : sides.newContract).operations.find((operation) => operation.id === id),
  );
  const [was, is] = [pathOf(before), pathOf(after)].map((path) => MAJOR_SEGMENT.exec(path)?.groups?.major);
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
  const oldIdOf = new Map(pair(old.operations, nu.operations).flatMap(([before, after]) => (before === undefined ? [] : [[(after ?? before).id, before.id] as const])));
  const sides: Sides = { old: readDecisions(old, options.level), nu: readDecisions(nu, options.level), oldContract: old, newContract: nu, oldIdOf, options };
  const held = holdBreaking(sides, comparison);
  return sorted([
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

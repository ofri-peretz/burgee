import { isNothing } from './check.js';
import { issues } from './issues.js';
import { AWAITED_MAP, AWAITED_RULE, MAPPED, PIPED, REFINED, token } from './own.js';
import { filler, type Parsed, type ParseOptions, starting } from './parse.js';
import { type Issue, type Node, type Out, type Pass, type Rule, type Schema } from './schema.js';

/**
 * The parse that awaits: for a rule or a map of the caller's that answers with a promise
 * (`refineAsync`, `transformAsync`). On an entry of its own, so a program that awaits nothing carries none of
 * it; `parse`, `check` and `issues` are what they were, with no flag for this on their path.
 *
 * The walk is `parse`'s own. Each kind's filler is called with a `fill` that notes the members it
 * asks for, those are awaited, and the filler is called again with a `fill` that hands them back:
 * so no kind is written twice, once for each way of parsing, and a rule or a map runs exactly once.
 */

/** One walk after `check`: the first awaits the rules and maps nothing, the second maps. */
interface Walked {
  readonly pass: Pass;
  readonly options: ParseOptions;
  readonly maps: boolean;
}

/** Where a member is, and what was found wrong at it or under it. */
interface Place {
  readonly at: readonly unknown[];
  readonly failed: Issue[];
}

/** The issue of a rule that said no: written by `issues` itself, from a rule that says no to everything at once, so the words and the message hook are its own. */
const refused = (walked: Walked, schema: Node, value: unknown, place: Place): void => {
  const failing: Node = Object.freeze({ ...schema, own: REFINED, rule: { ...(schema.rule as Rule), test: isNothing } });
  const prefix = place.at.map((key) => token(key as string | number)).join('');
  for (const issue of issues(failing as Schema<unknown>, value, walked.options)) place.failed.push({ ...issue, path: prefix + issue.path });
};

type Drive = (walked: Walked, schema: Node, value: unknown, place: Place) => Promise<unknown>;

/** A rule that is awaited: asked on the first walk, of a value with nothing wrong inside it. */
const ruled: Drive = async (walked, schema, value, place) => {
  const out = await drive(walked, schema.item as Node, value, place);
  if (walked.maps || place.failed.length > 0) return out;
  const holds = await (schema.value as (value: unknown) => Promise<boolean>)(value);
  if (holds !== true) refused(walked, schema, value, place);
  return out;
};

/** A map, awaited or not: run on the second walk, on what the schema it wraps produced, unless something inside failed. */
const mapped: Drive = async (walked, schema, value, place) => {
  const out = await drive(walked, schema.item as Node, value, place);
  return walked.maps && place.failed.length === 0 ? (schema.value as (value: unknown) => unknown)(out) : out;
};

/** A pipe: on the second walk, what the first schema produced is parsed by the second, awaiting what it has to. */
const piped: Drive = async (walked, schema, value, place) => {
  const out = await drive(walked, schema.item as Node, value, place);
  if (!walked.maps || place.failed.length > 0) return out;
  const result = await parseAsync(schema.key as Schema<unknown>, out, walked.options);
  if (result.ok) return result.value;
  const prefix = place.at.map((key) => token(key as string | number)).join('');
  for (const issue of result.issues) place.failed.push({ ...issue, path: prefix + issue.path });
  return out;
};

/**
 * The kinds this walk reads itself, by the pair their builders put on the node: the ones whose
 * filler calls a function of the caller's after `check`. A function run before validation is not
 * one of them: after `check` its filler only passes on what it already made.
 */
const DRIVES: ReadonlyMap<unknown, Drive> = /* @__PURE__ */ new Map<unknown, Drive>([
  [AWAITED_RULE, ruled],
  [AWAITED_MAP, mapped],
  [MAPPED, mapped],
  [PIPED, piped],
]);

/** A member a filler asked for, and where it was when it asked. */
interface Asked {
  readonly schema: Node;
  readonly value: unknown;
  readonly at: readonly unknown[];
}

/**
 * Every other kind, through its own filler, twice. The first call is handed a `fill` that only
 * notes each member asked for; the members are then awaited, all at once; the second call is
 * handed a `fill` that gives them back in the order they were asked for. A filler of these kinds
 * calls nothing of the caller's, so calling it twice runs nothing twice.
 */
const structured: Drive = async (walked, schema, value, place) => {
  const make = filler(schema);
  const asked: Asked[] = [];
  const noting: Pass = { ...walked.pass, late: true, at: [...place.at], fill: (member, input) => (asked.push({ schema: member, value: input, at: [...noting.at] }), input) };
  make(schema, value, noting);
  const places = asked.map(({ at }): Place => ({ at, failed: [] }));
  const outs = await Promise.all(asked.map((member, index) => drive(walked, member.schema, member.value, places[index] as Place)));
  for (const { failed } of places) place.failed.push(...failed);
  let next = 0;
  return make(schema, value, { ...noting, fill: () => outs[next++] });
};

/** What a schema makes of a value after `check`, awaited. Where `undefined` arrived a default stands for it, as in `parse`. */
function drive(walked: Walked, schema: Node, value: unknown, place: Place): Promise<unknown> {
  return (DRIVES.get(schema.own) ?? structured)(walked, schema, value === undefined ? schema.default : value, place);
}

/**
 * `parse`, awaited: the value the schema produces from `value`, or every reason there is none,
 * having awaited every rule and every map that answers with a promise. A schema with none of
 * those parses to what `parse` gives.
 *
 * It is one pass: the value is filled and checked as `parse` does it; then the awaited rules are
 * asked, each once and all that stand beside each other at once; then, if every rule held, the
 * maps run, each once, a map above another after it.
 */
async function parseAsync<T, O>(schema: Schema<T, O>, value: unknown, options: ParseOptions = {}): Promise<Parsed<Out<T, O>>> {
  const wait = { rules: 0 };
  const pass: Pass = { ...starting(options), wait };
  const filled = pass.fill(schema, value, pass);
  if (!schema.check(schema, filled)) return { ok: false, issues: issues(schema, filled, options) };
  if (!pass.met) return { ok: true, value: filled as Out<T, O> };
  const place: Place = { at: [], failed: [] };
  if (wait.rules > 0) await drive({ pass, options, maps: false }, schema, filled, place);
  const out = place.failed.length === 0 ? await drive({ pass, options, maps: true }, schema, filled, place) : filled;
  if (place.failed.length === 0) return { ok: true, value: out as Out<T, O> };
  return { ok: false, issues: options.first === true ? place.failed.slice(0, 1) : place.failed };
}

export { parseAsync };

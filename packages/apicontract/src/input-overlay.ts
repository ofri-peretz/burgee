/**
 * OpenAPI Overlays (1.0, 1.1 and 1.2) applied to a document before an adapter reads it
 * (apicontract-inputs, `--overlay <file>`, repeatable): a team keeps its tweaks to a spec it does
 * not own (renamed operations, hidden internal routes, added `x-` hints) in a file of its own.
 *
 * Each overlay's actions run in order, each on the result of the one before. An action selects
 * nodes with an RFC 9535 JSONPath `target` (`input-overlay-jsonpath.ts`), then removes them
 * (`remove: true`), merges a value into them (`update`), or merges another node of the document
 * into them (`copy`). Merging follows the specification: a member only in the update is added, a
 * primitive replaces a primitive, an array is appended to an array, an object merges into an
 * object, and anything else is refused. A 1.2 action may be a reference to a reusable action under
 * `components.actions`, with its own `target`.
 *
 * The document given is never changed: the result is a copy. An action that selects nothing
 * changes nothing, as the specification says, and `apply` reports it, since a target that no
 * longer matches is how an overlay goes stale.
 */
import { type ContractFinding } from './core/model.js';
import { pointerGet } from './core/resolve.js';
import { type Node, query } from './input-overlay-jsonpath.js';

type Dict = Record<string, unknown>;

const isDict = (value: unknown): value is Dict => typeof value === 'object' && value !== null && !Array.isArray(value);

const isPrimitive = (value: unknown): boolean => !Array.isArray(value) && !isDict(value);

/**
 * Set an own member. A plain assignment of `__proto__`, a key an overlay or a document may well
 * carry, would replace the object's prototype instead of adding a member.
 */
const setMember = (target: Dict | unknown[], key: string | number, value: unknown): void => {
  Object.defineProperty(target, key, { value, writable: true, enumerable: true, configurable: true });
};

/** An overlay this reader cannot apply. The message ends in a `fix:` line. */
export class OverlayError extends Error {
  constructor(reason: string, fix: string) {
    super(`cannot apply the overlay: ${reason}. fix: ${fix}`);
    this.name = 'OverlayError';
  }
}

/** Whether `document` is an Overlay 1.x document. */
export const detect = (document: unknown): boolean => isDict(document) && typeof document.overlay === 'string' && document.overlay.startsWith('1.');

/** Merge `update` into `target` by the specification's rules; `at` names the member for a refusal. */
const merge = (target: Dict, update: Dict, at: string): void => {
  for (const [key, value] of Object.entries(update)) {
    const where = `${at}.${key}`;
    // eslint-disable-next-line conventions/consistent-existence-index-check -- own members only: an inherited `toString` is not one
    const current = Object.hasOwn(target, key) ? Object.getOwnPropertyDescriptor(target, key)?.value : undefined;
    if (current === undefined) setMember(target, key, structuredClone(value));
    else if (isPrimitive(current) && isPrimitive(value)) setMember(target, key, value);
    else if (Array.isArray(current) && Array.isArray(value)) current.push(...structuredClone(value));
    else if (isDict(current) && isDict(value)) merge(current, value, where);
    else throw new OverlayError(`\`${where}\` is ${kindOf(current)} in the document and ${kindOf(value)} in the update`, 'update a member with a value of the same kind, or remove it first');
  }
};

const kindOf = (value: unknown): string => {
  if (Array.isArray(value)) return 'an array';
  return isDict(value) ? 'an object' : 'a primitive';
};

/** Set the value a node is held under; a node without a parent is the document itself. */
const replace = (node: Node, value: unknown, document: { value: unknown }): void => {
  if (node.parent === undefined) document.value = value;
  else setMember(node.parent, node.key as string | number, value);
};

/** Apply `update` to each node: merge into an object, append to an array, replace a primitive. */
const updateEach = (nodes: readonly Node[], update: unknown, target: string, document: { value: unknown }): void => {
  for (const node of nodes) {
    if (Array.isArray(node.value)) {
      node.value.push(...(Array.isArray(update) ? structuredClone(update) : [structuredClone(update)]));
    } else if (isDict(node.value)) {
      if (!isDict(update)) throw new OverlayError(`\`${target}\` selects an object, and the update is ${kindOf(update)}`, 'update an object with an object of the members to merge');
      merge(node.value, update, target);
    } else {
      if (!isPrimitive(update)) throw new OverlayError(`\`${target}\` selects a primitive, and the update is ${kindOf(update)}`, 'replace a primitive with a primitive, or target its parent');
      replace(node, update, document);
    }
  }
};

/** Remove each node from the object or array that holds it; array items last first, so indexes stay true. */
const removeEach = (nodes: readonly Node[], target: string): void => {
  const ordered = nodes.toSorted((a, b) => (typeof a.key === 'number' && typeof b.key === 'number' ? b.key - a.key : 0));
  for (const node of ordered) {
    if (Array.isArray(node.parent)) node.parent.splice(node.key as number, 1);
    else if (node.parent === undefined) throw new OverlayError(`\`${target}\` selects the whole document, which cannot be removed`, 'remove its members instead, e.g. `$.paths`');
    else Reflect.deleteProperty(node.parent, node.key as string);
  }
};

/** An action as written, or the reusable action a reference names with the reference's own fields over it. */
const resolveAction = (overlay: Dict, action: unknown, at: string): Dict => {
  if (!isDict(action)) throw new OverlayError(`\`${at}\` is not an action object`, 'write each action as `{ target, update | copy | remove }`');
  if (typeof action.$ref !== 'string') return action;
  if (!action.$ref.startsWith('#/components/actions/')) {
    throw new OverlayError(`\`${at}.$ref\` is \`${action.$ref}\``, 'reference a reusable action as `#/components/actions/<name>`');
  }
  let reusable: unknown;
  try {
    reusable = pointerGet(overlay, action.$ref);
  } catch {
    throw new OverlayError(`\`${at}.$ref\` names \`${action.$ref}\`, which the overlay does not define`, 'define it under `components.actions`');
  }
  const { $ref: _ref, ...own } = action;
  return { ...(isDict(reusable) && isDict(reusable.fields) ? reusable.fields : {}), ...own };
};

/** Run one action on `result.value`; what it reports goes to `findings`. */
const run = (action: Dict, index: number, result: { value: unknown }, findings: ContractFinding[]): void => {
  const at = `actions[${String(index)}]`;
  if (typeof action.target !== 'string') throw new OverlayError(`\`${at}\` has no \`target\``, 'say which nodes it applies to, e.g. `target: $.info`');
  const nodes = query(result.value, action.target);
  const report = (code: string, pointer: string, message: string, fix: string): void => {
    findings.push({ code, pointer: `#/actions/${String(index)}${pointer}`, message, fix });
  };
  if (nodes.length === 0) {
    report('target-matched-nothing', '/target', `\`${action.target}\` selects nothing in the document, so the action changes nothing`, 'update the target to match the document, or remove the action');
    return;
  }
  if (action.remove === true) {
    removeEach(nodes, action.target);
    return;
  }
  if (action.update !== undefined && action.copy !== undefined) throw new OverlayError(`\`${at}\` has both \`update\` and \`copy\``, 'split it into two actions');
  if (action.update !== undefined) {
    updateEach(nodes, action.update, action.target, result);
    return;
  }
  if (typeof action.copy !== 'string') {
    report('action-without-effect', '', `the action on \`${action.target}\` has no \`update\`, \`copy\` or \`remove: true\`, so it changes nothing`, 'say what the action does, or remove it');
    return;
  }
  const sources = query(result.value, action.copy);
  if (sources.length !== 1) throw new OverlayError(`\`${at}.copy\` selects ${String(sources.length)} nodes`, 'copy from a query that selects exactly one node');
  updateEach(nodes, sources[0]?.value, action.target, result);
};

/** One overlay applied to a copy of `document`, and what it reports. */
export const apply = (document: unknown, overlay: unknown): { document: unknown; findings: ContractFinding[] } => {
  if (!detect(overlay)) throw new OverlayError('it has no `overlay: 1.x` member', 'pass an OpenAPI Overlay 1.0, 1.1 or 1.2 document');
  const root = overlay as Dict;
  if (!Array.isArray(root.actions)) throw new OverlayError('it has no `actions` list', 'list the actions to apply under `actions`');
  const result = { value: structuredClone(document) };
  const findings: ContractFinding[] = [];
  for (const [index, written] of root.actions.entries()) run(resolveAction(root, written, `actions[${String(index)}]`), index, result, findings);
  return { document: result.value, findings };
};

/** Apply overlays in order to a copy of `document`. The CLI's `--overlay`, repeatable; `apply` also reports. */
export const applyOverlays = (document: unknown, overlays: readonly unknown[]): unknown =>
  overlays.reduce<unknown>((current, overlay) => apply(current, overlay).document, document);

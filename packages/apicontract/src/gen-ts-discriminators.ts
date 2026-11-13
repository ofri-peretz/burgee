/**
 * Discriminators, found before anything is transformed: which schema declares or inherits one,
 * and, where a mapping names the value, that value written into the mapped schema as an enum.
 */
import { type Discriminator, type Discriminators } from './gen-ts-context.js';
import { type Dict, dict, isDict, list } from './gen-ts-dict.js';
import { createRef, resolveRef } from './gen-ts-ref.js';

type Path = readonly (string | number)[];
type Visit = (node: Dict, path: Path) => void;

const NO_PATH: Path = [];

/** Visit every object in a JSON document, parents first. */
const walk = (node: unknown, visit: Visit, path: Path = NO_PATH): void => {
  if (Array.isArray(node)) {
    for (const [index, item] of node.entries()) walk(item, visit, [...path, index]);
    return;
  }
  if (!isDict(node)) return;
  visit(node, path);
  for (const key of Object.keys(node)) walk(node[key], visit, [...path, key]);
};

const discriminatorEnum = (values: readonly string[], previous: unknown): Dict => {
  const { description } = dict(previous);
  return {
    type: 'string',
    enum: values,
    description: description
      ? `${String(description)} (enum property replaced by openapi-typescript)`
      : 'discriminator enum property added by openapi-typescript',
  };
};

/** Write the discriminator's values into the schema at `ref`. False when that schema cannot carry them. */
const patch = (document: unknown, ref: string, values: readonly string[], name: string): boolean => {
  const schema = dict(resolveRef(document, ref));
  if (Array.isArray(schema.allOf)) {
    schema.allOf.push({ type: 'object', required: [name], properties: { [name]: discriminatorEnum(values, undefined) } });
    return true;
  }
  if (schema.type !== 'object') return false;
  // Changed in place, as upstream does: an array shared through a YAML alias changes everywhere.
  if (!Array.isArray(schema.required)) schema.required = [name];
  else if (!schema.required.includes(name)) schema.required.push(name);
  if (!schema.properties) schema.properties = {};
  const properties = dict(schema.properties);
  setOwn(properties, name, discriminatorEnum(values, new Map(Object.entries(properties)).get(name)));
  return true;
};

/** Each `oneOf` member's values: its schema name, unless the mapping defines values for it. */
const mappedValues = (oneOf: readonly unknown[], discriminator: Discriminator): Map<string, string[]> => {
  const inferred = new Map<string, string[]>();
  for (const item of oneOf) {
    const ref = dict(item).$ref;
    const name = typeof ref === 'string' ? ref.split('/').pop() : undefined;
    if (typeof ref === 'string' && name) inferred.set(ref, [name]);
  }
  const defined = new Map<string, string[]>();
  for (const [value, ref] of Object.entries(discriminator.mapping ?? {})) {
    defined.set(ref, [...(defined.get(ref) ?? []), value]);
  }
  // Defined values replace an inferred one, where it stood; schemas only the mapping names come after.
  return new Map([...inferred, ...defined]);
};

/** A Discriminator Object with a property name, its mapping reduced to the entries that name a schema. */
const asDiscriminator = (value: unknown): Discriminator | undefined => {
  const { propertyName, mapping } = dict(value);
  if (typeof propertyName !== 'string' || propertyName === '') return undefined;
  const targets = Object.entries(dict(mapping)).filter((entry): entry is [string, string] => typeof entry[1] === 'string');
  return isDict(mapping) ? { propertyName, mapping: Object.fromEntries(targets) } : { propertyName };
};

/** Set an own member, whatever its name: a document may call a property `__proto__`. */
const setOwn = (target: object, key: string, value: unknown): void => {
  Object.defineProperty(target, key, { value, enumerable: true, writable: true, configurable: true });
};

/** Pass one: collect every discriminator, and give each `oneOf` member its value. */
const collectDeclared = (document: unknown, found: Discriminators): void => {
  walk(document, (node, path) => {
    const discriminator = asDiscriminator(node.discriminator);
    if (discriminator === undefined) return;
    setOwn(found.objects, createRef(path), discriminator);
    if (!Array.isArray(node.oneOf)) return;
    for (const [ref, values] of mappedValues(node.oneOf, discriminator)) {
      if (found.refsHandled.includes(ref)) continue;
      if (patch(document, ref, values, discriminator.propertyName)) found.refsHandled.push(ref);
    }
  });
};

/** A child found through `allOf`: it inherits the discriminator, and its mapped values are written into it. */
const inherit = (document: unknown, found: Discriminators, child: string, parent: Discriminator): void => {
  const values = Object.entries(parent.mapping ?? {})
    .filter(([, target]) => target === child)
    .map(([value]) => value);
  if (values.length > 0 && patch(document, child, values, parent.propertyName)) found.refsHandled.push(child);
  setOwn(found.objects, child, { ...parent });
};

/** Pass two: the schemas that inherit a discriminator through `allOf`. */
const collectInherited = (document: unknown, found: Discriminators): void => {
  walk(document, (node, path) => {
    for (const item of list(node.allOf)) {
      const member = dict(item);
      if ('$ref' in member) {
        const parent = found.objects[String(member.$ref)];
        // Upstream stops at the first member that does not lead to a discriminator.
        if (parent === undefined) return;
        inherit(document, found, createRef(path), parent);
      } else {
        const own = asDiscriminator(member.discriminator);
        if (own !== undefined) setOwn(found.objects, createRef(path), { ...own });
      }
    }
  });
};

/** Every discriminator in `document`. The document is changed: mapped schemas gain their enum property. */
export const scanDiscriminators = (document: unknown): Discriminators => {
  const found: Discriminators = { objects: {}, refsHandled: [] };
  collectDeclared(document, found);
  collectInherited(document, found);
  return found;
};

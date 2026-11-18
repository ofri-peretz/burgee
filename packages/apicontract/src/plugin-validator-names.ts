/**
 * The name each payload is generated under (apicontract-gen-validator R1, R6), shared by the
 * `validator` and `json-schema` targets so one payload has one name in both: `<operationId><Payload>`
 * in PascalCase, in operation-id order, a collision suffixed `2`, `3`, … in that order.
 *
 * `application/json` is the media type of almost every payload, so it is left out of the name:
 * `listPets` + `response:200:application/json` is `ListPetsResponse200`. Any other media type stays.
 */
import { type Contract, type Operation, type Payload } from './core/model.js';

/** One payload, under the name it is generated as. */
export interface Named {
  readonly name: string;
  readonly operation: Operation;
  readonly payload: Payload;
}

const JSON_MEDIA = ':application/json';

/** Words of letters and digits, each with its first letter upper-cased: `get /pets/{id}` is `GetPetsId`. */
const pascal = (text: string): string =>
  text
    // An empty word, at either end, adds nothing to the join: no filter is needed.
    // Stryker disable next-line Regex: equivalent, splitting on each character instead of each run only adds empty words
    .split(/[^A-Za-z0-9]+/u)
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join('');

/** The bare name of one payload: an identifier, so one that would start with a digit starts with `_`. */
export const baseName = (operation: string, payload: string): string => {
  const media = payload.endsWith(JSON_MEDIA) ? payload.slice(0, -JSON_MEDIA.length) : payload;
  const name = `${pascal(operation)}${pascal(media)}`;
  if (name === '') return 'Payload';
  return /^\d/u.test(name) ? `_${name}` : name;
};

/** `base`, or `base2`, `base3`, … : the first that is not taken, which is then taken. */
export const unique = (base: string, taken: Set<string>): string => {
  let name = base;
  for (let suffix = 2; taken.has(name); suffix += 1) name = `${base}${String(suffix)}`;
  taken.add(name);
  return name;
};

/** Every payload of the contract with its name, sorted by operation id, then by the payload's order in the operation. */
export const namedPayloads = (contract: Contract): Named[] => {
  const taken = new Set<string>();
  // Sorted by UTF-16 code unit, the default sort, so every machine and locale agrees; one id's operations keep their order.
  const ids = [...new Set(contract.operations.map((operation) => operation.id))].toSorted();
  const operations = ids.flatMap((id) => contract.operations.filter((operation) => operation.id === id));
  return operations.flatMap((operation) =>
    operation.payloads.map((payload) => {
      // A name already given, even one that was itself a suffixed base, is not given again.
      return { name: unique(baseName(operation.id, payload.name), taken), operation, payload };
    }),
  );
};

/**
 * What the `validator` and `json-schema` tests share: an ajv 8 as a team runs it (strict, with the
 * formats registered, its strict-mode warnings not printed), and a way to load a generated
 * `validators.ts` and call what it exports.
 *
 * ajv is a root devDependency, used by tests only. Its formats are the validator package's own, so
 * the two are compared on keywords, not on two readings of what an email address is.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

// eslint-disable-next-line import-next/no-extraneous-dependencies -- ajv is the root's devDependency: the validator the team already runs, which the output is graded against in tests only
import { Ajv } from 'ajv';
// eslint-disable-next-line import-next/no-extraneous-dependencies -- the same package, its 2020-12 entry
import { Ajv2020 } from 'ajv/dist/2020.js';
import { base64, date, datetime, duration, email, hostname, ipv4, ipv6, regex, time, uuid } from 'truefit/formats';

const FORMATS = [date, datetime, time, duration, email, hostname, ipv4, ipv6, uuid, regex];

/** A compiled ajv check, for a document in the draft it says. */
export const ajvCheck = (document: Readonly<Record<string, unknown>>): ((value: unknown) => boolean) => {
  const ajv = String(document.$schema).includes('draft-07') ? new Ajv({ logger: false }) : new Ajv2020({ logger: false });
  for (const format of FORMATS) ajv.addFormat(format.name, 'pattern' in format ? format.pattern : format.test);
  ajv.addFormat('byte', base64.pattern);
  // eslint-disable-next-line secure-coding/no-directive-injection -- the document is one this suite generated: compiling it is the test
  const check = ajv.compile(document);
  return (value) => check(value);
};

const VALIDATOR = join(import.meta.dirname, '../../../../truefit/src');

/** Write a generated module to `dir` and import it, its imports of the validator package pointed at this checkout's source. */
export const load = async (content: string, dir: string, name: string): Promise<Record<string, unknown>> => {
  const file = join(dir, `${name}.ts`);
  const local = content
    .replaceAll("from 'truefit';", `from ${JSON.stringify(pathToFileURL(join(VALIDATOR, 'index.ts')).href)};`)
    .replaceAll("from 'truefit/json-schema';", `from ${JSON.stringify(pathToFileURL(join(VALIDATOR, 'json-schema.ts')).href)};`);
  writeFileSync(file, local);
  // eslint-disable-next-line node-security/no-dynamic-dependency-loading -- the module is the generated output under test, written by this suite to its own scratch directory
  return (await import(pathToFileURL(file).href)) as Record<string, unknown>;
};

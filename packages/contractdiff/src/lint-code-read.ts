/**
 * The handlers a rule on code reads (apicontract-lint R14): each one the map names for an
 * operation, found in its file with the TypeScript compiler and read once into a `HandlerSummary`.
 *
 * The compiler is the project's own `typescript`, resolved from the project's folder: contractdiff
 * depends on nothing, and a project with TypeScript handlers has it installed. A handler is a
 * method of a class (`PetsController.getPets`, the `nest` target) or a member of an object
 * (`handlers.getPets`, the `hono`, `fastify` and `express` targets).
 */
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';

import type ts from 'typescript';

import { type CodeIndex, type Handler, type HandlerSummary, type Returned } from './lint-code.js';
import { UsageError } from './run-config.js';
import { type ContractMap, handlersOf, MAP_FILE, type MapEntry, parseMap } from './run-map.js';

type Ts = typeof ts;
type FunctionLike = ts.MethodDeclaration | ts.FunctionExpression | ts.ArrowFunction;

/** The project's own TypeScript compiler, or a command line to fix when it has none. */
export const typescriptIn = (root: string): Ts => {
  try {
    return createRequire(join(root, 'package.json'))('typescript') as Ts;
  } catch {
    throw new UsageError('a rule on code reads handlers with the project\'s own `typescript`, and it is not installed here. fix: `npm install --save-dev typescript`, or turn the rule off');
  }
};

/** A name as written: an identifier's or a string literal's text. */
const nameOf = (tsc: Ts, name: ts.Node | undefined): string | undefined => (name !== undefined && (tsc.isIdentifier(name) || tsc.isStringLiteral(name)) ? name.text : undefined);

const isFunctionLike = (tsc: Ts, node: ts.Node): node is FunctionLike => tsc.isMethodDeclaration(node) || tsc.isFunctionExpression(node) || tsc.isArrowFunction(node);

/** `Owner.member` in a file: a class's method, or an object literal's method or function-valued property. */
export const findHandler = (tsc: Ts, file: ts.SourceFile, symbol: string): FunctionLike | undefined => {
  const [owner, member] = symbol.split('.');
  let found: FunctionLike | undefined;
  const memberOf = (members: readonly ts.Node[]): FunctionLike | undefined => {
    for (const each of members) {
      const name = nameOf(tsc, (each as { name?: ts.Node }).name);
      if (name !== member) continue;
      if (tsc.isMethodDeclaration(each)) return each;
      if (tsc.isPropertyAssignment(each) && isFunctionLike(tsc, each.initializer)) return each.initializer;
    }
    return undefined;
  };
  const visit = (node: ts.Node): void => {
    if (found !== undefined) return;
    if (tsc.isClassDeclaration(node) && node.name?.text === owner) found = memberOf(node.members);
    else if (tsc.isVariableDeclaration(node) && nameOf(tsc, node.name) === owner && node.initializer !== undefined && tsc.isObjectLiteralExpression(node.initializer)) found = memberOf(node.initializer.properties);
    else tsc.forEachChild(node, visit);
  };
  visit(file);
  return found;
};

/** The identifier an expression starts from: `input` of `input.body.name`. */
const rootOf = (tsc: Ts, node: ts.Expression): string | undefined => {
  if (tsc.isIdentifier(node)) return node.text;
  return tsc.isPropertyAccessExpression(node) || tsc.isElementAccessExpression(node) ? rootOf(tsc, node.expression) : undefined;
};

/** The name a call calls: `f` of `f()`, `g` of `x.y.g()`. */
const calleeOf = (tsc: Ts, call: ts.CallExpression): string | undefined => {
  const callee = call.expression;
  if (tsc.isIdentifier(callee)) return callee.text;
  return tsc.isPropertyAccessExpression(callee) ? callee.name.text : undefined;
};

/** A `return { status, body }`'s literal status and body keys. */
const returnedOf = (tsc: Ts, object: ts.ObjectLiteralExpression): Returned => {
  // A member with no name as written (a spread, a computed name) is keyed `undefined`, which no lookup asks for.
  const members = new Map(object.properties.map((property) => [nameOf(tsc, property.name), property]));
  const status = members.get('status');
  const body = members.get('body');
  const value = (property: ts.ObjectLiteralElementLike | undefined): ts.Expression | undefined => (property !== undefined && tsc.isPropertyAssignment(property) ? property.initializer : undefined);
  const statusValue = value(status);
  const bodyValue = value(body);
  return {
    ...(statusValue !== undefined && tsc.isNumericLiteral(statusValue) ? { status: Number(statusValue.text) } : {}),
    hasBody: body !== undefined,
    ...(bodyValue !== undefined && tsc.isObjectLiteralExpression(bodyValue)
      ? { bodyKeys: bodyValue.properties.flatMap((property) => [nameOf(tsc, property.name)].filter((name): name is string => name !== undefined)) }
      : {}),
  };
};

/** What a rule on code reads of a handler: its calls, the calls its input reaches, its literal returns. Nested functions' input calls and returns are theirs, not the handler's. */
export const summarize = (tsc: Ts, handler: FunctionLike): HandlerSummary => {
  const first = handler.parameters[0];
  const input = first !== undefined && tsc.isIdentifier(first.name) ? first.name.text : undefined;
  const calls: string[] = [];
  const inputCalls: string[] = [];
  const returns: Returned[] = [];
  const visit = (node: ts.Node, own: boolean): void => {
    if (tsc.isCallExpression(node)) {
      const name = calleeOf(tsc, node);
      if (name !== undefined) {
        calls.push(name);
        // Only the handler's own calls guard its input: one in a callback may run later, or never.
        if (own && input !== undefined && node.arguments.some((argument) => rootOf(tsc, argument) === input)) inputCalls.push(name);
      }
    }
    if (own && tsc.isReturnStatement(node) && node.expression !== undefined && tsc.isObjectLiteralExpression(node.expression)) returns.push(returnedOf(tsc, node.expression));
    tsc.forEachChild(node, (child) => visit(child, own && !isFunctionLike(tsc, child) && !tsc.isFunctionDeclaration(child)));
  };
  if (handler.body !== undefined) visit(handler.body, true);
  return { calls: [...new Set(calls)], inputCalls: [...new Set(inputCalls)], returns };
};

/** Each handler the map names, read from its file under `root`: found, or why not. The map and the compiler are read on the first ask, so a run with no rule on code reads neither. */
export const codeIndexOf = (mapOf: () => ContractMap, root: string, load: () => Ts): CodeIndex => {
  let map: ContractMap | undefined;
  let tsc: Ts | undefined;
  const files = new Map<string, ts.SourceFile | undefined>();
  const sourceOf = (file: string): ts.SourceFile | undefined => {
    // Stryker disable next-line ConditionalExpression: a cache; parsing the file again finds the same handlers.
    if (!files.has(file)) {
      const path = resolve(root, file);
      tsc ??= load();
      files.set(file, existsSync(path) ? tsc.createSourceFile(file, readFileSync(path, 'utf8'), tsc.ScriptTarget.Latest) : undefined);
    }
    return files.get(file);
  };
  const read = (entry: MapEntry): Handler => {
    const where = { file: entry.file, symbol: entry.symbol, target: entry.target };
    const source = sourceOf(entry.file);
    if (source === undefined) return { ...where, missing: `${entry.file} is not there` };
    const found = findHandler(tsc as Ts, source, entry.symbol);
    if (found === undefined) return { ...where, missing: `${entry.symbol} is not in ${entry.file}` };
    return { ...where, line: source.getLineAndCharacterOfPosition(found.getStart(source)).line + 1, summary: summarize(tsc as Ts, found) };
  };
  const cache = new Map<string, readonly Handler[]>();
  return {
    handlersOf: (operation) => {
      if (!cache.has(operation)) {
        map ??= mapOf();
        cache.set(operation, handlersOf(map, operation).map(read));
      }
      return cache.get(operation) as readonly Handler[];
    },
  };
};

/** The project's map, `contractdiff.map.json` at `root`; an empty one when there is none. */
export const mapIn = (root: string): ContractMap => {
  const path = join(root, MAP_FILE);
  // Stryker disable next-line StringLiteral: with no encoding the Buffer parses as the same JSON.
  return parseMap(existsSync(path) ? readFileSync(path, 'utf8') : undefined);
};

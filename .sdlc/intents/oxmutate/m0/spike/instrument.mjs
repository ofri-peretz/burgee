// oxmutate M1-alpha instrumenter: oxc's Rust parser (oxc-parser, native binding) + span edits.
//
//   node instrument.mjs --root <project dir> --mutate <dir relative to root> --out <mutants.json>
//
// Rewrites every non-spec, non-index `.ts` file under <root>/<mutate> in place with mutant
// switches, and writes the mutant list in the Stryker report shape. Mutator and placement rules
// follow Stryker 10.0.0's instrumenter (read from @stryker-mutator/instrumenter/dist/src), so
// the mutant set is comparable 1:1. Regex is not implemented yet (needs a regex mutation engine;
// oxc_regular_expression is the planned source).
import { parseSync, visitorKeys } from 'oxc-parser';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const NS = '__oxmutate__';
const HEADER = `// @ts-nocheck
function oxmNS() { var g = globalThis; var ns = g.${NS} || (g.${NS} = {}); if (ns.activeMutant === undefined && g.process && g.process.env && g.process.env.__OXMUTATE_ACTIVE_MUTANT__) { ns.activeMutant = g.process.env.__OXMUTATE_ACTIVE_MUTANT__; } oxmNS = function () { return ns; }; return ns; }
function oxmCov() { var ns = oxmNS(); var cov = ns.mutantCoverage || (ns.mutantCoverage = { static: {}, perTest: {} }); var c = cov.static; if (ns.currentTestId) { c = cov.perTest[ns.currentTestId] || (cov.perTest[ns.currentTestId] = {}); } for (var i = 0; i < arguments.length; i++) { c[arguments[i]] = (c[arguments[i]] || 0) + 1; } }
function oxmAct(id) { var ns = oxmNS(); if (ns.activeMutant === id) { if (ns.hitCount !== undefined && ++ns.hitCount > ns.hitLimit) { throw new Error('oxmutate: Hit count limit reached (' + ns.hitCount + ')'); } return true; } return false; }
`;

// ── Node classes (ESTree as oxc emits it) ─────────────────────────────────────────────────────
const EXPRESSIONS = new Set([
  'ArrayExpression', 'ArrowFunctionExpression', 'AssignmentExpression', 'AwaitExpression',
  'BinaryExpression', 'CallExpression', 'ChainExpression', 'ClassExpression', 'ConditionalExpression',
  'FunctionExpression', 'Identifier', 'ImportExpression', 'Literal', 'LogicalExpression',
  'MemberExpression', 'MetaProperty', 'NewExpression', 'ObjectExpression', 'SequenceExpression',
  'TaggedTemplateExpression', 'TemplateLiteral', 'ThisExpression', 'UnaryExpression',
  'UpdateExpression', 'YieldExpression', 'TSAsExpression', 'TSSatisfiesExpression',
  'TSNonNullExpression', 'TSTypeAssertion', 'TSInstantiationExpression',
]);
const STATEMENTS = new Set([
  'BlockStatement', 'BreakStatement', 'ContinueStatement', 'DebuggerStatement', 'DoWhileStatement',
  'EmptyStatement', 'ExpressionStatement', 'ForInStatement', 'ForOfStatement', 'ForStatement',
  'IfStatement', 'LabeledStatement', 'ReturnStatement', 'SwitchStatement', 'ThrowStatement',
  'TryStatement', 'VariableDeclaration', 'WhileStatement', 'WithStatement', 'FunctionDeclaration',
  'ClassDeclaration', 'ExportNamedDeclaration', 'ExportDefaultDeclaration', 'ExportAllDeclaration',
]);
const TS_RUNTIME = new Set([
  'TSAsExpression', 'TSSatisfiesExpression', 'TSNonNullExpression', 'TSTypeAssertion',
  'TSInstantiationExpression', 'TSParameterProperty', 'TSEnumDeclaration', 'TSEnumBody', 'TSEnumMember',
  'TSModuleDeclaration', 'TSModuleBlock', 'TSExportAssignment', 'TSImportEqualsDeclaration',
  'TSExternalModuleReference',
]);
// Stryker 10.0.0 also treats `x as T` and enums as type nodes, so it never mutates code inside a
// cast or an enum (util/syntax-helpers.js, tsTypeAnnotationNodeTypes). oxmutate mutates them by
// default; `--stryker-compat` reproduces Stryker's skip for 1:1 parity runs.
const STRYKER_SKIPS = new Set(['TSAsExpression', 'TSEnumDeclaration']);
let strykerCompat = false;
export const setStrykerCompat = (on) => (strykerCompat = on);
const isTypeNode = (n) =>
  (n.type.startsWith('TS') && !TS_RUNTIME.has(n.type)) || (strykerCompat && STRYKER_SKIPS.has(n.type));
const isString = (n) => n?.type === 'Literal' && typeof n.value === 'string';
const isStringish = (n) => isString(n) || n?.type === 'TemplateLiteral';
const isMember = (n) => n?.type === 'MemberExpression';
const isCall = (n) => n?.type === 'CallExpression';

function children(node) {
  const out = [];
  for (const key of visitorKeys[node.type] ?? []) {
    const v = node[key];
    if (Array.isArray(v)) for (const c of v) c && out.push([key, c]);
    else if (v && typeof v.type === 'string') out.push([key, v]);
  }
  return out;
}

// ── Placement (Stryker's three placers) ───────────────────────────────────────────────────────
function canPlaceExpression(node, parent, key) {
  if (!EXPRESSIONS.has(node.type)) return false;
  if (parent.type === 'ChainExpression') return false; // the chain itself is placed, same span
  if (parent.type === 'Property' && key === 'key') return false;
  if ((isMember(node) || isCall(node) || node.type === 'TSNonNullExpression' || node.type === 'ChainExpression') &&
      ((isMember(parent) && !(parent.computed && key === 'property')) ||
       parent.type === 'TSNonNullExpression' ||
       (isCall(parent) && key === 'callee'))) return false;
  if (parent.type === 'TaggedTemplateExpression') return false;
  if (parent.type === 'UnaryExpression' && parent.operator === 'delete') return false;
  if (parent.type === 'AssignmentExpression' && key === 'left') return false;
  return true;
}
function placerFor(node, parent, key) {
  if (parent && canPlaceExpression(node, parent, key)) return 'expression';
  if (STATEMENTS.has(node.type)) return 'statement';
  if (node.type === 'SwitchCase') return 'switchCase';
  return undefined;
}

// ── Mutators (Stryker 10.0.0 semantics, ESTree shapes) ────────────────────────────────────────
const ARITH = { '+': '-', '-': '+', '*': '/', '/': '*', '%': '*' };
const EQUALITY = { '<': ['<=', '>='], '<=': ['<', '>'], '>': ['>=', '<='], '>=': ['>', '<'], '==': ['!='], '!=': ['=='], '===': ['!=='], '!==': ['==='] };
const LOGICAL = { '&&': '||', '||': '&&', '??': '&&' };
const BOOLEAN_OPS = new Set(['!=', '!==', '&&', '<', '<=', '==', '===', '>', '>=', '||']);
const ASSIGN = { '+=': '-=', '-=': '+=', '*=': '/=', '/=': '*=', '%=': '*=', '<<=': '>>=', '>>=': '<<=', '&=': '|=', '|=': '&=', '&&=': '||=', '||=': '&&=', '??=': '&&=' };
const METHODS = new Map([
  ['charAt', null], ['endsWith', 'startsWith'], ['every', 'some'], ['filter', null], ['reverse', null],
  ['slice', null], ['sort', null], ['substr', null], ['substring', null],
  ['toLocaleLowerCase', 'toLocaleUpperCase'], ['toLowerCase', 'toUpperCase'], ['trim', null],
  ['trimEnd', 'trimStart'], ['min', 'max'], ['setDate', 'setTime'], ['setFullYear', 'setMonth'],
  ['setHours', 'setMinutes'], ['setSeconds', 'setMilliseconds'], ['setUTCDate', 'setTime'],
  ['setUTCFullYear', 'setUTCMonth'], ['setUTCHours', 'setUTCMinutes'], ['setUTCSeconds', 'setUTCMilliseconds'],
]);
for (const [k, v] of [...METHODS]) if (v && !['getUTCDate', 'setUTCDate'].includes(k)) METHODS.set(v, k);

function mutate(node, parent, key, src, ctx) {
  const out = [];
  const text = (n) => src.slice(n.start, n.end);
  // Slice from the node's own span, not the operands': parentheses around an operand belong to
  // the parent's text (M1 finding: `(a ?? 0) + 1` lost its opening paren).
  const swapOperator = (left, right, from, to) => {
    const between = src.slice(left.end, right.start);
    const at = between.indexOf(from);
    return src.slice(node.start, left.end) + between.slice(0, at) + to + between.slice(at + from.length) + src.slice(right.start, node.end);
  };
  const afterPrefix = (n) => src.slice(n.start + n.operator.length, n.end);
  const push = (mutatorName, replacement) => out.push({ mutatorName, replacement });

  switch (node.type) {
    case 'BinaryExpression': {
      const op = node.operator;
      if (ARITH[op]) {
        const leftType = node.left.type === 'BinaryExpression' ? node.left.right : node.left;
        if (!isStringish(node.right) && !isStringish(leftType)) push('ArithmeticOperator', swapOperator(node.left, node.right, op, ARITH[op]));
      }
      if (EQUALITY[op]) for (const to of EQUALITY[op]) push('EqualityOperator', swapOperator(node.left, node.right, op, to));
      break;
    }
    case 'LogicalExpression':
      if (LOGICAL[node.operator]) push('LogicalOperator', swapOperator(node.left, node.right, node.operator, LOGICAL[node.operator]));
      break;
    case 'AssignmentExpression':
      if (ASSIGN[node.operator] && !(isStringish(node.right) && !['&&=', '||=', '??='].includes(node.operator)))
        push('AssignmentOperator', swapOperator(node.left, node.right, node.operator, ASSIGN[node.operator]));
      break;
    case 'UnaryExpression':
      if (node.operator === '!') push('BooleanLiteral', afterPrefix(node).trimStart());
      if (node.operator === '+') push('UnaryOperator', `-${afterPrefix(node)}`);
      if (node.operator === '-') push('UnaryOperator', `+${afterPrefix(node)}`);
      if (node.operator === '~') push('UnaryOperator', afterPrefix(node).trimStart());
      break;
    case 'UpdateExpression': {
      const op = node.operator === '++' ? '--' : '++';
      push('UpdateOperator', node.prefix ? `${op}${afterPrefix(node)}` : `${src.slice(node.start, node.end - 2)}${op}`);
      break;
    }
    case 'Literal':
      if (typeof node.value === 'boolean') push('BooleanLiteral', String(!node.value));
      if (isString(node) && validStringParent(node, parent, key)) push('StringLiteral', node.value.length === 0 ? '"Stryker was here!"' : '""');
      break;
    case 'TemplateLiteral':
      if (parent.type !== 'TaggedTemplateExpression')
        push('StringLiteral', node.quasis.length === 1 && node.quasis[0].value.raw.length === 0 ? '`Stryker was here!`' : '``');
      break;
    case 'ArrayExpression':
      push('ArrayDeclaration', node.elements.length ? '[]' : '["Stryker was here"]');
      break;
    case 'NewExpression':
      if (node.callee.type === 'Identifier' && node.callee.name === 'Array') push('ArrayDeclaration', node.arguments.length ? 'new Array()' : 'new Array([])');
      break;
    case 'ObjectExpression':
      if (node.properties.length > 0) push('ObjectLiteral', '{}');
      break;
    case 'ArrowFunctionExpression':
      if (node.body.type !== 'BlockStatement' && !(node.body.type === 'Identifier' && node.body.name === 'undefined')) push('ArrowFunction', '() => undefined');
      break;
    case 'BlockStatement':
      if (node.body.length > 0 && !invalidConstructorBody(node, ctx)) push('BlockStatement', '{}');
      break;
    case 'ForStatement':
      if (!node.test) {
        const semi = src.indexOf(';', node.init ? node.init.end : src.indexOf('(', node.start));
        push('ConditionalExpression', src.slice(node.start, semi + 1) + ' false' + src.slice(semi + 1, node.end));
      }
      break;
    case 'SwitchCase':
      if (node.consequent.length > 0) push('ConditionalExpression', '');
      break;
    case 'ExpressionStatement':
      if (isCall(node.expression) && node.expression.callee.type !== 'Super') push('CallExpression', ';');
      break;
    case 'ThrowStatement':
      if (node.argument.type === 'NewExpression') push('CallExpression', ';');
      break;
  }
  if (node.type === 'CallExpression') {
    if (node.callee.type === 'Identifier' && node.callee.name === 'Array') push('ArrayDeclaration', node.arguments.length ? 'Array()' : 'Array([])');
    const callee = node.callee;
    if (isMember(callee) && callee.property.type === 'Identifier') {
      const to = METHODS.get(callee.property.name);
      if (to === null) {
        // Keep the object's own parentheses: `(a || b).trim()` → `(a || b)`.
        const between = src.slice(callee.object.end, callee.property.start).replace(/\s*(\?\.|\.|\[)\s*$/, '');
        push('MethodExpression', src.slice(callee.start, callee.object.end) + between);
      }
      else if (to !== undefined) push('MethodExpression', src.slice(node.start, callee.property.start) + to + src.slice(callee.property.end, node.end));
    }
    if (node.optional) {
      const between = src.slice(callee.end, node.end);
      push('OptionalChaining', text(callee) + between.replace('?.', ''));
    }
  }
  if (isMember(node) && node.optional) {
    const between = src.slice(node.object.end, node.property.start);
    push('OptionalChaining', text(node.object) + between.replace('?.', node.computed ? '' : '.').replace('..', '.') + src.slice(node.property.start, node.end));
  }
  // ConditionalExpression mutator on boolean expressions and tests (needs the parent).
  if (node.type === 'BinaryExpression' || node.type === 'LogicalExpression' || EXPRESSIONS.has(node.type)) {
    const testOfLoop = ['ForStatement', 'WhileStatement', 'DoWhileStatement'].includes(parent.type) && key === 'test';
    const testOfIf = parent.type === 'IfStatement' && key === 'test';
    const booleanExpr = (node.type === 'BinaryExpression' || node.type === 'LogicalExpression') && BOOLEAN_OPS.has(node.operator);
    if (testOfLoop) push('ConditionalExpression', 'false');
    else if (testOfIf) {
      push('ConditionalExpression', 'true');
      push('ConditionalExpression', 'false');
    } else if (booleanExpr) {
      if (parent.type === 'LogicalExpression' && parent.operator === '||') push('ConditionalExpression', 'false');
      else if (parent.type === 'LogicalExpression' && parent.operator === '&&') push('ConditionalExpression', 'true');
      else {
        push('ConditionalExpression', 'true');
        push('ConditionalExpression', 'false');
      }
    }
  }
  return out;
}

function validStringParent(node, parent, key) {
  const t = parent.type;
  if (t === 'ImportDeclaration' || t.startsWith('Export') || t === 'TSExternalModuleReference' || t === 'JSXAttribute') return false;
  if (t === 'ExpressionStatement' || t === 'ImportExpression') return false;
  if ((t === 'Property' || t === 'PropertyDefinition' || t === 'MethodDefinition') && key === 'key') return false;
  if (t === 'CallExpression' && parent.callee.type === 'Identifier' && ['require', 'Symbol'].includes(parent.callee.name)) return false;
  if (t === 'TSEnumMember' || t === 'TSModuleDeclaration') return false;
  return true;
}

function invalidConstructorBody(block, ctx) {
  const fn = ctx.parentOf.get(block);
  const method = fn && ctx.parentOf.get(fn);
  if (!(method?.type === 'MethodDefinition' && method.kind === 'constructor')) return false;
  const classBody = ctx.parentOf.get(method);
  const tsParams = fn.params.some((p) => p.type === 'TSParameterProperty');
  const initialized = classBody?.body?.some((m) => m.type === 'PropertyDefinition' && m.value);
  if (!(tsParams || initialized)) return false;
  let hasSuper = false;
  const visit = (n) => {
    if (hasSuper || !n) return;
    if (isCall(n) && n.callee.type === 'Super') hasSuper = true;
    for (const [, c] of children(n)) visit(c);
  };
  visit(block);
  return hasSuper;
}

// ── Instrument one file ───────────────────────────────────────────────────────────────────────
let nextId = 0;

export function instrumentFile(src, fileName) {
  const { program, errors } = parseSync(fileName, src, { sourceType: 'module', preserveParens: false });
  if (errors.length) throw new Error(`${fileName}: ${errors[0].message}`);
  const lineStarts = [0];
  for (let i = 0; i < src.length; i++) if (src.charCodeAt(i) === 10) lineStarts.push(i + 1);
  const loc = (offset) => {
    let lo = 0, hi = lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (lineStarts[mid] <= offset) lo = mid; else hi = mid - 1;
    }
    return { line: lo + 1, column: offset - lineStarts[lo] + 1 };
  };

  const ctx = { parentOf: new Map() };
  const placements = new Map(); // node → { placer, mutants: [] }
  const mutants = [];

  // Walk: register placements, collect mutants, attach each to its nearest placement.
  function walk(node, parent, key, ancestors) {
    if (isTypeNode(node) || node.type === 'ImportDeclaration' || node.type === 'Decorator') return 0;
    if (node.declare) return 0;
    ctx.parentOf.set(node, parent);
    const placer = placerFor(node, parent, key);
    if (placer) placements.set(node, { placer, mutants: [] });
    const chain = placer ? [...ancestors, node] : ancestors;
    const before = mutants.length;
    const found = parent ? mutate(node, parent, key, src, ctx) : [];
    for (const m of found) {
      const host = [...chain].reverse().find((a) => placements.has(a));
      const record = {
        id: String(nextId++),
        mutatorName: m.mutatorName,
        replacement: m.replacement,
        node,
        host,
        location: { start: loc(node.start), end: loc(node.end) },
      };
      mutants.push(record);
      placements.get(host).mutants.push(record);
    }
    for (const [k, c] of children(node)) walk(c, node, k, chain);
    // Stryker's CallExpression filter: keep it only when it is the subtree's sole mutant.
    const subtree = mutants.length - before;
    for (const m of mutants.slice(before)) {
      if (m.node === node && m.mutatorName === 'CallExpression' && subtree !== 1) m.dropped = true;
    }
    return subtree;
  }
  walk(program, undefined, undefined, []);
  for (const p of placements.values()) p.mutants = p.mutants.filter((m) => !m.dropped);
  const kept = mutants.filter((m) => !m.dropped);

  // Emit: rebuild the source bottom-up, wrapping each placement that hosts mutants.
  const text = (n) => src.slice(n.start, n.end);
  /** Replacement code of mutant m at its host: the host's original text with m's node swapped. */
  const applied = (m) => {
    const h = m.host;
    if (m.mutatorName === 'ConditionalExpression' && m.node.type === 'SwitchCase') return '';
    return src.slice(h.start, m.node.start) + m.replacement + src.slice(m.node.end, h.end);
  };
  function emit(node) {
    if (isTypeNode(node) || node.type === 'ImportDeclaration' || node.type === 'Decorator' || node.declare) return text(node);
    let out = '';
    let cursor = node.start;
    const kids = children(node).map(([, c]) => c).sort((a, b) => a.start - b.start || b.end - a.end);
    for (const c of kids) {
      if (c.start < cursor) continue; // shorthand properties: key and value share a span
      out += src.slice(cursor, c.start) + emit(c);
      cursor = c.end;
    }
    out += src.slice(cursor, node.end);
    const p = placements.get(node);
    if (!p || p.mutants.length === 0) return out;
    const ids = p.mutants.map((m) => JSON.stringify(m.id)).join(', ');
    if (p.placer === 'expression') {
      // Stryker's nameIfAnonymous: `const f = () => …` keeps `f.name` once wrapped.
      const parent = ctx.parentOf.get(node);
      const named = ['ArrowFunctionExpression', 'FunctionExpression', 'ClassExpression'].includes(node.type) && !node.id &&
        parent?.type === 'VariableDeclarator' && parent.id.type === 'Identifier';
      const original = named ? `(() => { const ${parent.id.name} = ${out}; return ${parent.id.name}; })()` : out;
      let expr = `(oxmCov(${ids}), ${original})`;
      for (const m of p.mutants) expr = `(oxmAct(${JSON.stringify(m.id)}) ? (${applied(m)}) : ${expr})`;
      return expr;
    }
    if (p.placer === 'switchCase') {
      const colon = src.indexOf(':', node.test ? node.test.end : node.start + 'default'.length);
      const head = src.slice(node.start, colon + 1);
      const body = out.slice(colon + 1 - node.start);
      let stmt = `{ oxmCov(${ids});${body} }`;
      for (const m of p.mutants) stmt = `if (oxmAct(${JSON.stringify(m.id)})) {} else ${stmt}`;
      return `${head} ${stmt}`;
    }
    const isBlock = node.type === 'BlockStatement';
    const inner = isBlock ? out.slice(1, -1) : out;
    let stmt = `{ oxmCov(${ids});${inner} }`;
    for (const m of p.mutants) stmt = `if (oxmAct(${JSON.stringify(m.id)})) { ${applied(m)} } else ${stmt}`;
    return isBlock ? `{ ${stmt} }` : stmt;
  }
  const code = kept.length ? HEADER + emit(program) : src;
  return {
    code,
    mutants: kept.map(({ id, mutatorName, replacement, location }) => ({ id, mutatorName, replacement, location, status: 'Pending' })),
  };
}

// ── CLI ───────────────────────────────────────────────────────────────────────────────────────
if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  const arg = (n) => process.argv[process.argv.indexOf(`--${n}`) + 1];
  const root = path.resolve(arg('root'));
  setStrykerCompat(process.argv.includes('--stryker-compat'));
  const dir = path.join(root, arg('mutate'));
  const files = readdirSync(dir).filter((f) => f.endsWith('.ts') && !f.endsWith('.spec.ts') && f !== 'index.ts').sort();
  const t0 = performance.now();
  const report = { schemaVersion: '1', thresholds: { high: 80, low: 60 }, files: {} };
  let total = 0;
  for (const f of files) {
    const abs = path.join(dir, f);
    const src = readFileSync(abs, 'utf8');
    const { code, mutants } = instrumentFile(src, abs);
    writeFileSync(abs, code);
    report.files[path.relative(root, abs)] = { language: 'typescript', source: src, mutants };
    total += mutants.length;
  }
  const ms = performance.now() - t0;
  writeFileSync(arg('out'), JSON.stringify(report));
  console.log(JSON.stringify({ files: files.length, mutants: total, instrumentMs: ms }));
}

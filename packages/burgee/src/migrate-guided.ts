/**
 * `burgee migrate` for the three incumbents with no drop-in: blessed, neo-blessed and
 * terminal-kit (controlroom spec R18, D-168).
 *
 * Their API surfaces are too large to reproduce honestly, so there is no specifier to swap.
 * And controlroom's screen API — `open(runtime, { screen })`, R4 and R19 — is not built, so a
 * rewrite onto it would turn a program that runs into one that does not load. Every rule here
 * therefore **reports and never rewrites**: the file, the line, which pattern it is, and the
 * section of the coming-from guide that covers it. That is the treatment `partial` already
 * gives a drop-in that is not level yet, at the granularity a person needs to move the code by
 * hand. Nothing here changes the exit code, because nothing was attempted and refused.
 *
 * **Decided by evidence, not by names.** `screen.key(` is reported only when `screen` was bound
 * in the same file from one of the three packages — `blessed.screen()`, a destructured `screen`
 * factory, `require('terminal-kit').terminal` — and `.render(` on a React root, or a `screen`
 * from anywhere else, is not. The bindings are read off the token stream `scan` already reads:
 * `const`, `let`, `var` and plain `=`, `import` clauses, and `require` destructuring. A binding
 * that this cannot see, such as a screen passed in as a parameter, is a site it does not
 * report. The file's import of the package still is.
 *
 * Nothing in this file imports `migrate.ts`: `migrate.ts` lexes and calls in, so the two
 * modules have one direction between them.
 */

/** The incumbents a coming-from guide covers instead of a drop-in. */
export type GuidedHost = 'blessed' | 'neo-blessed' | 'terminal-kit';

/** The patterns a guide has a section for; each is one heading on every guide. */
export type GuidedPattern = 'import' | 'screen' | 'alternate-screen' | 'box' | 'list' | 'key' | 'render' | 'mouse' | 'text-input';

export const GUIDED_HOSTS: readonly GuidedHost[] = ['blessed', 'neo-blessed', 'terminal-kit'];

/**
 * The heading each pattern links to, as the docs site slugs it. `scripts/migrate-guides-lock.test.ts`
 * holds every one to a heading on every guide, so a report can never point at an anchor that
 * is not there.
 */
export const SECTIONS: Readonly<Record<GuidedPattern, string>> = {
  import: 'the-mapping',
  screen: 'screen',
  'alternate-screen': 'alternate-screen',
  box: 'box',
  list: 'list',
  key: 'key-handling',
  render: 'render-loop',
  mouse: 'mouse',
  'text-input': 'text-editing-in-a-pane',
};

/**
 * Where the guides are served. controlroom has no docs host yet, so they are on the front
 * door; when it gets one, the front door's `familyRedirects()` sends this path on with a 301,
 * and a report printed today keeps working.
 */
export const GUIDE_BASE = 'https://burgee.interlace.tools/docs/coming-from';

export const guideFor = (host: GuidedHost, pattern: GuidedPattern): string => `${GUIDE_BASE}/${host}#${SECTIONS[pattern]}`;

/** One site a guide covers, without its file. */
export interface GuidedSite {
  line: number;
  from: GuidedHost;
  pattern: GuidedPattern;
  /** The guide's section for this pattern. */
  guide: string;
}

/** One code token, as `migrate.ts`'s lexer emits it: its source text, and a quoted literal's contents as `value`. */
export interface Token {
  text: string;
  line: number;
  value?: string;
}

/** What a name in the file holds, as far as the evidence goes. */
type Kind = 'module' | 'factory' | Instance;

/** A made thing: something with methods, as opposed to the module or a factory that makes it. */
type Instance = 'screen' | 'program' | 'element' | 'terminal' | 'buffer';

interface Binding {
  host: GuidedHost;
  kind: Kind;
  /** For a factory: what calling it makes, and the guide section the call is. */
  makes?: Instance;
  pattern?: GuidedPattern;
}

type Made = readonly [Instance, GuidedPattern];

/**
 * blessed's widget factories, which neo-blessed keeps: what each makes and the guide section
 * that covers it. Looked up in lower case, so the constructors (`new blessed.Screen()`) match.
 */
export const BLESSED_FACTORIES: Readonly<Record<string, Made>> = {
  screen: ['screen', 'screen'],
  program: ['program', 'screen'],
  box: ['element', 'box'],
  text: ['element', 'box'],
  element: ['element', 'box'],
  log: ['element', 'box'],
  layout: ['element', 'box'],
  list: ['element', 'list'],
  listtable: ['element', 'list'],
  listbar: ['element', 'list'],
  textbox: ['element', 'text-input'],
  textarea: ['element', 'text-input'],
};

/** terminal-kit's module members: the terminal it hands out, and its factories. */
export const TERMKIT_MEMBERS: Readonly<Record<string, 'terminal' | Made>> = {
  terminal: 'terminal',
  realTerminal: 'terminal',
  createTerminal: ['terminal', 'screen'],
  ScreenBuffer: ['buffer', 'screen'],
  ScreenBufferHD: ['buffer', 'screen'],
};

/** The calls a guide section covers, per kind of receiver. `on` and `once` are decided by their event. */
export const METHODS: Readonly<Record<Instance, Readonly<Record<string, GuidedPattern>>>> = {
  screen: { key: 'key', onceKey: 'key', unkey: 'key', removeKey: 'key', render: 'render', enableMouse: 'mouse' },
  element: { key: 'key', onceKey: 'key', unkey: 'key', removeKey: 'key', enableMouse: 'mouse' },
  program: { key: 'key', onceKey: 'key', unkey: 'key', alternateBuffer: 'alternate-screen', normalBuffer: 'alternate-screen', enableMouse: 'mouse' },
  terminal: { fullscreen: 'alternate-screen', grabInput: 'key', singleColumnMenu: 'list', singleLineMenu: 'list', singleRowMenu: 'list', gridMenu: 'list', inputField: 'text-input' },
  buffer: { draw: 'render' },
};

/** Properties that hand back another kind: `screen.program`, `box.screen`. */
const MEMBERS: Readonly<Partial<Record<Kind, Readonly<Record<string, Kind>>>>> = {
  screen: { program: 'program' },
  element: { screen: 'screen' },
};

/** Mouse events across the three, by name. A key event is any event whose name starts `key`. */
export const MOUSE_EVENTS: readonly string[] = ['mouse', 'click', 'mousedown', 'mouseup', 'mousemove', 'mouseover', 'mouseout', 'wheeldown', 'wheelup'];

/** The guide section an event subscription is, or `undefined` for an event no guide covers. */
function eventPattern(event: string): GuidedPattern | undefined {
  if (event.startsWith('key')) return 'key';
  return MOUSE_EVENTS.includes(event) ? 'mouse' : undefined;
}

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/u;

/** A token an import clause can hold. A quoted specifier is not one: it ends the clause. */
const CLAUSE = /^(?:[A-Za-z_$][\w$]*|[{},*])$/u;

/** The guided package a specifier names, deep imports included, or `undefined`. */
export function hostOf(specifier: string): GuidedHost | undefined {
  return GUIDED_HOSTS.find((host) => specifier === host || specifier.startsWith(`${host}/`));
}

const NEEDLES = ['blessed', 'terminal-kit'];
const NEEDLE_BYTES = NEEDLES.map((needle) => Buffer.from(needle));

/** The pre-filter, as `mentionsAHost` is for the rewrite: a file that names none of the three cannot import one. */
export function mentionsAGuided(source: string | Buffer): boolean {
  return typeof source === 'string' ? NEEDLES.some((needle) => source.includes(needle)) : NEEDLE_BYTES.some((bytes) => source.includes(bytes));
}

interface Walk {
  tokens: readonly Token[];
  bound: Map<string, Binding>;
  out: GuidedSite[];
}

const text = (w: Walk, i: number): string | undefined => w.tokens[i]?.text;

function report(w: Walk, i: number, host: GuidedHost, pattern: GuidedPattern): void {
  w.out.push({ line: (w.tokens[i] as Token).line, from: host, pattern, guide: guideFor(host, pattern) });
}

/** The index just past the `)` that closes the `(` at `open`, or the end of the stream. */
function pastClose(w: Walk, open: number): number {
  let depth = 0;
  for (let i = open; i < w.tokens.length; i += 1) {
    const t = text(w, i);
    if (t === '(') depth += 1;
    else if (t === ')') {
      depth -= 1;
      if (depth === 0) return i + 1;
    }
  }
  return w.tokens.length;
}

/** What `base.name` holds, when the evidence says. */
function member(base: Binding, name: string): Binding | undefined {
  if (base.kind === 'module') {
    const made = base.host === 'terminal-kit' ? TERMKIT_MEMBERS[name] : BLESSED_FACTORIES[name.toLowerCase()];
    if (made === undefined) return undefined;
    return made === 'terminal' ? { host: base.host, kind: 'terminal' } : { host: base.host, kind: 'factory', makes: made[0], pattern: made[1] };
  }
  const kind = MEMBERS[base.kind]?.[name];
  return kind === undefined ? undefined : { host: base.host, kind };
}

/** A call `base.name(…)` at `at` (the index of `name`): report it when a guide covers it. */
function call(w: Walk, base: Binding, at: number): void {
  const name = text(w, at) as string;
  if (name === 'on' || name === 'once') {
    const event = w.tokens[at + 2]?.value;
    const pattern = event === undefined ? undefined : eventPattern(event);
    if (pattern !== undefined) report(w, at, base.host, pattern);
    return;
  }
  const pattern = METHODS[base.kind as Instance][name];
  if (pattern === undefined) return;
  report(w, at, base.host, pattern);
  // terminal-kit's `grabInput({ mouse: 'button' })` is the one call that asks for the mouse in its options.
  if (name === 'grabInput') {
    const end = pastClose(w, at + 1);
    for (let i = at + 2; i < end; i += 1) if (text(w, i) === 'mouse' && text(w, i + 1) === ':') report(w, i, base.host, 'mouse');
  }
}

/** Where each token of `require('x')` or `import('x')` sits, counted from the keyword. */
const LOAD = { open: 1, specifier: 2, close: 3, past: 4 } as const;

/** The binding an expression's first token starts, and the index after it: `require('x')`, `import('x')`, `new`, or a bound name. */
function primary(w: Walk, i: number): { binding: Binding; next: number } | undefined {
  const t = text(w, i);
  if ((t === 'require' || t === 'import') && text(w, i + LOAD.open) === '(' && text(w, i + LOAD.close) === ')') {
    const host = hostOf(w.tokens[i + LOAD.specifier]?.value ?? '');
    if (host === undefined) return undefined;
    report(w, i + LOAD.specifier, host, 'import');
    return { binding: { host, kind: 'module' }, next: i + LOAD.past };
  }
  if (t === 'new') return primary(w, i + 1);
  const binding = w.bound.get(t as string);
  return binding === undefined ? undefined : { binding, next: i + 1 };
}

/**
 * Follow one expression from `i` — members, calls and factory calls — reporting each call a
 * guide covers, and return what it ends up holding (or `undefined`).
 */
function chain(w: Walk, i: number): Binding | undefined {
  const start = primary(w, i);
  if (start === undefined) return undefined;
  let { binding, next: j } = start;
  for (;;) {
    if (text(w, j) === '(' && binding.kind === 'factory') {
      report(w, j - 1, binding.host, binding.pattern as GuidedPattern);
      binding = { host: binding.host, kind: binding.makes as Kind };
      j = pastClose(w, j);
      continue;
    }
    const name = text(w, j + 1);
    if (text(w, j) !== '.' || name === undefined) return binding;
    if (text(w, j + 2) === '(' && binding.kind !== 'module' && binding.kind !== 'factory') {
      call(w, binding, j + 1);
      return undefined;
    }
    const next = member(binding, name);
    if (next === undefined) return undefined;
    binding = next;
    j += 2;
  }
}

/** Bind `local` to `base.name`, when that is something the evidence follows. */
function bindMember(w: Walk, local: string, base: Binding, name: string): void {
  const next = member(base, name);
  if (next !== undefined) w.bound.set(local, next);
}

/** `{ a, b: c }` or `{ a, b as c }` ending at `close`: each element's imported name and local name. Elements with defaults or nesting are skipped. */
function elements(w: Walk, open: number, close: number, rename: ':' | 'as'): { name: string; local: string }[] {
  const out: { name: string; local: string }[] = [];
  let element: string[] = [];
  for (let i = open + 1; i <= close; i += 1) {
    const t = text(w, i) as string;
    if (t !== ',' && i !== close) {
      element.push(t);
      continue;
    }
    // A name that is not an identifier binds nothing anyone can refer to, and is not a factory either.
    if (element.length === 1) out.push({ name: element[0] as string, local: element[0] as string });
    else if (element.length === 3 && element[1] === rename) out.push({ name: element[0] as string, local: element[2] as string });
    element = [];
  }
  return out;
}

/** After `chain` resolved what starts at `i`: if it is the right-hand side of `x =` or `{ … } =`, bind the names. */
function bindTarget(w: Walk, i: number, value: Binding): void {
  let k = i - 1;
  if (text(w, k) === 'await') k -= 1;
  if (text(w, k) !== '=') return;
  const target = text(w, k - 1) as string;
  if (target === '}') {
    const open = w.tokens.findLastIndex((t, at) => at < k && t.text === '{');
    for (const { name, local } of elements(w, open, k - 1, ':')) bindMember(w, local, value, name);
    return;
  }
  if (IDENTIFIER.test(target) && text(w, k - 2) !== '.') w.bound.set(target, value);
}

/** A static `import … from 'x'` or `import 'x'` at `i`: report it, and bind its clause. Type-only imports bind nothing. */
function staticImport(w: Walk, i: number): void {
  // A clause is names, braces, commas and `*`; anything else (`import.meta`, `import foo =`) ends the search.
  let j = i + 1;
  while (CLAUSE.test(text(w, j) ?? '')) j += 1;
  const host = hostOf(w.tokens[j]?.value ?? '');
  if (host === undefined) return;
  report(w, j, host, 'import');
  const clause = w.tokens.slice(i + 1, j - 1).map((t) => t.text);
  if (text(w, j - 1) !== 'from' || (clause[0] === 'type' && clause.length > 1)) return;
  const module: Binding = { host, kind: 'module' };
  let at = 0;
  // `import from 'x'` is not JavaScript; `import from from 'x'` is, and binds `from`.
  if (IDENTIFIER.test(clause[0] as string)) {
    w.bound.set(clause[0] as string, module);
    at = clause[1] === ',' ? 2 : 1;
  }
  if (clause[at] === '*' && clause[at + 1] === 'as') w.bound.set(clause[at + 2] as string, module);
  if (clause[at] === '{') for (const { name, local } of elements(w, i + 1 + at, i + clause.indexOf('}') + 1, 'as')) bindMember(w, local, module, name);
}

/**
 * Every site in one file's tokens that a coming-from guide covers, in line order, once each.
 *
 * One forward pass: an `import` statement is read as a clause, and every other token that is
 * not a property name (`.x`) is tried as the start of an expression. A binding is made when it
 * is seen, so a use before its declaration in the text is not followed.
 */
export function guidedSites(tokens: readonly Token[]): GuidedSite[] {
  const w: Walk = { tokens, bound: new Map(), out: [] };
  for (let i = 0; i < tokens.length; i += 1) {
    if (text(w, i - 1) === '.') continue;
    if (text(w, i) === 'import' && text(w, i + 1) !== '(') {
      staticImport(w, i);
      continue;
    }
    const value = chain(w, i);
    if (value !== undefined) bindTarget(w, i, value);
  }
  const seen = new Set<string>();
  return w.out
    .filter((site) => {
      const key = `${site.line} ${site.from} ${site.pattern}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.line - b.line);
}

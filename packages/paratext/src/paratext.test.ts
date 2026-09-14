/**
 * What this package promises, in the order a reader would doubt it.
 *
 * 1. Every capability emits its sequence where the terminal understands it.
 * 2. Every capability has a static projection, and `emit` uses it everywhere else — the whole
 *    reason to prefer this over `ansi-escapes`.
 * 3. A capability is **data**: a third party adds one without writing a function, and the
 *    built-ins register through the same call, so they are not privileged.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import { builtins, link, registerBuiltins } from './builtins.js';
import { type Capability, capabilities, capability, check, emit, isDeprecation, refusals, register, reset, schemaFields } from './capability.js';
import { type Runtime } from './runtime.js';
import schema from './schema.json' with { type: 'json' };
import { fieldsUsed, render } from './template.js';

const BEL = '\u0007';
const OSC = '\u001B]';

/** A terminal that understands everything we ship. */
const iterm: Runtime = { env: { TERM_PROGRAM: 'iTerm.app', TERM: 'xterm-256color' }, isTTY: { stdout: true } };
/** A pipe: no TTY, so nothing may put a control byte into it. */
const pipe: Runtime = { env: {}, isTTY: { stdout: false } };

beforeEach(() => {
  reset();
  registerBuiltins();
});

describe('what it ships', () => {
  it('registers every capability under a name, and nothing else', () => {
    expect(capabilities()).toEqual(['bell', 'clipboard', 'cwd', 'image', 'link', 'notify', 'title']);
  });

  it('emits the sequences a supporting terminal understands', () => {
    expect(emit(iterm, 'link', { text: 'Docs', url: 'https://x.dev' })).toBe(`${OSC}8;;https://x.dev${BEL}Docs${OSC}8;;${BEL}`);
    expect(emit(iterm, 'title', { text: 'build' })).toBe(`${OSC}0;build${BEL}`);
    expect(emit(iterm, 'clipboard', { text: 'hi' })).toBe(`${OSC}52;c;aGk=${BEL}`);
    expect(emit(iterm, 'bell')).toBe(BEL);
    expect(emit(iterm, 'image', { base64: 'QQ==', caption: 'a chart' })).toBe(`${OSC}1337;File=inline=1:QQ==${BEL}`);
    expect(emit(iterm, 'cwd', { path: '/tmp' })).toBe(`${OSC}50;CurrentDir=/tmp${BEL}${OSC}9;9;/tmp${BEL}`);
  });

  it('includes an optional group only when its fields are there', () => {
    expect(emit(iterm, 'image', { base64: 'QQ==', caption: 'c', width: '40' })).toBe(`${OSC}1337;File=inline=1;width=40:QQ==${BEL}`);
    expect(emit(iterm, 'notify', { title: 'Done' })).toBe(`${OSC}9;Done${BEL}`);
    expect(emit(iterm, 'notify', { title: 'Done', body: '3 files' })).toBe(`${OSC}9;Done: 3 files${BEL}`);
  });
});

describe('the projection, which is the point', () => {
  it('prints something a human can read instead of bytes a pipe cannot', () => {
    expect(emit(pipe, 'link', { text: 'Docs', url: 'https://x.dev' })).toBe('Docs (https://x.dev)');
    expect(emit(pipe, 'link', { text: 'Docs' })).toBe('Docs');
    expect(emit(pipe, 'image', { base64: 'QQ==', caption: 'a chart' })).toBe('a chart');
    expect(emit(pipe, 'notify', { title: 'Done', body: '3 files' })).toBe('Done: 3 files');
  });

  it('puts no control byte at all into a pipe', () => {
    const everything = [
      emit(pipe, 'link', { text: 'a', url: 'b' }),
      emit(pipe, 'image', { base64: 'QQ==', caption: 'c' }),
      emit(pipe, 'title', { text: 't' }),
      emit(pipe, 'clipboard', { text: 'x' }),
      emit(pipe, 'notify', { title: 'n' }),
      emit(pipe, 'cwd', { path: '/tmp' }),
      emit(pipe, 'bell'),
    ].join('');
    // The failure this guards is the one every incumbent ships: `]1337;File=inline=1;…`
    // printed across a user's screen, or an escape byte landing in a log file.
    expect(everything).not.toMatch(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/);
  });

  it('refuses a capability with no projection, at registration rather than at output', () => {
    const { fallback: _dropped, ...broken } = link;
    expect(() => register(broken as Capability)).toThrow(/fallback must be a template/);
    // An empty projection is a real answer — a window title has nothing to say in a log — so
    // the check accepts '' while refusing absence. Those two are the same rule, not two.
    // `refusals` and not `check`: a bare capability is also a deprecated *document*, and that
    // line is a warning about where it is written, not a complaint about the projection.
    expect(refusals(check({ ...link, fallback: '' }))).toEqual([]);
  });
});

describe('a capability is data, not code', () => {
  it('adds one the package never heard of, written as an object', () => {
    // Kitty's graphics protocol. No functions, so this could equally have come from JSON.
    const kitty: Capability = {
      name: 'kitty-image',
      osc: 'BEL',
      when: { tty: true, term: 'xterm-kitty' },
      encode: '\u001B_Ga=T,f=100;{base64}\u001B\\',
      fallback: '{caption}',
    };
    register(kitty);

    expect(capabilities()).toContain('kitty-image');
    const kittyTerm: Runtime = { env: { TERM: 'xterm-kitty' }, isTTY: { stdout: true } };
    expect(emit(kittyTerm, 'kitty-image', { base64: 'QQ==', caption: 'chart' })).toBe('\u001B_Ga=T,f=100;QQ==\u001B\\');
    expect(emit(pipe, 'kitty-image', { base64: 'QQ==', caption: 'chart' })).toBe('chart');
  });

  it('survives a round trip through JSON, which is the rule 7 bar', () => {
    // If a capability cannot be written in a config file, an agent cannot ship one.
    for (const shipped of builtins) expect(JSON.parse(JSON.stringify(shipped))).toEqual(shipped);
  });

  it('replaces one of ours by name, so a mis-detected terminal is the caller’s to fix', () => {
    register({ ...link, when: {} });
    expect(emit(pipe, 'link', { text: 'Docs', url: 'https://x.dev' })).toBe(`${OSC}8;;https://x.dev${BEL}Docs${OSC}8;;${BEL}`);
  });

  it('falls back to the caller’s text for a name nobody registered, rather than throwing at 3am', () => {
    expect(emit(iterm, 'not-a-capability', { text: 'plain text' })).toBe('plain text');
  });
});

describe('the template language', () => {
  it('has exactly three rules, and they are these', () => {
    expect(render('{a}-{b}', { a: '1', b: '2' })).toBe('1-2');
    expect(render('{a|base64}', { a: 'hi' })).toBe('aGk=');
    expect(render('x[ {b}]', { b: 'y' })).toBe('x y');
    expect(render('x[ {b}]', {})).toBe('x');
    // An empty value counts as absent: `Done: ` reads worse than `Done`.
    expect(render('x[: {b}]', { b: '' })).toBe('x');
  });

  it('reports the fields a capability needs, so a check can say what is missing', () => {
    expect(fieldsUsed(link.encode)).toEqual(['text', 'url']);
    expect(fieldsUsed(capability('image')?.encode ?? '')).toEqual(['base64', 'height', 'width']);
  });
});

describe('the built-ins are not special', () => {
  it('every one is reachable, replaceable and removable like any other', () => {
    for (const shipped of builtins) expect(capability(shipped.name)?.name).toBe(shipped.name);
    reset();
    expect(capabilities()).toEqual([]);
  });

  it('passes its own check, which is the one a third party’s plugin faces', () => {
    for (const shipped of builtins) expect(refusals(check(shipped)), shipped.name).toEqual([]);
  });
});

describe('the schema is the contract, not a copy of it', () => {
  it('declares exactly the fields a capability has — a drift either way is a lie', () => {
    // `check` reads `$defs.capability.required`, so a field added to the schema is enforced
    // without touching the code. This holds the other direction: a field added to the type
    // must be described in the schema, or a plugin author reading it would never know.
    expect(schemaFields()).toEqual(['encode', 'fallback', 'name', 'osc', 'when']);
  });

  it('ships its example, and the example passes its own check', () => {
    // Rule 7's bar is an agent given the schema and one example producing a passing plugin in
    // one turn. That is only true if the example is itself valid.
    for (const example of schema.$defs.capability.examples) expect(refusals(check(example as Capability))).toEqual([]);
  });
});

/**
 * The fold (PLAN 1.1, design R10). paratext had its own schema whose root *was* one
 * capability; the family schema nests that under `capabilities`, beside `spinners`, `tokens`
 * and `components`, and all three packages now ship the same bytes.
 *
 * PLAN D2 takes the break now and pays for it for one minor release: the bare shape still
 * validates and says that it is going.
 */
describe('the fold into the family schema', () => {
  /** The kitty capability of the schema's own example, as a third party would file it. */
  const plugin = {
    name: 'terminal-extras',
    capabilities: {
      'kitty-image': {
        name: 'kitty-image',
        osc: 'BEL',
        when: { tty: true, term: 'xterm-kitty' },
        encode: '_Ga=T,f=100;{base64}\\',
        fallback: '{caption}',
      },
    },
  };

  it('is the family schema: the capability shape is a $defs entry under a `capabilities` key', () => {
    expect(schema.properties.capabilities.$ref).toBe('#/$defs/capabilities');
    expect(schema.$defs.capabilities.additionalProperties.$ref).toBe('#/$defs/capability');
    expect(schema.$defs.capability.required).toEqual(['name', 'osc', 'when', 'encode', 'fallback']);
    // The keys that make it the *family* schema rather than paratext's old one. If these ever
    // vanish, paratext is shipping a fourth shape again and the sha256 check in PLAN 1.1 lies.
    expect(Object.keys(schema.properties)).toContain('spinners');
    expect(Object.keys(schema.$defs)).toContain('border');
  });

  it('validates a plugin that carries its capabilities under `capabilities`', () => {
    expect(check(plugin)).toEqual([]);
  });

  it('says which capability is wrong and where it sits, not merely that something is', () => {
    const { fallback: _dropped, ...broken } = link;
    expect(check({ name: 'terminal-extras', capabilities: { link: broken } })).toEqual([
      'capabilities.link: fallback must be a template, even if it is empty — rule 6 has no opt-out',
    ]);
    // A capability with no name of its own is named by the key it is filed under.
    const { name: _unnamed, ...anonymous } = broken;
    expect(check({ name: 'terminal-extras', capabilities: { link: anonymous } })).toContain('capabilities.link: a capability needs a name');
  });

  it('refuses a `capabilities` that is not a map, and an entry that is not an object', () => {
    expect(check({ name: 'x', capabilities: [] })).toEqual(['capabilities: must be an object of capabilities by name']);
    expect(check({ name: 'x', capabilities: { link: 'nope' } })).toEqual(['capabilities.link: must be an object']);
  });

  it('wants the plugin named, the way every other host does', () => {
    const { name: _dropped, ...unnamed } = plugin;
    expect(check(unnamed)).toEqual(['a plugin needs a name']);
  });

  it('still validates the pre-0.3 bare shape, and says that it is deprecated', () => {
    const lines = check(link);
    // Validates: nothing here refuses the document, so a 0.2 capability file keeps working…
    expect(refusals(lines)).toEqual([]);
    // …and it is told, once, where it is going and when.
    expect(lines.filter(isDeprecation)).toHaveLength(1);
    expect(lines[0]).toContain('link');
    expect(lines[0]).toContain('capabilities');
    expect(lines[0]).toContain('1.0');
  });

  it('registers a bare capability without a word of deprecation — that is the API, not a file', () => {
    // `register` takes one capability by argument. The deprecation is about documents, so it
    // must not fire here, or every built-in would be reporting itself obsolete.
    expect(() => register(link)).not.toThrow();
    const { fallback: _dropped, ...broken } = link;
    expect(() => register(broken as Capability)).toThrow(/fallback must be a template/);
  });
});

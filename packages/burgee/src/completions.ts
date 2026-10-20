/**
 * Completions, generated statically from the manifest (D2): bash, zsh, fish and
 * PowerShell scripts that never run Node on TAB (D3), plus a Fig spec from the same walk
 * (D5). Every script is deterministic for a manifest, so a snapshot pins it and the shell
 * itself exercises it in CI (D4).
 */
import { type ArgumentSpec, type CommandNode, type Manifest, type OptionSpec } from './manifest.js';
import { flagsOf, kebab } from './names.js';

export type Shell = 'bash' | 'zsh' | 'fish' | 'pwsh';
export const SHELLS: readonly Shell[] = ['bash', 'zsh', 'fish', 'pwsh'];

/** The options every program serves; offered at every level, `--schema`/`--mcp` at the root. */
const GLOBAL: Record<string, OptionSpec> = {
  json: { type: 'boolean', description: 'machine-readable output' },
  help: { type: 'boolean', description: 'show this help' },
};
const ROOT_ONLY: Record<string, OptionSpec> = {
  schema: { type: 'boolean', description: 'the program as data' },
  mcp: { type: 'boolean', description: 'serve the program as MCP tools' },
};

interface Node {
  /** Typed path, e.g. `['config', 'get']`; empty for the root. */
  path: string[];
  description: string;
  options: Record<string, OptionSpec>;
  children: Node[];
  /** The other words for this node's last segment (R5), offered beside it and read as it. */
  aliases: readonly string[];
  /** Each typed segment with its aliases, space-separated: what fish has seen when it is on the line. */
  spelled: string[];
  /** The declared positionals, in order (completion-context R3). */
  arguments: readonly ArgumentSpec[];
}

function children(manifest: Manifest, at: string[]): Node[] {
  return manifest.commands
    .filter((c) => c.hidden !== true && c.path.length === at.length + 1 && at.every((seg, i) => c.path[i] === seg))
    .map((c) => nodeOf(manifest, c));
}

/**
 * A spec the *parser* will negate, marked where that is still knowable.
 *
 * `toParseConfig` registers `no-<name>` for the booleans a command declares, and not for the
 * reserved ones — `--no-json` and `--no-help` are not accepted. By the time `flags()` sees
 * an option, `nodeOf` has merged the declared with `GLOBAL` and `ROOT_ONLY` and the two are
 * indistinguishable, so completing every boolean would offer flags the parser refuses.
 * So `negatable` is resolved to an explicit `true` on the declared side of that merge, and
 * only there — and only where the spec does not say `false`, which the commander façade does
 * for every boolean commander would not negate.
 */

function nodeOf(manifest: Manifest, c: CommandNode): Node {
  const visible: Record<string, OptionSpec> = Object.fromEntries(
    Object.entries(c.options)
      .filter(([, spec]) => spec.hidden !== true)
      .map(([name, spec]) => [name, { ...spec, negatable: spec.type === 'boolean' && spec.negatable !== false }]),
  );
  const depth = manifest.rootPath.length;
  const isRoot = c.path.length === depth;
  return {
    path: c.path.slice(depth),
    aliases: c.aliases ?? [],
    spelled: c.path.slice(depth).map((seg, i) => [seg, ...(manifest.find(c.path.slice(0, depth + i + 1))?.aliases ?? [])].join(' ')),
    description: c.summary ?? c.description ?? '',
    options: { ...visible, ...GLOBAL, ...(isRoot ? ROOT_ONLY : {}) },
    children: children(manifest, c.path),
    // Stryker disable next-line ArrayDeclaration: equivalent — a placeholder element has no `complete`, so no positional of it is dynamic, as with none
    arguments: c.arguments ?? [],
  };
}

/** The tree the templates walk; the root's own name is the program name. */
export function completionTree(manifest: Manifest): { program: string; root: Node } {
  const root = manifest.find(manifest.rootPath) ?? { path: manifest.rootPath, options: {} };
  return { program: manifest.rootPath.join('-') || 'program', root: nodeOf(manifest, root) };
}

/** Every node, depth first, root first. */
function walk(root: Node): Node[] {
  const out: Node[] = [];
  const stack = [root];
  while (stack.length > 0) {
    const node = stack.pop() as Node;
    out.push(node);
    stack.push(...[...node.children].reverse());
  }
  return out;
}

/** The word a user types for a child: the last of its path, which a child always has. */
const word = (child: Node): string => child.path.at(-1) as string;
/** Every word that names a child: its own, then its aliases (R5). */
const words = (child: Node): string[] => [word(child), ...child.aliases];
/** The typed paths an alias stands for, each beside the canonical path it is read as (R5). */
const aliased = (nodes: Node[]): [string, string][] => nodes.flatMap((n) => n.aliases.map((a): [string, string] => [[...n.path.slice(0, -1), a].join(' '), n.path.join(' ')]));

const sq = (s: string): string => `'${s.replaceAll("'", "'\\''")}'`;
const flags = (name: string, spec: OptionSpec): string[] => {
  const long = `--${kebab(name)}`;
  const spellings = spec.short === undefined ? [long] : [`-${spec.short}`, long];
  return spec.negatable === true ? [...spellings, `--no-${kebab(name)}`] : spellings;
};
const takesValue = (spec: OptionSpec): boolean => spec.type !== 'boolean';
/**
 * D3 — the callback a declared completer is reached through; nothing else runs the program.
 * completion-context R4: each shell passes the words before the cursor, then the partial, in the
 * same shape, so a completer is handed the same context whichever shell asked. `words` is the
 * shell's own expression for the words before the cursor, without the program's name.
 */
const callback = (program: string, words: string, partial: string): string => `${program} __complete ${words} ${partial}`;
const isDynamic = (spec: OptionSpec | ArgumentSpec): boolean => spec.complete !== undefined;
/** Whether a positional of this command completes through its declared completer (R3). */
const dynamicArgs = (node: Node): boolean => node.arguments.some(isDynamic);
/** What the header promises, true of the script beneath it. */
const promise = (program: string, root: Node): string => {
  const nodes = walk(root);
  if (nodes.some(dynamicArgs)) return `runs ${program} on TAB only for the options and arguments that declare a completer`;
  return nodes.some((n) => Object.values(n.options).some(isDynamic)) ? `runs ${program} on TAB only for options that declare a completer` : `never runs ${program} on TAB`;
};
const fname = (program: string, path: string[]): string => `_${[program, ...path].join('_').replaceAll(/[^A-Za-z0-9_]/g, '_')}`;

// ───── bash ─────────────────────────────────────────────────────────────────────────────

/** bash's words before the cursor: `words` from `_get_comp_words_by_ref`, or `COMP_WORDS`, without the program. */
const BASH_WORDS = '"${words[@]:1:cword-1}"';

function bashCase(program: string, node: Node): string {
  const opts = Object.entries(node.options).flatMap(([n, s]) => flags(n, s));
  const subs = node.children.flatMap(words);
  const ask = `$(${callback(program, BASH_WORDS, '"$cur"')} 2>/dev/null)`;
  const valued = Object.entries(node.options)
    .filter(([, s]) => takesValue(s))
    .map(([n, s]) =>
      isDynamic(s)
        ? `      ${flags(n, s).join('|')}) COMPREPLY=($(compgen -W "${ask}" -- "$cur")); return ;;`
        : `      ${flags(n, s).join('|')}) COMPREPLY=($(compgen -W ${sq((s.choices ?? []).join(' '))} -- "$cur")); return ;;`,
    )
    .join('\n');
  return `  ${fname(program, node.path)}() {
    case "$prev" in
${valued === '' ? '      *) ;;' : `${valued}\n      *) ;;`}
    esac
    if [[ "$cur" == -* ]]; then COMPREPLY=($(compgen -W ${sq(opts.join(' '))} -- "$cur")); return; fi
    COMPREPLY=($(compgen -W ${sq(subs.join(' '))}${dynamicArgs(node) ? `" ${ask}"` : ''} -- "$cur"))
  }`;
}

function bash(program: string, root: Node): string {
  const nodes = walk(root);
  const dispatch = nodes
    .filter((n) => n.path.length > 0)
    .map((n) => `      ${sq(n.path.join(' '))}) ${fname(program, n.path)}; return ;;`)
    .join('\n');
  return `# ${program} completion for bash, generated by burgee — ${promise(program, root)}.
# Install: ${program} completion bash > ~/.local/share/bash-completion/completions/${program}
_${program}_main() {
  local cur prev words cword
  _get_comp_words_by_ref -n : cur prev words cword 2>/dev/null || { cur="\${COMP_WORDS[COMP_CWORD]}"; prev="\${COMP_WORDS[COMP_CWORD-1]}"; words=("\${COMP_WORDS[@]}"); cword=$COMP_CWORD; }
${nodes.map((n) => bashCase(program, n)).join('\n')}
  # The deepest command named by the words before the cursor decides what to offer.
  local path="" i
  for ((i = 1; i < cword; i++)); do
    case "\${words[i]}" in -*) continue ;; esac
    case "\${path:+$path }\${words[i]}" in
${nodes
  .filter((n) => n.path.length > 0)
  .map((n) => `      ${sq(n.path.join(' '))}) path="\${path:+$path }\${words[i]}" ;;`)
  .concat(aliased(nodes).map(([typed, path]) => `      ${sq(typed)}) path=${sq(path)} ;;`))
  .join('\n')}
    esac
  done
  case "$path" in
${dispatch}
      *) ${fname(program, [])} ;;
  esac
}
complete -F _${program}_main ${program}
`;
}

// ───── zsh ──────────────────────────────────────────────────────────────────────────────

/**
 * zsh's words before the cursor. A command's function runs after its parent's `*::` state, which
 * leaves `words[1]` as the command's own word, so the path above it is spelled out; the root's
 * `words[1]` is the program.
 */
const zshWords = (node: Node): string => [...node.path.slice(0, -1), node.path.length === 0 ? '"${(@Q)words[2,CURRENT-1]}"' : '"${(@Q)words[1,CURRENT-1]}"'].join(' ');
/** The `_arguments` action that lists what the program's completer returned. */
const zshAsk = (program: string, node: Node): string => `{compadd -- \${(f)"$(${callback(program, zshWords(node), '"$PREFIX"')} 2>/dev/null)"}}`;

function zshOptionSpec(program: string, node: Node, name: string, spec: OptionSpec): string {
  const desc = (spec.description ?? '').replaceAll(/[[\]:]/g, ' ');
  const listed = spec.choices === undefined ? ' ' : `(${spec.choices.join(' ')})`;
  const action = isDynamic(spec) ? zshAsk(program, node) : listed;
  const value = takesValue(spec) ? `:${name}:${action}` : '';
  return flags(name, spec)
    .map((f) => sq(`${f}[${desc}]${value}`))
    .join(' ');
}

function zshFunction(program: string, node: Node): string {
  const options = Object.entries(node.options).map(([n, s]) => zshOptionSpec(program, node, n, s));
  if (node.children.length === 0) {
    // R3 — a positional with a completer asks the program, slot by slot; a file argument and one
    // with no completer keep `_files`, which is all any positional had before.
    const slots = dynamicArgs(node)
      ? node.arguments.map((a, i) => sq(`${a.variadic === true ? '*' : i + 1}: :${isDynamic(a) && a.type !== 'file' ? zshAsk(program, node) : '_files'}`)).join(' ')
      : "'*: :_files'";
    return `${fname(program, node.path)}() {\n  _arguments -s ${options.join(' ')} ${slots}\n}`;
  }
  const subs = node.children.flatMap((c) => words(c).map((w) => sq(`${w}[${c.description.replaceAll(/[[\]:]/g, ' ')}]`))).join(' ');
  const dispatch = node.children.map((c) => `      ${words(c).join('|')}) ${fname(program, c.path)} ;;`).join('\n');
  return `${fname(program, node.path)}() {
  local context state state_descr line
  typeset -A opt_args
  _arguments -s -C ${options.join(' ')} '1: :->command' '*:: :->args'
  case $state in
    command) _values 'command' ${subs} ;;
    args) case $line[1] in
${dispatch}
    esac ;;
  esac
}`;
}

function zsh(program: string, root: Node): string {
  return `#compdef ${program}
# ${program} completion for zsh, generated by burgee — ${promise(program, root)}.
# Install: ${program} completion zsh > "\${fpath[1]}/_${program}" && compinit
${walk(root).map((n) => zshFunction(program, n)).join('\n')}
if [[ $zsh_eval_context[-1] == loadautofunc ]]; then ${fname(program, [])} "$@"; else compdef ${fname(program, [])} ${program}; fi
`;
}

// ───── fish ─────────────────────────────────────────────────────────────────────────────

function fishCondition(node: Node): string {
  if (node.path.length === 0) return '__fish_use_subcommand';
  return node.spelled.map((seg) => `__fish_seen_subcommand_from ${seg}`).join('; and ');
}

/** Where a fish `complete` line is written: the program and the condition. */
interface FishSite {
  program: string;
  cond: string;
}

/** fish's words before the cursor: the tokens `commandline -opc` lists, less the program's own. */
const FISH_WORDS = '(set -l w (commandline -opc); set -e w[1]; string join \\n -- $w)';
const fishAsk = (program: string): string => sq(`(${callback(program, FISH_WORDS, '(commandline -ct)')} 2>/dev/null)`);

function fishOption({ program, cond }: FishSite, name: string, spec: OptionSpec): string {
  const short = spec.short === undefined ? '' : ` -s ${spec.short}`;
  const listed = spec.choices === undefined ? '' : ` -f -a ${sq(spec.choices.join(' '))}`;
  const choices = isDynamic(spec) ? ` -f -a ${fishAsk(program)}` : listed;
  const value = takesValue(spec) ? ` -r${choices}` : '';
  return `complete -c ${program} -n ${cond}${short} -l ${name}${value} -d ${sq(spec.description ?? '')}`;
}

function fish(program: string, root: Node): string {
  const lines: string[] = [];
  for (const node of walk(root)) {
    const cond = sq(fishCondition(node));
    for (const c of node.children) for (const w of words(c)) lines.push(`complete -c ${program} -n ${cond} -f -a ${w} -d ${sq(c.description)}`);
    if (dynamicArgs(node)) lines.push(`complete -c ${program} -n ${cond} -f -a ${fishAsk(program)}`);
    for (const [name, spec] of Object.entries(node.options)) {
      // `kebab`, which fish alone was missing: it emitted `-l dryRun` where the CLI form is
      // `--dry-run`, so every camelCase option was completed as a flag the parser refuses.
      lines.push(fishOption({ program, cond }, kebab(name), spec));
      // The negation carries no short form — `-s q` belongs to the positive spelling only.
      // Omitted rather than set to `undefined`, which `exactOptionalPropertyTypes` refuses.
      if (spec.negatable === true) {
        const { short: _short, ...unshort } = spec;
        lines.push(fishOption({ program, cond }, `no-${kebab(name)}`, unshort));
      }
    }
  }
  return `# ${program} completion for fish, generated by burgee — ${promise(program, root)}.
# Install: ${program} completion fish > ~/.config/fish/completions/${program}.fish
${lines.join('\n')}
`;
}

// ───── PowerShell ───────────────────────────────────────────────────────────────────────

function pwshEntry(node: Node): string {
  const subs = node.children.flatMap((c) => words(c).map((w) => `@('${w}', 'Command', '${c.description.replaceAll("'", "''")}')`));
  const opts = Object.entries(node.options).flatMap(([n, s]) =>
    flags(n, s).map((f) => `@('${f}', 'ParameterName', '${(s.description ?? '').replaceAll("'", "''")}')`),
  );
  const values = Object.entries(node.options)
    .filter(([, s]) => s.choices !== undefined)
    .map(([n, s]) => `'--${kebab(n)}' = @(${(s.choices as readonly string[]).map((c) => `'${c}'`).join(', ')})`);
  const dynamic = Object.entries(node.options)
    .filter(([, s]) => isDynamic(s))
    .map(([n]) => `'--${kebab(n)}' = $true`);
  const callbacks = dynamic.length === 0 ? '' : `; Dynamic = @{ ${dynamic.join('; ')} }`;
  const positional = dynamicArgs(node) ? '; Positional = $true' : '';
  return `    '${node.path.join(' ')}' = @{ Items = @(${[...subs, ...opts].join(', ')}); Values = @{ ${values.join('; ')} }${callbacks}${positional} }`;
}

function pwsh(program: string, root: Node): string {
  // R5 — an alias typed in a command's place is read as that command; only a program with one carries the table.
  const aliases = aliased(walk(root)).map(([typed, path]) => `'${typed}' = '${path}'`);
  const alias = aliases.length === 0 ? '' : `\n  $alias = @{ ${aliases.join('; ')} }`;
  const unalias = aliases.length === 0 ? '' : `\n    if ($alias.ContainsKey($candidate)) { $candidate = $alias[$candidate] }`;
  return `# ${program} completion for PowerShell, generated by burgee — ${promise(program, root)}.
# Install: ${program} completion pwsh > ${program}-completion.ps1, then dot-source it from $PROFILE
Register-ArgumentCompleter -Native -CommandName '${program}' -ScriptBlock {
  param($wordToComplete, $commandAst, $cursorPosition)
  $table = @{
${walk(root).map(pwshEntry).join('\n')}
  }${alias}
  $words = @($commandAst.CommandElements | ForEach-Object { $_.Extent.Text } | Select-Object -Skip 1)
  if ($wordToComplete -ne '' -and $words.Count -gt 0) { $words = @($words | Select-Object -First ($words.Count - 1)) }
  $path = ''
  foreach ($w in $words) {
    if ($w -like '-*') { continue }
    $candidate = if ($path -eq '') { $w } else { "$path $w" }${unalias}
    if ($table.ContainsKey($candidate)) { $path = $candidate }
  }
  $entry = $table[$path]
  $prev = if ($words.Count -gt 0) { $words[$words.Count - 1] } else { '' }
${
  walk(root).some((n) => Object.values(n.options).some(isDynamic))
    ? `  if ($entry.Dynamic -and $entry.Dynamic.ContainsKey($prev)) {
    & '${program}' __complete @words $wordToComplete 2>$null | ForEach-Object { [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_) }
    return
  }
`
    : ''
}  if ($entry.Values.ContainsKey($prev)) {
    $entry.Values[$prev] | Where-Object { $_ -like "$wordToComplete*" } | ForEach-Object { [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_) }
    return
  }
${
  walk(root).some(dynamicArgs)
    ? `  if ($entry.Positional -and $wordToComplete -notlike '-*') {
    $found = @(& '${program}' __complete @words $wordToComplete 2>$null)
    if ($found.Count -gt 0) { $found | ForEach-Object { [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_) }; return }
  }
`
    : ''
}  $entry.Items | Where-Object { $_[0] -like "$wordToComplete*" } | ForEach-Object { [System.Management.Automation.CompletionResult]::new($_[0], $_[0], $_[1], $(if ($_[2] -eq '') { $_[0] } else { $_[2] })) }
}
`;
}

// ───── Fig ──────────────────────────────────────────────────────────────────────────────

interface FigOption {
  name: string[];
  description?: string;
  args?: { name: string; suggestions?: string[] };
  /**
   * Fig's own two keys for option relationships, spelled as Fig spells them:
   * `dependsOn` keeps our name, `exclusive` becomes `exclusiveOn`. Both take the option's
   * *spelling*, which is what Fig matches against on the command line — `fig-schema.test.ts`
   * pins that these keys are ones `@withfig/autocomplete-types` declares on `Option`.
   */
  dependsOn?: string[];
  exclusiveOn?: string[];
}
interface FigSubcommand {
  /** Every spelling when the command has aliases (R5), as Fig declares `Subcommand.name`. */
  name: string | string[];
  description?: string;
  subcommands?: FigSubcommand[];
  options?: FigOption[];
}

function figOptions(node: Node): FigOption[] {
  return Object.entries(node.options).map(([n, s]) => {
    const o: FigOption = { name: flags(n, s) };
    if (s.description !== undefined) o.description = s.description;
    if (takesValue(s)) o.args = { name: s.placeholder ?? 'value', ...(s.choices === undefined ? {} : { suggestions: [...s.choices] }) };
    if (s.dependsOn !== undefined && s.dependsOn.length > 0) o.dependsOn = flagsOf(s.dependsOn);
    if (s.exclusive !== undefined && s.exclusive.length > 0) o.exclusiveOn = flagsOf(s.exclusive);
    return o;
  });
}

/** A subcommand's Fig name: its word, or every spelling when it has aliases (R5). */
const figName = (node: Node): string | string[] => (node.aliases.length === 0 ? word(node) : words(node));

/** A Fig spec (`Fig.Spec`) from the same walk (D5): one entry per node, children attached by path. */
export function renderFigSpec(manifest: Manifest): FigSubcommand {
  const { program, root } = completionTree(manifest);
  const entries = new Map<string, FigSubcommand>();
  for (const node of walk(root)) {
    const entry: FigSubcommand = { name: node.path.length === 0 ? program : figName(node), options: figOptions(node) };
    if (node.description !== '') entry.description = node.description;
    entries.set(node.path.join(' '), entry);
    if (node.path.length === 0) continue;
    // Root first and depth first, so a node's parent is always entered before it.
    const parent = entries.get(node.path.slice(0, -1).join(' ')) as FigSubcommand;
    (parent.subcommands ??= []).push(entry);
  }
  return entries.get('') as FigSubcommand;
}

export function renderCompletion(manifest: Manifest, shell: Shell): string {
  const { program, root } = completionTree(manifest);
  switch (shell) {
    case 'bash':
      return bash(program, root);
    case 'zsh':
      return zsh(program, root);
    case 'fish':
      return fish(program, root);
    case 'pwsh':
      return pwsh(program, root);
  }
}

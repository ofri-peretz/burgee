/**
 * `burgee migrate` — the mechanical path from commander or yargs to burgee.
 *
 * Every migration that actually happened shipped the codemod before the wave, not after
 * it (`.sdlc/research/migration-drivers.md`): `jest-codemods`, `pnpm import`,
 * `biome migrate eslint`. burgee already has the strongest possible version of the claim —
 * change one import and commander's own 1,360 tests still pass — and what it did not have
 * was the four-minute path from *could* to *did*.
 *
 * **Specifiers, not syntax trees (D-050).** The rewrite surface is a quoted string in five
 * known positions, so this needs no parser and therefore no runtime dependency (rule 2).
 * It is also two orders of magnitude cheaper than parse-edit-print, which is what makes
 * A10's budget — 1,000 files under 500 ms — a number rather than an adjective. The fast
 * choice and the zero-dependency choice are the same choice here.
 *
 * The cost of the narrow scan is paid visibly: a position this scan cannot classify is
 * **refused by file and line** and the whole file is left as it was (A4, A5, D-051). A
 * codemod that half-works fails later as a runtime error in someone else's CLI, and the
 * first thing they will blame is burgee.
 *
 * blessed, neo-blessed and terminal-kit have no drop-in to rewrite to (controlroom R18). Their
 * screen, box, list and key sites are reported under `guided`, each with the section of its
 * coming-from guide, and never rewritten — `migrate-guided.ts` says why.
 *
 * Nothing here is reachable from `import 'burgee'`: `cli.ts` loads it with a dynamic
 * import on the `migrate` path only, and `weight.test.ts` denies `migrate.js` to the root
 * entry by name so that cannot drift.
 */
import { existsSync, readdirSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ambientRuntime, run } from 'bellpull';

import { DROP_INS, GRADED, GRADED_VERSIONS, isLevel, type Row, SUPPORTED_MAJORS } from './compat.js';
import { ExitCode } from './exit-code.js';
import { guidedSites, mentionsAGuided, type GuidedSite, type Token } from './migrate-guided.js';
import { TEXT } from './render.js';

/** The npm package a specifier names: `@scope/name/x` → `@scope/name`, `name/x` → `name`. */
export function packageOf(specifier: string): string {
  const parts = specifier.split('/');
  return parts.slice(0, specifier.startsWith('@') ? 2 : 1).join('/');
}

/**
 * A2, A12 — the whole mapping, as data, and none of it typed here.
 *
 * Every drop-in the oracle grades **level** with its incumbent (D-137): the incumbent's own
 * suite passes as many cases against the family's replacement as against the incumbent
 * itself, in the same harness. That is commander and yargs, and chalk, ora, string-width,
 * cross-spawn, signal-exit and the rest — `compat.ts` holds the list and a lock re-derives it
 * from `compat-oracle`. A drop-in that is not level yet is reported, never rewritten.
 *
 * Whole specifiers only. `burgee/commander` is not a key, which is what makes a second run
 * over an already-migrated tree a no-op and lets the command declare `effects: 'idempotent'`.
 * `yargs/yargs` is the one key the oracle does not name: yargs documents it as an entry,
 * and it is the same module as `yargs`.
 */
export const MAPPING: Readonly<Record<string, string>> = Object.fromEntries(
  DROP_INS.filter((d) => isLevel(d.host)).flatMap((d) => (d.from === 'yargs' ? [[d.from, d.to], ['yargs/yargs', d.to]] : [[d.from, d.to]])),
);

/** The packages a project depends on that this command rewrites (A1). */
export const HOSTS: readonly string[] = [...new Set(Object.keys(MAPPING).map(packageOf))];

/** Graded drop-ins that are not level yet: reported so a user knows the path exists, never rewritten (A12). */
const PARTIAL = DROP_INS.filter((d) => !isLevel(d.host));

/** The leading number of a version or a range — `^3.0.7` is 3, `>=18` is 18; `undefined` for `*` or a tag. */
export function majorOf(version: string): number | undefined {
  const digits = /\d+/.exec(version);
  return digits === null ? undefined : Number(digits[0]);
}

/** The `GRADED` key for an incumbent package — `@inquirer/core` is graded as `inquirer-core`. */
const HOST_OF = new Map(DROP_INS.map((d) => [packageOf(d.from), d.host]));

/**
 * What a target needs installed beside its own package. ink brought `react-reconciler` in as
 * its own dependency; `controlroom/ink` takes it as an optional peer, so a program moving off
 * ink has to install it, and `next` says so (D-20261005-controlroom-ink-drop-in).
 */
const PEERS_OF: Readonly<Record<string, readonly string[]>> = { 'controlroom/ink': ['react-reconciler'] };

/**
 * Every name each target exports — values and types alike — so a rewrite that moves
 * `import { Argv } from 'yargs'` can first ask whether `burgee/yargs` has an `Argv`.
 *
 * A specifier-only rewrite (D-050) cannot tell a value from a type, and does not need to:
 * a name the target does not export breaks the build either way. This is data rather than
 * a lookup because the lookup is the TypeScript checker, which is the dependency this
 * command exists not to have; `facade-types.test.ts` holds the table equal to what the
 * checker sees in `dist/*.d.ts`, so it cannot drift from the façades it describes.
 */
export const FACADE_EXPORTS: Readonly<Record<string, readonly string[]>> = {
  'bellpull/cross-spawn': [
    'ChildProcess',
    'Parsed',
    'SpawnOptions',
    'SpawnSyncReturns',
    '_enoent',
    'crossSpawn',
    'default',
    'module.exports',
    'parse',
    'spawn',
    'sync',
  ],
  'bellpull/node-which': [
    'NodeWhichOptions',
    'default',
    'module.exports',
  ],
  'burgee/commander': [
    'AddHelpTextContext',
    'AddHelpTextPosition',
    'Argument',
    'BurgeeParseOptions',
    'Command',
    'CommandOptions',
    'CommanderError',
    'DualOptions',
    'ErrorOptions',
    'ExecutableCommandOptions',
    'Help',
    'HelpConfiguration',
    'HelpContext',
    'HookEvent',
    'HookListener',
    'InvalidArgumentError',
    'InvalidOptionArgumentError',
    'Option',
    'OptionValueSource',
    'OptionValues',
    'OutputConfiguration',
    'OutputContext',
    'ParseOptions',
    'ParseOptionsResult',
    'createArgument',
    'createCommand',
    'createOption',
    'humanReadableArgName',
    'program',
    'useColor',
  ],
  'burgee/meow': [
    'AnyFlag',
    'AnyFlags',
    'Flag',
    'FlagType',
    'InputOption',
    'InputOptionType',
    'IsRequiredPredicate',
    'Options',
    'Result',
    'TypedFlags',
    'default',
  ],
  'burgee/yargs': [
    'Arguments',
    'ArgumentsCamelCase',
    'Argv',
    'AsyncCompletionFunction',
    'BuilderArguments',
    'BuilderCallback',
    'Choices',
    'CommandBuilder',
    'CommandModule',
    'CompletionCallback',
    'Defined',
    'DetailedArguments',
    'FallbackCompletionFunction',
    'InferredOptionType',
    'InferredOptionTypeInner',
    'InferredOptionTypePrimitive',
    'InferredOptionTypes',
    'MiddlewareFunction',
    'Options',
    'ParseCallback',
    'ParsedCommand',
    'Parser',
    'ParserConfigurationOptions',
    'PlatformShim',
    'PositionalOptions',
    'PositionalOptionsType',
    'PromiseCompletionFunction',
    'RequireDirectoryOptions',
    'SyncCompletionFunction',
    'ToArray',
    'ToNumber',
    'ToString',
    'YError',
    'YargsInstance',
    'applyExtends',
    'argsert',
    'camelCase',
    'decamelize',
    'default',
    'hideBin',
    'isPromise',
    'isYargsInstance',
    'looksLikeNumber',
    'module.exports',
    'objFilter',
    'parseCommand',
    'platformShim',
  ],
  'burgee/yargs/helpers': [
    'Parser',
    'applyExtends',
    'hideBin',
  ],
  'burgee/yargs/parser': [
    'Arguments',
    'Configuration',
    'DetailedArguments',
    'Options',
    'Parser',
    'ParserMixin',
    'YargsParser',
    'camelCase',
    'decamelize',
    'default',
    'looksLikeNumber',
    'module.exports',
    'tokenizeArgString',
  ],
  'caique/clack': [
    'AutocompleteMultiSelectOptions',
    'AutocompleteOptions',
    'CANCEL_SYMBOL',
    'ClackSettings',
    'CommonOptions',
    'ConfirmOptions',
    'DateFormat',
    'DateOptions',
    'GroupMultiSelectOptions',
    'LimitOptionsParams',
    'LogMessageOptions',
    'MULTISELECT_INSTRUCTIONS',
    'MultiLineOptions',
    'MultiSelectOptions',
    'NoteOptions',
    'Option',
    'PasswordOptions',
    'PathOptions',
    'PromptGroup',
    'PromptGroupAwaitedReturn',
    'PromptGroupOptions',
    'SELECT_INSTRUCTIONS',
    'S_BAR',
    'S_BAR_END',
    'S_BAR_END_RIGHT',
    'S_BAR_H',
    'S_BAR_START',
    'S_BAR_START_RIGHT',
    'S_CHECKBOX_ACTIVE',
    'S_CHECKBOX_INACTIVE',
    'S_CHECKBOX_SELECTED',
    'S_CONNECT_LEFT',
    'S_CORNER_BOTTOM_LEFT',
    'S_CORNER_BOTTOM_RIGHT',
    'S_CORNER_TOP_LEFT',
    'S_CORNER_TOP_RIGHT',
    'S_ERROR',
    'S_INFO',
    'S_PASSWORD_MASK',
    'S_RADIO_ACTIVE',
    'S_RADIO_INACTIVE',
    'S_STEP_ACTIVE',
    'S_STEP_CANCEL',
    'S_STEP_ERROR',
    'S_STEP_SUBMIT',
    'S_SUCCESS',
    'S_WARN',
    'SelectKeyOptions',
    'SelectOptions',
    'SizedOutput',
    'SpinnerOptions',
    'SpinnerResult',
    'Task',
    'TextOptions',
    'autocomplete',
    'autocompleteMultiselect',
    'cancel',
    'confirm',
    'date',
    'formatInstructionFooter',
    'group',
    'groupMultiselect',
    'intro',
    'isCI',
    'isCancel',
    'isTTY',
    'limitOptions',
    'log',
    'multiline',
    'multiselect',
    'note',
    'outro',
    'password',
    'path',
    'select',
    'selectKey',
    'settings',
    'spinner',
    'stream',
    'symbol',
    'symbolBar',
    'tasks',
    'text',
    'unicode',
    'unicodeOr',
    'updateSettings',
  ],
  'caique/inquirer': [
    'AbortPromptError',
    'CancelPromptError',
    'CancelablePromise',
    'Context',
    'ExitPromptError',
    'HookError',
    'Keybinding',
    'KeypressEvent',
    'PartialTheme',
    'Prompt',
    'Separator',
    'SetState',
    'Status',
    'Theme',
    'ValidationError',
    'ViewFunction',
    'createPrompt',
    'defaultTheme',
    'getDefaultKeybindings',
    'getDefaultTheme',
    'isBackspaceKey',
    'isDownKey',
    'isEnterKey',
    'isNumberKey',
    'isShiftKey',
    'isSpaceKey',
    'isTabKey',
    'isUpKey',
    'makeTheme',
    'useEffect',
    'useKeypress',
    'useMemo',
    'usePrefix',
    'useRef',
    'useState',
  ],
  'closeout/exit-hook': [
    'AsyncExitHookOptions',
    'ExitHookCallback',
    'Options',
    'asyncExitHook',
    'default',
    'gracefulExit',
  ],
  'closeout/restore-cursor': [
    'default',
  ],
  'closeout/signal-exit': [
    'load',
    'onExit',
    'signals',
    'unload',
  ],
  'closeout/signal-exit/signals': [
    'signals',
  ],
  'controlroom/ink': [
    'AnimationResult',
    'AppProps',
    'Box',
    'BoxMetrics',
    'BoxProps',
    'CursorPosition',
    'DOMElement',
    'ElementMetrics',
    'Instance',
    'Key',
    'KittyFlagName',
    'KittyKeyboardOptions',
    'Newline',
    'NewlineProps',
    'RenderMetrics',
    'RenderOptions',
    'RenderToStringOptions',
    'Spacer',
    'Static',
    'StaticProps',
    'StderrProps',
    'StdinProps',
    'StdoutProps',
    'SuspendTerminal',
    'TerminalSuspension',
    'Text',
    'TextProps',
    'Transform',
    'TransformProps',
    'UseBoxMetricsResult',
    'WindowSize',
    'kittyFlags',
    'kittyModifiers',
    'measureElement',
    'render',
    'renderToString',
    'useAnimation',
    'useApp',
    'useBoxMetrics',
    'useCursor',
    'useFocus',
    'useFocusManager',
    'useInput',
    'useIsScreenReaderEnabled',
    'usePaste',
    'useStderr',
    'useStdin',
    'useStdout',
    'useWindowSize',
  ],
  'flagstaff/boxen': [
    'BoxenBorderStyle',
    'BoxenOptions',
    'Boxes',
    'Color',
    'CustomBorderStyle',
    'Options',
    'Spacing',
    '_borderStyles',
    'default',
  ],
  'flagstaff/cli-table3': [
    'Cell',
    'ColSpanCell',
    'RowSpanCell',
    'Table',
    'TableChars',
    'TableOptions',
    'TableStyle',
    'computeHeights',
    'computeWidths',
    'default',
    'hyperlink',
    'makeTableLayout',
    'mergeOptions',
    'module.exports',
    'pad',
    'strlen',
    'truncate',
    'wordWrap',
  ],
  'flagstaff/log-update': [
    'LogUpdate',
    'LogUpdateOptions',
    'LogUpdateStream',
    'Options',
    'createLogUpdate',
    'default',
    'logUpdateStderr',
  ],
  'flagstaff/ora': [
    'Affix',
    'Color',
    'Options',
    'Ora',
    'OraStream',
    'PersistOptions',
    'PrefixTextGenerator',
    'PromiseOptions',
    'Spinner',
    'SpinnerDefinition',
    'SuffixTextGenerator',
    'default',
    'oraPromise',
    'spinners',
  ],
  'linegauge': [
    'Options',
    'TruncateOptions',
    'WidthOptions',
    'WrapOptions',
    'default',
    'lineCount',
    'measure',
    'slice',
    'strip',
    'truncate',
    'widest',
    'width',
    'wrap',
  ],
  'linegauge/slice': [
    'default',
    'slice',
  ],
  'linegauge/strip': [
    'default',
    'strip',
  ],
  'linegauge/wrap': [
    'Options',
    'WrapOptions',
    'default',
    'visibleWidth',
    'wrap',
  ],
  'paratext': [
    'AnsiEscapes',
    'Capability',
    'CapabilityError',
    'ConEmu',
    'DEPRECATED',
    'Fields',
    'ImageOptions',
    'NotImplemented',
    'Runtime',
    'Support',
    'ansiEscapesFor',
    'beep',
    'beginSynchronizedOutput',
    'bell',
    'builtins',
    'capabilities',
    'capability',
    'check',
    'clearScreen',
    'clearTerminal',
    'clearViewport',
    'clipboard',
    'cursorBackward',
    'cursorDown',
    'cursorForward',
    'cursorGetPosition',
    'cursorHide',
    'cursorLeft',
    'cursorMove',
    'cursorNextLine',
    'cursorPrevLine',
    'cursorRestorePosition',
    'cursorSavePosition',
    'cursorShow',
    'cursorTo',
    'cursorUp',
    'cwd',
    'default',
    'emit',
    'endSynchronizedOutput',
    'enterAlternativeScreen',
    'eraseDown',
    'eraseEndLine',
    'eraseLine',
    'eraseLines',
    'eraseScreen',
    'eraseStartLine',
    'eraseUp',
    'exitAlternativeScreen',
    'fieldsUsed',
    'iTerm',
    'image',
    'isDeprecation',
    'link',
    'notify',
    'processRuntime',
    'refusals',
    'register',
    'registerBuiltins',
    'render',
    'reset',
    'scrollDown',
    'scrollUp',
    'setCwd',
    'supports',
    'synchronizedOutput',
    'title',
  ],
  'paratext/term-img': [
    'Options',
    'TerminalImageInput',
    'TerminalImageOptions',
    'UnsupportedTerminalError',
    'default',
    'supportsInlineImage',
    'terminalImageFor',
  ],
  'paratext/terminal-link': [
    'LinkOptions',
    'Options',
    'Target',
    'TerminalLink',
    'default',
    'terminalLinkFor',
  ],
  'roundel/chalk': [
    'BackgroundColor',
    'BackgroundColorName',
    'Chalk',
    'ChalkInstance',
    'ChalkOptions',
    'Color',
    'ColorInfo',
    'ColorName',
    'ColorSupport',
    'ColorSupportLevel',
    'ForegroundColor',
    'ForegroundColorName',
    'ModifierName',
    'Modifiers',
    'Options',
    'UnderlineColorName',
    'backgroundColorNames',
    'chalkStderr',
    'colorNames',
    'default',
    'foregroundColorNames',
    'modifierNames',
    'supportsColor',
    'supportsColorStderr',
    'underlineColorNames',
  ],
  seniority: [
    'BuiltinSource',
    'Candidate',
    'CommonOptions',
    'Config',
    'ConfigError',
    'CosmiconfigResult',
    'Discovery',
    'Explanation',
    'ExplanationEvent',
    'ExplanationJson',
    'Explorer',
    'ExplorerSync',
    'Found',
    'Layer',
    'Layers',
    'LoadConfigOptions',
    'LoadOptions',
    'Loaded',
    'Loader',
    'LoaderError',
    'Loaders',
    'NOT_BUNDLED',
    'ORDER',
    'OptionSpec',
    'Options',
    'OptionsSync',
    'Provenance',
    'PublicExplorer',
    'PublicExplorerSync',
    'RANK',
    'Resolution',
    'SearchOptions',
    'SearchStrategy',
    'Shape',
    'Source',
    'SourceLayer',
    'Transform',
    'Violation',
    'WALK_LIMIT',
    'builtinLoaders',
    'candidates',
    'check',
    'cosmiconfig',
    'cosmiconfigSync',
    'decodeFileContent',
    'deepMerge',
    'defaultLoaders',
    'defaultLoadersSync',
    'discover',
    'envBoolean',
    'envName',
    'explain',
    'explanation',
    'explanationEvent',
    'explanationJson',
    'getDefaultSearchPlaces',
    'getDefaultSearchPlacesSync',
    'getPropertyByPath',
    'globalConfigSearchPlaces',
    'globalConfigSearchPlacesSync',
    'lineOf',
    'loadPath',
    'loadWithExtends',
    'loaderFor',
    'metaSearchPlaces',
    'renderExplanation',
    'resolve',
    'screaming',
    'search',
    'searchAll',
    'validate',
  ],
  'seniority/dotenv': [
    'ConfigOptions',
    'ConfigResult',
    'DotenvConfigOptions',
    'DotenvConfigOutput',
    'DotenvParseOptions',
    'DotenvParseOutput',
    'DotenvPopulateInput',
    'DotenvPopulateOptions',
    'DotenvPopulateOutput',
    'ParseOptions',
    'PopulateOptions',
    'config',
    'configDotenv',
    'default',
    'module.exports',
    'parse',
    'populate',
  ],
  // A side-effect entry, as `dotenv/config` is: importing it is the call, and it exports nothing.
  'seniority/dotenv/config': [],
  'seniority/lilconfig': [
    'AsyncSearcher',
    'LilconfigResult',
    'Loader',
    'LoaderSync',
    'Loaders',
    'LoadersSync',
    'Options',
    'OptionsSync',
    'SyncSearcher',
    'Transform',
    'TransformSync',
    'defaultLoaders',
    'defaultLoadersSync',
    'lilconfig',
    'lilconfigSync',
  ],
  'seniority/rc': [
    'RcConfig',
    'RcOptions',
    'RcParse',
    'default',
    'module.exports',
    'parse',
    'rc',
  ],
};

/**
 * U12-4 — the error classes each target exports, which a caller compares with `instanceof`.
 *
 * A dependency of the project's own that still installs the incumbent throws the incumbent's
 * class, and the target's is a different one: `@inquirer/confirm` rejects with
 * `@inquirer/core`'s `ExitPromptError`, which is not `instanceof` caique's. So an import that
 * names one of these stays on the incumbent when such a dependency exists (`transitive`).
 * Data, as {@link FACADE_EXPORTS} is: `scripts/migrate-identity-lock.test.ts` imports every
 * target and holds this table equal to the `Error` subclasses each one actually exports.
 */
export const IDENTITY: Readonly<Record<string, readonly string[]>> = {
  'burgee/commander': ['CommanderError', 'InvalidArgumentError', 'InvalidOptionArgumentError'],
  'burgee/yargs': ['YError'],
  'caique/inquirer': ['AbortPromptError', 'CancelPromptError', 'ExitPromptError', 'HookError', 'ValidationError'],
  paratext: ['CapabilityError'],
  'paratext/term-img': ['UnsupportedTerminalError'],
  seniority: ['ConfigError', 'LoaderError'],
};

/**
 * Why a file was left untouched. Each is a named position, never a guess (A4).
 *
 * `unknown-export` is a named import the target does not export — rewriting it would turn a
 * working import into TS2305 or a `SyntaxError` at load, so the file stays as it was.
 *
 * `require-of-default` is a `require()` whose two sides hand back different kinds of value.
 * `require()` of an ES module returns its namespace, so `require('cross-spawn')` — a function —
 * rewritten to a target with a default and no `'module.exports'` would make `spawn(...)` throw.
 * A `require('chalk')` of chalk 6, which is ESM only, already returns a namespace, and moves to
 * a target that does too ({@link REQUIRE_NAMESPACE}, A29). Where the shapes differ, the file
 * stays on the incumbent, where it works.
 *
 * `sibling-state` is an import of a package whose module state the incumbent reads and the
 * replacement never does ({@link SIBLING_STATE}). Rewriting the incumbent beside it would leave
 * that import configuring a package nothing reads any more, and nothing would say so. The
 * refusal carries `fix`, the change that lets the next run move the file.
 */
export type RefusalReason = 'deep-import' | 'non-literal-specifier' | 'unknown-export' | 'require-of-default' | 'sibling-state';

/**
 * An incumbent that reads module state from a sibling package, keyed by the incumbent, with
 * the sibling and the fix a refusal prints.
 *
 * `@clack/prompts` reads its settings from `@clack/core`: `updateSettings({ withGuide: false })`
 * imported from `@clack/core` turns the guide off in every clack prompt. `caique/clack` does not
 * depend on `@clack/core` (U6), so once a file's prompts move, that call changes a package the
 * prompts no longer read (D-20260930-caique-clack-core-exclusion). `caique/clack` exports its own
 * `updateSettings` and `settings`, which its prompts do read. So a file that imports both is
 * refused with this fix, and a file that imports `@clack/core` alone is not a rewrite candidate
 * and is left alone (D-20260930-migrate-refuses-clack-core).
 */
const SIBLING_STATE: Readonly<Record<string, { sibling: string; fix: string }>> = {
  '@clack/prompts': { sibling: '@clack/core', fix: "import { updateSettings } from 'caique/clack' instead of '@clack/core', then re-run burgee migrate" },
};

/**
 * Incumbents whose own `require()` already returns an ES namespace — they ship ESM only and
 * export no `'module.exports'`, so `require('chalk').default` is how a CommonJS caller of
 * chalk 6 reaches it. Moving that line to a target that also hands back its namespace is
 * exact (A29). Derived, not typed: `migrate-require.test.ts` holds this list equal to what
 * Node's own `require()` returns for every installed incumbent in `MAPPING`, so a name here
 * is a measurement and an incumbent that is not installed is left out, and refused as before.
 */
export const REQUIRE_NAMESPACE: readonly string[] = ['ansi-escapes', 'chalk', 'ora', 'log-update', 'boxen', 'string-width', 'strip-ansi', 'wrap-ansi', 'slice-ansi', 'restore-cursor', 'exit-hook', 'terminal-link', 'meow'];

/** Whether `require(from)` and `require(to)` hand a CommonJS caller different kinds of value. */
function requireShapesDiffer(from: string, to: string): boolean {
  // Every target has a table: `migrate.test.ts` holds the keys equal to `MAPPING`'s targets.
  const exported = FACADE_EXPORTS[to] as readonly string[];
  const toGivesDefault = exported.includes('module.exports');
  // An incumbent that returns its namespace needs a target that returns one too.
  if (REQUIRE_NAMESPACE.includes(from)) return toGivesDefault;
  // Otherwise the incumbent may hand back its export itself — a function, a class — and a
  // target with a default but no `'module.exports'` would hand back a namespace instead.
  return exported.includes('default') && !toGivesDefault;
}

export interface Refusal {
  /** Relative to the directory being migrated, with forward slashes on every platform. */
  file: string;
  line: number;
  /** The specifier as written, or `''` for a dynamic specifier that is not a literal. */
  specifier: string;
  reason: RefusalReason;
  /** For `unknown-export`: the names the target does not export. */
  names?: string[];
  /** For `sibling-state`: the change to make before the next run, which then moves the file. */
  fix?: string;
}

/**
 * A type-only import left on the incumbent because the façade does not export every name in
 * it. Types are erased, so the file's values still move to burgee and the program runs on it;
 * the types keep compiling against the incumbent's declarations, which is why the incumbent
 * is then not reported removable.
 */
export interface Kept {
  file: string;
  line: number;
  specifier: string;
  /** The names the façade does not export. */
  names: string[];
  /** The note a reader acts on. */
  note: string;
}

/** One rewritten specifier, for the per-mapping rollup the report prints. */
export interface Mapped {
  from: string;
  to: string;
  imports: number;
  files: number;
}

export interface Detection {
  /** Hosts named in `package.json`'s dependencies — declared. */
  declared: string[];
  /** Hosts a source file actually imports — used. These two disagree more often than not. */
  imported: string[];
}

/** An incumbent the project has on a different major from the one graded — left alone (A12). */
export interface OffMajor {
  from: string;
  /** The installed version, or the declared range when nothing is installed here. */
  found: string;
  graded: string;
}

/** A declared incumbent with a graded drop-in that is not level yet (A12). */
export interface NotLevel extends Row {
  from: string;
  to: string;
}

/**
 * A blessed, neo-blessed or terminal-kit site, reported with the guide section that covers it
 * and never rewritten: there is no drop-in for them (controlroom R18), and the API a rewrite
 * would target is not built. See `migrate-guided.ts`.
 */
export interface Guided extends GuidedSite {
  file: string;
}

/**
 * U12-4 — an incumbent rewritten in no file, because one of its imports could not move.
 *
 * A file that is refused is left whole, so every incumbent it imports stays imported there; a
 * kept import stays on its incumbent. Moving that incumbent in the other files would give the
 * program two copies of it, and a class from one is not `instanceof` the other's:
 * mac-cleaner's Ctrl+C threw an `ExitPromptError` from `@inquirer/core` and was tested against
 * caique's, so it printed an error where it used to exit 0.
 */
export interface Held {
  from: string;
  /** The files whose refused or kept import holds it. */
  files: string[];
  /** `refused` when any of those files was refused, else `kept`. */
  because: 'refused' | 'kept';
}

/**
 * U12-4 — an incumbent another of the project's own dependencies depends on, so it stays
 * installed after the migration whatever this command does: `@inquirer/confirm` depends on
 * `@inquirer/core`. `exports` are the target's error classes, which are not the classes
 * the dependency throws.
 */
export interface Transitive {
  from: string;
  through: string[];
  exports: string[];
}

/** U12-2 — a package-manager setting that refuses versions younger than `minutes`, which the pinned graded versions may be. */
export interface ReleaseAge {
  file: string;
  minutes: number;
  note: string;
}

export interface MigrationReport {
  /** U12-5 — the outcome in words: `partial: 3 files rewritten, 1 refused`, `complete: …` or `nothing to rewrite`. */
  summary: string;
  files: number;
  imports: number;
  mapped: Mapped[];
  refused: Refusal[];
  /** Type-only imports left pointing at the incumbent, each with the note that says why. */
  kept: Kept[];
  detected: Detection;
  /** `add`: the family packages the rewritten imports now name, which the project must depend on. */
  dependencies: { before: string[]; removable: string[]; after: number; add: string[] };
  graded: (Row & { host: string })[];
  /** Declared incumbents whose drop-in is graded but not level — left alone, with the grade that says why. */
  partial: NotLevel[];
  /** Incumbents on a major the oracle did not grade — left alone, never rewritten onto an API they do not use. */
  offMajor: OffMajor[];
  /** blessed, neo-blessed and terminal-kit sites by file and line, each with its guide section. Reported, never rewritten, and not a refusal. */
  guided: Guided[];
  /** U12-3 — incumbents a source file imports that `package.json` does not declare: left alone unless `--only` names them. */
  undeclared: string[];
  /** U12-4 — incumbents rewritten in no file, and the files that hold each. */
  held: Held[];
  /** U12-4 — incumbents the project's other dependencies still install, with the error classes that would split. */
  transitive: Transitive[];
  /** U12-2 — the project's minimum release age, when it sets one; `null` otherwise. */
  releaseAge: ReleaseAge | null;
  /**
   * The install and uninstall to run next, for the package manager the lockfile names; `''`
   * when there is none. Each family package is pinned to a range at the version this burgee
   * was built beside (U12-2): `npm install roundel@^1.0.0 && npm uninstall chalk`.
   */
  next: string;
  dryRun: boolean;
  /** N7 — an idempotent command says whether it changed anything; silence is what an agent misreads. */
  changed: boolean;
  /** A8 — `RUNTIME` when anything was refused, so an agent branches on the code. */
  exitCode: number;
}

/* ------------------------------------------------------------------ the scan */

interface Site {
  specifier: string;
  /** Offsets of the specifier's text, excluding the quotes. */
  start: number;
  end: number;
  line: number;
  /**
   * For `import … from` and `export … from`: the code tokens between the keyword and `from`
   * — the import clause, which is all `bindingsOf` needs. Absent for the other three positions.
   */
  clause?: string[];
  /** `require('x')`, or `jest.requireActual('x')`: CommonJS receives the target's whole namespace, not its default export. */
  require?: true;
  /**
   * `vi.mock('x')`, `jest.unmock('x')`, `require.resolve('x')` …: a call that names the module
   * and binds none of its exports, so no class crosses it and it is never kept for one.
   */
  refers?: true;
}

interface Scan {
  sites: Site[];
  /** `import(x)` / `require(x)` where `x` is not a string literal — refused, never guessed. */
  nonLiteral: number[];
}

const WORD = /[A-Za-z0-9_$]/;

/** After these, a `/` divides; after anything else it opens a regular expression. */
const DIVIDES = new Set([')', ']', '}']);

function startsRegex(previous: string): boolean {
  if (previous === '') return true;
  if (DIVIDES.has(previous)) return false;
  return !WORD.test(previous.charAt(previous.length - 1));
}

/** Index just past the end of a `'…'` or `"…"`, honouring backslash escapes. */
function endOfString(source: string, open: number): number {
  const quote = source.charAt(open);
  for (let i = open + 1; i < source.length; i += 1) {
    const c = source.charAt(i);
    if (c === '\\') {
      i += 1;
      continue;
    }
    if (c === quote || c === '\n') return i + 1;
  }
  return source.length;
}

/** Index just past the end of a template literal, counting `${…}` nesting so a `}` inside it is not the end. */
function endOfTemplate(source: string, open: number): number {
  let depth = 0;
  for (let i = open + 1; i < source.length; i += 1) {
    const c = source.charAt(i);
    if (c === '\\') {
      i += 1;
      continue;
    }
    if (c === '$' && source.charAt(i + 1) === '{') {
      depth += 1;
      i += 1;
      continue;
    }
    if (c === '}' && depth > 0) {
      depth -= 1;
      continue;
    }
    if (c === '`' && depth === 0) return i + 1;
  }
  return source.length;
}

/** Index just past the end of a regular-expression literal, skipping character classes. */
function endOfRegex(source: string, open: number): number {
  let inClass = false;
  for (let i = open + 1; i < source.length; i += 1) {
    const c = source.charAt(i);
    if (c === '\\') {
      i += 1;
      continue;
    }
    if (c === '[' || c === ']') {
      inClass = c === '[';
      continue;
    }
    if (c === '\n') return i;
    if (c === '/' && !inClass) return i + 1;
  }
  return source.length;
}

/** Newlines between two offsets, so a refusal can name a line without a second pass. */
function newlines(source: string, from: number, to: number): number {
  let count = 0;
  for (let i = from; i < to; i += 1) if (source.charAt(i) === '\n') count += 1;
  return count;
}

/**
 * A3 — the five positions, and only those: `import … from 'x'`, `import 'x'`,
 * `export … from 'x'`, `import('x')` and `require('x')` — and the first argument of a
 * {@link CALLS} call, which names the same module from a test (U12-1).
 *
 * Decided from the tokens in front of the quote rather than from a pattern over the
 * line, which is what keeps `{ from: 'commander' }`, `const x = 'commander'` and
 * `log('commander')` out of it — the second named mutation in `migrate.test.ts`.
 */
function isSpecifier(tokens: Tokens): boolean {
  const { previous, before } = tokens;
  if (previous === 'from' || previous === 'import') return true;
  return previous === '(' && (before === 'import' || before === 'require' || tokens.opened !== undefined);
}

/** How a {@link CALLS} call uses its module: binds nothing (`refers`), or loads it the way `import()` or `require()` does. */
type Call = 'refers' | 'imports' | 'requires';

/**
 * U12-1 — the calls whose first argument is a module specifier, by receiver and method.
 *
 * mcpc's tests mocked chalk with `vi.mock('chalk', …)`. Once its source imported
 * `roundel/chalk`, those mocks replaced a module nothing loaded, and 51 of its 1261 unit tests
 * failed until the five lines were rewritten by hand. A mock names the module the code under
 * test imports, so it is a specifier exactly as the import is, and moves with it.
 *
 * `vi.importActual` and `vi.importMock` load the module as `import()` does, and jest's
 * `requireActual` and `requireMock` as `require()` does, so the `require()` shape check applies
 * to those two. The mocks and `require.resolve` bind nothing.
 *
 * A specifier that is not a literal is not refused here, as it is for `import()` and
 * `require()`: a `vi.mock(path)` loads nothing into the program, and `require.resolve(name)`
 * is how tooling asks where any package is.
 */
const CALLS: ReadonlyMap<string, ReadonlyMap<string, Call>> = new Map([
  [
    'vi',
    new Map<string, Call>([
      ['mock', 'refers'],
      ['doMock', 'refers'],
      ['unmock', 'refers'],
      ['doUnmock', 'refers'],
      ['importActual', 'imports'],
      ['importMock', 'imports'],
    ]),
  ],
  [
    'jest',
    new Map<string, Call>([
      ['mock', 'refers'],
      ['doMock', 'refers'],
      ['unmock', 'refers'],
      ['unstable_mockModule', 'refers'],
      ['requireActual', 'requires'],
      ['requireMock', 'requires'],
    ]),
  ],
  ['require', new Map<string, Call>([['resolve', 'refers']])],
]);

/** The call `receiver . method` names, when the four tokens behind the cursor are one — and not `x.vi.mock`, whose `vi` is somebody's property. */
function callOf(tokens: Tokens): Call | undefined {
  if (tokens.before !== '.' || tokens.fourth === '.') return undefined;
  return CALLS.get(tokens.third)?.get(tokens.previous);
}

/**
 * Follow a {@link CALLS} call from its name to its `(`: `ready` once `vi.mock` is behind the
 * cursor, `opened` on the `(` straight after it. Type arguments may come between —
 * `vi.importActual<typeof import('chalk')>('chalk')` is how vitest's own docs write it — so a
 * `<` there is counted to its `>`, and the `>` of an arrow (`=` then `>`) is not one.
 */
function trackCall(tokens: Tokens, text: string): void {
  const ready = tokens.ready;
  tokens.ready = undefined;
  tokens.opened = undefined;
  if (tokens.angle > 0) {
    if (text === '<') tokens.angle += 1;
    else if (text === '>' && tokens.previous !== '=') tokens.angle -= 1;
    if (tokens.angle === 0) tokens.ready = tokens.generic;
  } else if (text === '(') tokens.opened = ready;
  else if (text === '<' && ready !== undefined) {
    tokens.angle = 1;
    tokens.generic = ready;
  }
}

/** Whitespace, `;` and both comment forms — everything the classifier never looks at. Returns `at` when there is none. */
function endOfTrivia(source: string, at: number): number {
  const c = source.charAt(at);
  if (c === ' ' || c === '\t' || c === '\r' || c === '\n' || c === ';') return at + 1;
  if (c !== '/') return at;
  const next = source.charAt(at + 1);
  if (next === '/') {
    const end = source.indexOf('\n', at);
    return end === -1 ? source.length : end;
  }
  if (next !== '*') return at;
  const end = source.indexOf('*/', at + 2);
  return end === -1 ? source.length : end + 2;
}

/** A literal to step over whole — string, template or regular expression — or `-1` when `at` starts none. */
function endOfLiteral(source: string, at: number, previous: string): number {
  const c = source.charAt(at);
  if (c === "'" || c === '"') return endOfString(source, at);
  if (c === '`') return endOfTemplate(source, at);
  if (c === '/' && startsRegex(previous)) return endOfRegex(source, at);
  return -1;
}

/** Index just past the identifier or number starting at `at`, or `at` when neither starts there. */
function endOfWord(source: string, at: number): number {
  let i = at;
  while (i < source.length && WORD.test(source.charAt(i))) i += 1;
  return i;
}

/** What a quoted literal is recorded as; anything else quoted is `lit`, which is never a specifier. */
const QUOTED = 'str';

/** The code tokens behind the cursor, plus A4's open-call state and U12-1's call state. */
interface Tokens {
  previous: string;
  before: string;
  /** The two before `before`: a {@link CALLS} call is `vi . mock (`, and `x . vi . mock (` is not one. */
  third: string;
  fourth: string;
  /** A {@link CALLS} name is behind the cursor, so a `(` next opens it. */
  ready: Call | undefined;
  /** The token just pushed is the `(` of a {@link CALLS} call, so a quoted literal next is its specifier. */
  opened: Call | undefined;
  /** How deep the cursor is in a {@link CALLS} call's type arguments, and whose they are. */
  angle: number;
  generic: Call | undefined;
  /** The two behind us were `import (` or `require (`, and what follows decides A4. */
  pending: boolean;
  /** Lines where a call was opened and what followed was not a string literal. */
  nonLiteral: number[];
  /**
   * The tokens since the last `import` or `export` keyword — the clause of the statement in
   * progress — or `undefined` once there is none. A clause never holds `(` or `=`, and the
   * token after its `from` is the specifier, so either closes it: `export function f(…)`
   * does not drag its body along.
   */
  clause: string[] | undefined;
}

/**
 * Record one code token.
 *
 * A4's refusal is decided here rather than at each call site: if a call was opened and the
 * thing inside it is not a string literal, the specifier is not one this scan can read, and
 * the file it is in will be left alone.
 */
function push(tokens: Tokens, text: string, line: number): void {
  if (tokens.pending && text !== QUOTED && text !== ')') tokens.nonLiteral.push(line);
  tokens.pending = text === '(' && (tokens.previous === 'import' || tokens.previous === 'require');
  trackCall(tokens, text);
  if (text === 'import' || text === 'export') tokens.clause = [];
  else if (text === '(' || text === '=' || tokens.previous === 'from') tokens.clause = undefined;
  else tokens.clause?.push(text);
  tokens.fourth = tokens.third;
  tokens.third = tokens.before;
  tokens.before = tokens.previous;
  tokens.previous = text;
  if (tokens.angle === 0) tokens.ready ??= callOf(tokens);
}

/** The specifier between the quotes at `open` and just before `close`, with its clause when it follows a `from`. */
function siteOf(source: string, at: { open: number; close: number; line: number }, tokens: Tokens): Site {
  const { open, close, line } = at;
  const site: Site = { specifier: source.slice(open + 1, close - 1), start: open + 1, end: close - 1, line };
  // The clause ends in the `from` just pushed; everything before it is the bindings. A bare
  // `import 'x'` binds nothing, which is an empty clause rather than an unreadable one.
  if (tokens.previous === 'from' && tokens.clause !== undefined) site.clause = tokens.clause.slice(0, -1);
  if (tokens.previous === 'import') site.clause = [];
  if (tokens.previous === '(' && (tokens.before === 'require' || tokens.opened === 'requires')) site.require = true;
  if (tokens.previous === '(' && tokens.opened === 'refers') site.refers = true;
  return site;
}

/**
 * One linear pass over the text, handing every code token to `emit`: a word (an identifier or
 * a number), one punctuation character, {@link QUOTED} for a `'…'` or `"…"`, or `lit` for a
 * template or a regular expression. Comments, whitespace and `;` are skipped as the shapes
 * they are. `start` and `end` bound the token, quotes included, and `line` is where it starts.
 *
 * Shared by {@link scan} and {@link tokensOf}, so the specifier rewrite and the guided report
 * read one token stream and cannot disagree about where a string or a comment ends.
 */
function lex(source: string, emit: (text: string, line: number, start: number, end: number) => void): void {
  let previous = '';
  let line = 1;
  let i = 0;
  while (i < source.length) {
    const trivia = endOfTrivia(source, i);
    if (trivia !== i) {
      line += newlines(source, i, trivia);
      i = trivia;
      continue;
    }
    const literal = endOfLiteral(source, i, previous);
    if (literal !== -1) {
      const c = source.charAt(i);
      previous = c === "'" || c === '"' ? QUOTED : 'lit';
      emit(previous, line, i, literal);
      line += newlines(source, i, literal);
      i = literal;
      continue;
    }
    const word = endOfWord(source, i);
    const end = word === i ? i + 1 : word;
    previous = source.slice(i, end);
    emit(previous, line, i, end);
    i = end;
  }
}

/**
 * One linear pass over the text: comments, strings, templates and regular expressions are
 * skipped as the shapes they are, and every quoted literal is classified by the two code
 * tokens in front of it.
 *
 * It is a scan, not a parse. What it cannot classify it refuses (A4); what it can, it knows
 * exactly, because a module specifier is a string literal in one of five positions and
 * nothing else in the grammar looks like that.
 */
export function scan(source: string): Scan {
  const sites: Site[] = [];
  const tokens: Tokens = { previous: '', before: '', third: '', fourth: '', ready: undefined, opened: undefined, angle: 0, generic: undefined, pending: false, nonLiteral: [], clause: undefined };
  lex(source, (text, line, start, end) => {
    if (text === QUOTED && isSpecifier(tokens)) sites.push(siteOf(source, { open: start, close: end, line }, tokens));
    push(tokens, text, line);
  });
  return { sites, nonLiteral: tokens.nonLiteral };
}

/** Every code token of `source`, with a quoted literal's contents as `value` — what {@link guidedSites} reads. */
export function tokensOf(source: string): Token[] {
  const out: Token[] = [];
  lex(source, (text, line, start, end) => {
    // The source text, never the lexer's `str`/`lit` stand-ins: a variable named `str` must not match every string.
    const raw = source.slice(start, end);
    out.push(text === QUOTED ? { text: raw, line, value: raw.slice(1, -1) } : { text: raw, line });
  });
  return out;
}

/* ------------------------------------------------------- the rewrite of one file */

export interface Rewrite {
  source: string;
  mapped: { from: string; to: string }[];
  refused: Omit<Refusal, 'file'>[];
  kept: Omit<Kept, 'file'>[];
  /** Whether this file references a host at all. A file that does not is not "untouched", it is unrelated. */
  relevant: boolean;
  /**
   * On a refused file only: every host it still imports. The file is left exactly as it was,
   * so `chalk` beside a refused `commander/lib/help.js` is still imported, although only the
   * refused specifier is in `refused`.
   */
  retained?: string[];
}

/**
 * The host names as bytes, so the pre-filter below can run against a file that has not been
 * decoded yet. Both are pure ASCII, so a UTF-8 file contains the name iff its bytes do.
 */
const NEEDLE_BYTES = HOSTS.map((host) => Buffer.from(host));

/**
 * A file that names neither host anywhere cannot contain a specifier for one — and in a real
 * repository that is almost every file.
 *
 * `includes` is a `memmem`; `scan` is a character loop. It is not what makes the command
 * fast (the whole scan phase is 25 ms of a ~400 ms run over 1,000 files) — it is what keeps
 * the work proportional to the files that could matter rather than to the repository, and
 * on a `Buffer` it also skips decoding 3 MB of UTF-8 that nothing was going to read.
 */
export function mentionsAHost(source: string | Buffer): boolean {
  return typeof source === 'string' ? HOSTS.some((host) => source.includes(host)) : NEEDLE_BYTES.some((bytes) => source.includes(bytes));
}

/** A specifier that reaches inside a host the façade does not promise: `commander/lib/command.js` (A4). */
function isDeep(specifier: string): boolean {
  if (MAPPING[specifier] !== undefined) return false;
  return HOSTS.some((host) => specifier.startsWith(`${host}/`));
}

/**
 * The names an import or re-export clause asks the module for, and whether the whole
 * statement is type-only (`import type …`, `export type …`).
 *
 * Read off the tokens the scan already has: `{ a, type b, c as d }` asks for `a`, `b` and
 * `c`; a default or namespace binding asks for no name a façade could lack (`default` is
 * the factory, and `* as ns` is checked where it is used, which a scan cannot see). A name
 * written as a string (`{ 'a-b' as c }`) is left unverified rather than guessed at.
 */
export function bindingsOf(clause: readonly string[]): { typeOnly: boolean; names: string[] } {
  // `import type from 'x'` is a default binding named `type`, not a modifier.
  const typeOnly = clause[0] === 'type' && clause.length > 1;
  const open = clause.indexOf('{');
  const close = clause.indexOf('}', open);
  if (open === -1 || close === -1) return { typeOnly, names: [] };
  const names: string[] = [];
  let element: string[] = [];
  for (const token of [...clause.slice(open + 1, close), ',']) {
    if (token !== ',') {
      element.push(token);
      continue;
    }
    // `type x` / `type x as y`: the modifier. `type` alone, or `type as y`, is a binding named `type`.
    const modifier = element[0] === 'type' && element.length > 1 && element[1] !== 'as';
    const name = modifier ? element[1] : element[0];
    if (name !== undefined && name !== 'default' && name !== QUOTED && WORD.test(name.charAt(0))) names.push(name);
    element = [];
  }
  return { typeOnly, names };
}

/** The names in `site`'s clause that `to` does not export. Empty when there is no clause, or no table for `to`. */
function missingFrom(site: Site, to: string): { typeOnly: boolean; missing: string[] } {
  const exported = FACADE_EXPORTS[to];
  if (site.clause === undefined || exported === undefined) return { typeOnly: false, missing: [] };
  const { typeOnly, names } = bindingsOf(site.clause);
  return { typeOnly, missing: names.filter((name) => !exported.includes(name)) };
}

/**
 * U12-4 — the names in `site` whose identity a dependency that still installs the incumbent
 * would not share, or none.
 *
 * An error class is compared with `instanceof`, and `@inquirer/confirm` throws the
 * `ExitPromptError` of the `@inquirer/core` it depends on, never caique's. So an import that
 * names one of the target's {@link IDENTITY} classes stays on the incumbent. An import whose
 * names cannot be read — `import * as`, `require()`, `import()`, `export *` — might name one,
 * so it stays too. A type-only import is erased and compares nothing; a mock binds nothing.
 */
function crossing(site: Site, to: string, through: readonly string[] | undefined): Omit<Kept, 'file'> | undefined {
  const classes = IDENTITY[to] ?? [];
  if (through === undefined || classes.length === 0 || site.refers === true) return undefined;
  const bindings = site.clause === undefined ? undefined : bindingsOf(site.clause);
  if (bindings?.typeOnly === true) return undefined;
  // Unreadable names might be any of the classes, so every one of them counts.
  const named = bindings === undefined || site.clause?.includes('*') === true ? undefined : bindings.names;
  const unreadable = named === undefined;
  const names = classes.filter((name) => named?.includes(name) ?? true);
  if (names.length === 0) return undefined;
  const which = unreadable ? `this import may name ${names.join(', ')}` : `${names.join(', ')}`;
  return {
    line: site.line,
    specifier: site.specifier,
    names,
    note: `${which}: ${through.join(', ')} still throws the '${site.specifier}' class${names.length === 1 ? '' : 'es'}, which ${to}'s are not instanceof, so this import stays on '${site.specifier}'`,
  };
}

/** What one host site does: move, stay on the incumbent as a kept import, or refuse the file. */
function classify(site: Site, transitive: ReadonlyMap<string, readonly string[]>): 'moves' | 'unmapped' | Omit<Kept, 'file'> | Omit<Refusal, 'file'> {
  const to = MAPPING[site.specifier];
  if (to === undefined) return 'unmapped';
  if (site.require === true && requireShapesDiffer(site.specifier, to)) return { line: site.line, specifier: site.specifier, reason: 'require-of-default' };
  const { typeOnly, missing } = missingFrom(site, to);
  if (missing.length === 0) return crossing(site, to, transitive.get(packageOf(site.specifier))) ?? 'moves';
  if (typeOnly) return { line: site.line, specifier: site.specifier, names: missing, note: `${to} does not export ${missing.join(', ')}; this type-only import stays on '${site.specifier}', so keep its types installed` };
  return { line: site.line, specifier: site.specifier, reason: 'unknown-export', names: missing };
}

/**
 * Every import of a sibling whose state a rewritten incumbent reads ({@link SIBLING_STATE}).
 *
 * `hits` decides whether the file is a rewrite candidate, so an incumbent that is skipped (off
 * its graded major) or not level is not one, and its sibling is none of this command's business.
 * A type-only import of the sibling is erased before anything runs, so it configures nothing
 * and is not refused.
 */
function siblingState(sites: readonly Site[], hits: readonly Site[]): Omit<Refusal, 'file'>[] {
  const rewritten = new Set(hits.map((s) => packageOf(s.specifier)));
  return Object.entries(SIBLING_STATE)
    .filter(([incumbent]) => rewritten.has(incumbent))
    .flatMap(([, { sibling, fix }]) =>
      sites
        .filter((s) => packageOf(s.specifier) === sibling && !(s.clause !== undefined && bindingsOf(s.clause).typeOnly))
        .map((s) => ({ line: s.line, specifier: s.specifier, reason: 'sibling-state' as const, fix })),
    );
}

/** No package skipped. */
const NONE: ReadonlySet<string> = new Set();

/** No incumbent that another dependency still installs. */
const ALONE: ReadonlyMap<string, readonly string[]> = new Map();

/**
 * A2/A5 — map every host specifier in one file, or map none of them.
 *
 * The edits are applied from the end backwards so earlier offsets stay valid, and the
 * source is returned unchanged the moment there is a refusal in it: the unit of success is
 * the file, so the worst case is *nothing changed here, and here is why* (D-051).
 *
 * `skip` names the incumbents to leave alone, and `transitive` each incumbent another of the
 * project's dependencies still installs, with those dependencies (U12-4).
 */
export function rewriteSource(source: string, skip: ReadonlySet<string> = NONE, transitive: ReadonlyMap<string, readonly string[]> = ALONE): Rewrite {
  return rewriteFile(source, skip, transitive).rewrite;
}

/** {@link rewriteSource}, and every incumbent the file names in a specifier position, skipped or not — what `detected.imported` and `undeclared` read. */
function rewriteFile(source: string, skip: ReadonlySet<string>, transitive: ReadonlyMap<string, readonly string[]>): { rewrite: Rewrite; seen: string[] } {
  if (!mentionsAHost(source)) return { rewrite: { source, mapped: [], refused: [], kept: [], relevant: false }, seen: [] };
  const { sites, nonLiteral } = scan(source);
  const named = sites.filter((s) => MAPPING[s.specifier] !== undefined || isDeep(s.specifier));
  const seen = [...new Set(named.map((s) => packageOf(s.specifier)))];
  const hits = named.filter((s) => !skip.has(packageOf(s.specifier)));
  if (hits.length === 0) return { rewrite: { source, mapped: [], refused: [], kept: [], relevant: false }, seen };

  // A name the façade lacks: a type-only statement stays on the incumbent (types are
  // erased, so the rest of the file can still move); anything else is refused, because
  // a value import of a missing name fails at load and a mixed one cannot be split by a scan.
  const kept: Omit<Kept, 'file'>[] = [];
  const unknown: Omit<Refusal, 'file'>[] = [];
  const moving: Site[] = [];
  for (const site of hits) {
    const verdict = classify(site, transitive);
    if (verdict === 'unmapped') continue;
    if (verdict === 'moves') moving.push(site);
    else if ('note' in verdict) kept.push(verdict);
    else unknown.push(verdict);
  }

  const refused: Omit<Refusal, 'file'>[] = [
    ...hits.filter((s) => isDeep(s.specifier)).map((s) => ({ line: s.line, specifier: s.specifier, reason: 'deep-import' as const })),
    ...nonLiteral.map((line) => ({ line, specifier: '', reason: 'non-literal-specifier' as const })),
    ...unknown,
    ...siblingState(sites, hits),
  ].sort((a, b) => a.line - b.line);
  if (refused.length > 0) return { rewrite: { source, mapped: [], refused, kept: [], relevant: true, retained: [...new Set(hits.map((s) => packageOf(s.specifier)))] }, seen };

  let out = source;
  const mapped: { from: string; to: string }[] = [];
  for (const site of moving.sort((a, b) => b.start - a.start)) {
    const to = MAPPING[site.specifier] as string;
    out = `${out.slice(0, site.start)}${to}${out.slice(site.end)}`;
    mapped.push({ from: site.specifier, to });
  }
  return { rewrite: { source: out, mapped: mapped.reverse(), refused: [], kept, relevant: true }, seen };
}

/* ------------------------------------------------------------------ the project */

const SOURCE_EXTENSIONS = new Set(['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.mts', '.cts']);
/** Generated and vendored trees. Migrating `node_modules` would rewrite somebody else's package. */
const SKIP = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', '.turbo', '.next', '.output', '.cache', '.vercel']);

/** Every source file under `dir`, relative and slash-separated so a report reads the same everywhere. */
export function sourceFiles(dir: string, at = '', found: string[] = []): string[] {
  for (const entry of readdirSync(join(dir, at), { withFileTypes: true })) {
    const path = at === '' ? entry.name : `${at}/${entry.name}`;
    if (entry.isDirectory()) {
      if (!SKIP.has(entry.name)) sourceFiles(dir, path, found);
    } else if (SOURCE_EXTENSIONS.has(entry.name.slice(entry.name.lastIndexOf('.')))) found.push(path);
  }
  return found;
}

/** The four fields a manifest declares a dependency in. U12-3 counts every one: a peer or an optional dependency is as much the project's choice as a dependency is. */
const DECLARING = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'] as const;

type Manifest = Partial<Record<(typeof DECLARING)[number], Record<string, string>>>;

/** Every dependency the manifest at `path` declares, with its range; empty when there is none to read. */
async function declaredIn(path: string): Promise<Map<string, string>> {
  try {
    const raw = JSON.parse(await readFile(path, 'utf8')) as Manifest;
    return new Map(DECLARING.flatMap((field) => Object.entries(raw[field] ?? {})));
  } catch {
    return new Map();
  }
}

/** Every dependency the project's `package.json` declares, with its range — one of A1's two independent sources. */
async function declaredDependencies(dir: string): Promise<Map<string, string>> {
  return await declaredIn(join(dir, 'package.json'));
}

/** The version installed at `dir/node_modules/<name>`, when there is one. */
async function installedVersion(dir: string, name: string): Promise<string | undefined> {
  try {
    return (JSON.parse(await readFile(join(dir, 'node_modules', name, 'package.json'), 'utf8')) as { version?: string }).version;
  } catch {
    return undefined;
  }
}

/**
 * Incumbents this project has on a major its drop-in does not claim (A12, C1). The claim is
 * `SUPPORTED_MAJORS` — every major graded level by that major's own suite — so an older major
 * that reaches level is served here without another edit.
 */
async function offMajorOf(dir: string, dependencies: Map<string, string>): Promise<OffMajor[]> {
  const found = await Promise.all(HOSTS.map(async (from) => ({ from, found: (await installedVersion(dir, from)) ?? dependencies.get(from) })));
  return found.flatMap(({ from, found: version }) => {
    const graded = GRADED_VERSIONS[from];
    if (version === undefined || graded === undefined) return [];
    const major = majorOf(version);
    // A graded host always has its majors: `supported-majors-lock.test.ts` holds one list per graded host.
    return major === undefined || (SUPPORTED_MAJORS[from] as readonly number[]).includes(major) ? [] : [{ from, found: version, graded }];
  });
}

/**
 * U12-4 — each incumbent in `moving` that another declared dependency depends on, with those
 * dependencies, read off their installed manifests. Nothing installed is nothing known, so a
 * project that has not run its install yet is told nothing here.
 */
async function transitiveOf(dir: string, dependencies: Map<string, string>, moving: readonly string[]): Promise<Map<string, string[]>> {
  const others = [...dependencies.keys()].filter((name) => !moving.includes(name)).sort();
  const needs = await Promise.all(others.map(async (name) => ({ name, on: await declaredIn(join(dir, 'node_modules', name, 'package.json')) })));
  const out = new Map<string, string[]>();
  for (const from of moving) {
    const through = needs.filter(({ on }) => on.has(from)).map(({ name }) => name);
    if (through.length > 0) out.set(from, through);
  }
  return out;
}

/* ------------------------------------------------------------------ what to run next */

/** The package manager whose lockfile is here, so `next` is a command that runs as written. */
function installer(dir: string): { add: string; remove: string } {
  const has = (file: string): boolean => existsSync(join(dir, file));
  if (has('pnpm-lock.yaml')) return { add: 'pnpm add', remove: 'pnpm remove' };
  if (has('yarn.lock')) return { add: 'yarn add', remove: 'yarn remove' };
  if (has('bun.lockb') || has('bun.lock')) return { add: 'bun add', remove: 'bun remove' };
  return { add: 'npm install', remove: 'npm uninstall' };
}

/** Every family package a rewrite can name: the packages of `MAPPING`'s targets. */
const FAMILY: readonly string[] = [...new Set(Object.values(MAPPING).map(packageOf))].sort();

/**
 * U12-2 — the version of each family package this burgee was built beside: the version that
 * carries the graded drop-in, since the oracle grades the workspace.
 *
 * The build writes `family-versions.json` beside this module from `packages/<name>/package.json`
 * (`scripts/family-versions.mjs`), so the published package carries the numbers and types none.
 * Run from source there is no such file, and the same manifests are two directories up, so they
 * are read there instead. Neither: no pins, and an unpinned command is what this printed before.
 */
export async function familyVersions(here: string = dirname(fileURLToPath(import.meta.url))): Promise<Record<string, string>> {
  try {
    return JSON.parse(await readFile(join(here, 'family-versions.json'), 'utf8')) as Record<string, string>;
  } catch {
    const found = await Promise.all(FAMILY.map(async (name) => [name, (await readFile(join(here, '..', '..', name, 'package.json'), 'utf8').catch(() => '{}')) as string] as const));
    return Object.fromEntries(found.flatMap(([name, raw]) => {
      const { version } = JSON.parse(raw) as { version?: string };
      return version === undefined ? [] : [[name, version]];
    }));
  }
}

/**
 * `npm install roundel@^1.0.0 flagstaff@^1.2.1 && npm uninstall chalk ora`, or the half that applies.
 *
 * Pinned since U12-2. Unpinned, `pnpm add burgee flagstaff roundel` under mac-cleaner's
 * `minimumReleaseAge` resolved roundel 0.6.2, flagstaff 1.0.3 and burgee 0.15.0 and saved them,
 * and none of the three carries the drop-in the report had just graded. A caret at the version
 * the graded drop-in shipped in installs that version or a compatible later one, and fails
 * loudly rather than settling for an older one. A peer that is not ours (`react-reconciler`)
 * is not pinned: its version is the project's business.
 */
function nextStep(dir: string, add: string[], remove: string[], versions: Readonly<Record<string, string>>): string {
  const pm = installer(dir);
  const pinned = add.map((name) => (versions[name] === undefined ? name : `${name}@^${versions[name]}`));
  const steps = [pinned.length > 0 ? `${pm.add} ${pinned.join(' ')}` : '', remove.length > 0 ? `${pm.remove} ${remove.join(' ')}` : ''];
  return steps.filter((c) => c !== '').join(' && ');
}

/** The settings that refuse a version younger than a number of minutes, by file, and how each is spelled there. */
const RELEASE_AGE: readonly { file: string; key: string; separator: ':' | '=' }[] = [
  { file: 'pnpm-workspace.yaml', key: 'minimumReleaseAge', separator: ':' },
  { file: '.npmrc', key: 'minimum-release-age', separator: '=' },
  { file: 'npmrc', key: 'minimum-release-age', separator: '=' },
];

/**
 * U12-2 — the project's minimum release age, when it sets one.
 *
 * Read as lines, not parsed: the key is a top-level scalar in both formats, so a line that
 * starts with it is the setting and anything indented or commented out is not. A setting is
 * the reason a pinned install can still fail, so the report names the file it came from.
 */
async function releaseAgeOf(dir: string): Promise<ReleaseAge | null> {
  for (const { file, key, separator } of RELEASE_AGE) {
    // eslint-disable-next-line reliability/no-await-in-loop -- three small files, in the order a reader would look, and the first one that answers wins
    const text = await readFile(join(dir, file), 'utf8').catch(() => '');
    for (const line of text.split('\n')) {
      if (!line.startsWith(key)) continue;
      const [name, value = ''] = line.split(separator);
      // A comment after a YAML value (`1440 # a day`) is not part of it.
      const digits = /^\d+/.exec(value.trim())?.[0];
      if (name?.trim() !== key || digits === undefined) continue;
      const minutes = Number(digits);
      return {
        file,
        minutes,
        note: `${file} sets ${key} to ${minutes} minutes, and a family version in next may be younger than that: the install then fails, or resolves an older version without the drop-in. Check what was installed, or exempt the family packages from the rule`,
      };
    }
  }
  return null;
}

/**
 * `git status --porcelain`, or `undefined` where there is no repository to ask (A6).
 *
 * Through `bellpull` rather than `node:child_process`, because spawning is bellpull's job
 * and `scripts/inline-implementation-lock.test.ts` says so — it caught the first draft of
 * this file, which reached for `execFileSync` out of habit. burgee already depends on the
 * package, and `migrate.js` is loaded lazily, so nothing that does not run `migrate` pays
 * for the edge.
 *
 * Not a repository, no `git` on `PATH`, an unreadable directory: all the same answer, which
 * is *there is nothing here that could be dirty*. A6 protects a reviewable diff, and where
 * there is no repository there is no diff to protect — refusing instead would make the
 * command unusable on a tarball for a safety that was never available.
 */
export async function workingTree(dir: string): Promise<string[] | undefined> {
  const result = await run('git', ['-C', dir, 'status', '--porcelain'], { runtime: ambientRuntime(), stdio: 'pipe' });
  if (!result.ok) return undefined;
  return result.stdout.split('\n').filter((line) => line !== '');
}

/** The symbol `failure.ts` reads a class's own exit code from, spelled here so this lazy module imports nothing for it. */
const EXIT_CODE = Symbol.for('burgee.exitCode');

/**
 * A6 — a dirty tree has no reviewable diff to add to, so the command declines rather than writes.
 *
 * It declares its exit code the way `defineError` does (E7), on the class under
 * `Symbol.for('burgee.exitCode')`. That read is what makes the engine carry `fix` to stderr
 * and the `--json` envelope; a plain `Error` falls through to a bare RUNTIME, which is how
 * this `fix` went unprinted until 2026-09-30.
 */
export class DirtyTreeError extends Error {
  static readonly [EXIT_CODE] = ExitCode.RUNTIME;
  readonly fix = 'commit or stash your changes, or pass --force';
  constructor(readonly entries: string[]) {
    super(`the git tree has ${entries.length} uncommitted change${entries.length === 1 ? '' : 's'}`);
    this.name = 'DirtyTreeError';
  }
}

/** Every incumbent package `--only` and `--skip` may name: each one a graded drop-in replaces, level or not. */
export const INCUMBENTS: readonly string[] = [...new Set(DROP_INS.map((d) => packageOf(d.from)))].sort();

/** U12-3 — `--only` or `--skip` named a package this command does not migrate. A usage error: the fix is the command line. */
export class UnknownIncumbentError extends Error {
  static readonly [EXIT_CODE] = ExitCode.USAGE;
  readonly fix = `name incumbents by package, comma-separated: ${INCUMBENTS.join(', ')}`;
  constructor(readonly names: string[]) {
    super(`burgee migrate does not migrate ${names.join(', ')}`);
    this.name = 'UnknownIncumbentError';
  }
}

export interface MigrateOptions {
  dir: string;
  dryRun?: boolean;
  force?: boolean;
  /** U12-3 — rewrite these incumbents and no others, declared or not. Package names: `chalk`, `@inquirer/core`. */
  only?: readonly string[];
  /** U12-3 — leave these incumbents alone. */
  skip?: readonly string[];
  /** Injected by the tests; the real `git status --porcelain` otherwise. */
  status?: (dir: string) => string[] | undefined | Promise<string[] | undefined>;
}

/** Each name in `only` and `skip` that is not an incumbent, refused before anything is read. */
function checkNames(options: MigrateOptions): void {
  const unknown = [...(options.only ?? []), ...(options.skip ?? [])].filter((name) => !INCUMBENTS.includes(name));
  if (unknown.length > 0) throw new UnknownIncumbentError(unknown);
}

/* ------------------------------------------------------------------ the run */

/** A file the pre-filter rejected: never decoded, never scanned, never written. */
const EMPTY: Rewrite = { source: '', mapped: [], refused: [], kept: [], relevant: false };

/** One file's first pass: its rewrite, the incumbents it names, its guided sites — and its text, kept only while a second pass may need it. */
interface Scanned {
  file: string;
  result: Rewrite;
  seen: string[];
  guided: GuidedSite[];
  text?: string;
}

/**
 * One batch: read them all, then scan them all — two phases, not one pipeline per file.
 *
 * The phases are the measurement, not a preference. Read-scan-write per file puts the CPU
 * pass between two I/O completions, so the scan serialises the batch's reads behind it; the
 * same 1,000-file tree measured 350–570 ms that way and 390–500 ms phased, against a floor
 * of about 150 ms of pure filesystem plus 25 ms of scan. (Fully synchronous I/O, for the
 * record, is **3.1–5.2 seconds** — an order of magnitude, which is why the concurrency is
 * here at all.)
 *
 * Nothing is written here any more (U12-4): a refusal in the last file can hold an incumbent
 * the first file imports, so every file is scanned before any is written.
 */
async function scanBatch(dir: string, batch: string[], skip: ReadonlySet<string>, transitive: ReadonlyMap<string, readonly string[]>): Promise<Scanned[]> {
  // Read as bytes and decode only what the pre-filter admits: on the bench tree a third of
  // the files never become a string at all, which is 405 ms against 427 for the same work.
  const sources = await Promise.all(batch.map(async (file) => await readFile(join(dir, file))));
  return sources.map((bytes, i) => {
    const text = mentionsAHost(bytes) ? bytes.toString('utf8') : undefined;
    const { rewrite, seen } = text === undefined ? { rewrite: EMPTY, seen: [] } : rewriteFile(text, skip, transitive);
    const guided = mentionsAGuided(bytes) ? guidedSites(tokensOf(bytes.toString('utf8'))) : [];
    return { file: batch[i] as string, result: rewrite, seen, guided, ...(rewrite.relevant && text !== undefined ? { text } : {}) };
  });
}

/** The per-mapping rollup, in the order `MAPPING` declares — so two runs print the same table. */
function rollup(all: { from: string; to: string; file: string }[]): Mapped[] {
  return Object.entries(MAPPING)
    .map(([from, to]) => {
      const hits = all.filter((m) => m.from === from);
      return { from, to, imports: hits.length, files: new Set(hits.map((m) => m.file)).size };
    })
    .filter((row) => row.imports > 0);
}

/**
 * A7 — the compat figures come from `compat.ts`, which `compat-baseline-lock.test.ts`
 * holds equal to `compat-oracle/baseline/<host>.json`. A number typed into a report
 * template is a number that goes stale silently, and this repository has published four
 * of those and caught them all late.
 */
function gradedFor(packages: string[]): (Row & { host: string })[] {
  const hosts = [...new Set(packages.map((p) => HOST_OF.get(p)).filter((h) => h !== undefined))];
  return hosts.filter((host) => GRADED[host] !== undefined).map((host) => ({ host, ...(GRADED[host] as Row) }));
}

/**
 * U12-4 — every incumbent a refused file or a kept import still names, with the files.
 *
 * A refused file is left whole, so each incumbent in it is held, not only the one refused.
 */
function heldBy(scanned: readonly Scanned[]): Held[] {
  const held = new Map<string, { files: Set<string>; refused: boolean }>();
  const hold = (from: string, file: string, refused: boolean): void => {
    const entry = held.get(from) ?? { files: new Set<string>(), refused: false };
    entry.files.add(file);
    entry.refused ||= refused;
    held.set(from, entry);
  };
  for (const { file, result } of scanned) {
    for (const from of result.retained ?? []) hold(from, file, true);
    for (const k of result.kept) hold(packageOf(k.specifier), file, false);
  }
  return [...held.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([from, { files, refused }]) => ({ from, files: [...files].sort(), because: refused ? 'refused' : 'kept' }));
}

/** `1 file`, `2 files`. */
const fileCount = (n: number): string => `${n} file${n === 1 ? '' : 's'}`;

/** U12-5 — the outcome in words, so a partial run never reads as a finished one. */
function summaryOf(touched: number, refusedFiles: number, dryRun: boolean): string {
  const done = `${fileCount(touched)} ${dryRun ? 'would be rewritten' : 'rewritten'}`;
  if (refusedFiles > 0) return `partial: ${done}, ${refusedFiles} refused`;
  return touched > 0 ? `complete: ${done}` : 'nothing to rewrite';
}

/**
 * How many files are in flight at once — bounded by the open-file limit rather than by a
 * thread pool, as the design says (A10).
 *
 * Measured, because the first number chosen was wrong. Over the 1,000-file bench tree the
 * read phase costs 418 ms at 32, 107 ms at 64 and 83 ms unbounded; the write phase 135 ms at
 * 64 and 69 ms unbounded. 256 is where the curve has flattened and is still an order of
 * magnitude under the lowest `ulimit -n` anyone runs (1,024), so the bound is real rather
 * than decorative. The scan itself is 25 ms of the whole run — this is a filesystem budget,
 * which is exactly what "no AST" bought.
 */
const BATCH = 256;

/** Write every rewritten file, {@link BATCH} at a time. */
async function writeAll(dir: string, changed: readonly { file: string; source: string }[]): Promise<void> {
  for (let i = 0; i < changed.length; i += BATCH) {
    // eslint-disable-next-line reliability/no-await-in-loop -- the await IS the bound (A10), as in the read loop
    await Promise.all(changed.slice(i, i + BATCH).map(async ({ file, source }) => await writeFile(join(dir, file), source)));
  }
}

/* ------------------------------------------------------------------ the text surface */


/** Every error class the targets of `from`'s specifiers export, in table order. */
function identityOf(from: string): string[] {
  return [...new Set(Object.entries(MAPPING).flatMap(([specifier, to]) => (packageOf(specifier) === from ? (IDENTITY[to] ?? []) : [])))];
}

/** A titled list, or nothing when there is nothing in it. */
function section(title: string, lines: readonly string[]): string[] {
  return lines.length === 0 ? [] : [`${title}:`, ...lines.map((line) => `  ${line}`)];
}

/** `a, b, c`, or `none`. */
const list = (items: readonly string[]): string => (items.length === 0 ? 'none' : items.join(', '));

/** A refusal as one line: where, what, why, and the fix when it has one. */
function refusalLine(r: Refusal): string {
  const why = r.names === undefined ? r.reason : `${r.reason} (${r.names.join(', ')})`;
  return `${r.file}:${r.line}  ${r.specifier === '' ? '<not a literal>' : r.specifier}  ${why}${r.fix === undefined ? '' : `; fix: ${r.fix}`}`;
}

/**
 * U12-5 — the report as a person reads it. The engine's text surface is one level deep and
 * printed every list in this report as a line of JSON; this is the same report in sentences
 * and aligned lines, first line the summary. `--json` is unchanged: the data is the data.
 */
export function textOf(r: MigrationReport): string {
  const lines = [
    r.summary,
    ...section(
      r.dryRun ? 'would rewrite' : 'rewrote',
      r.mapped.map((m) => `${m.from} -> ${m.to}  ${m.imports} import${m.imports === 1 ? '' : 's'} in ${fileCount(m.files)}`),
    ),
    ...section('refused, and left exactly as it was', r.refused.map(refusalLine)),
    ...section('kept on the incumbent', r.kept.map((k) => `${k.file}:${k.line}  ${k.specifier}  ${k.note}`)),
    ...section(
      'held, rewritten in no file',
      r.held.map((h) => `${h.from}  ${h.because} in ${h.files.join(', ')}`),
    ),
    ...(r.undeclared.length === 0 ? [] : [`undeclared: ${r.undeclared.join(', ')}  (imported but not in package.json, so left alone; --only names them)`]),
    ...section(
      'still installed by another dependency',
      r.transitive.map((t) => `${t.from} through ${t.through.join(', ')}${t.exports.length === 0 ? '' : `; its ${t.exports.join(', ')} would be different classes, so imports of them stay`}`),
    ),
    ...section('not level yet, left alone', r.partial.map((p) => `${p.from} -> ${p.to}  ${p.passed} / ${p.reference} (the incumbent passes ${p.control})`)),
    ...section('on a major that was not graded, left alone', r.offMajor.map((o) => `${o.from} ${o.found} (graded ${o.graded})`)),
    ...section('no drop-in; see the guide', r.guided.map((g) => `${g.file}:${g.line}  ${g.from}  ${g.pattern}  ${g.guide}`)),
    ...section('graded by the incumbent’s own suite', r.graded.map((g) => `${g.host}  ${g.passed} / ${g.reference} (the incumbent passes ${g.control})`)),
    `declared: ${list(r.detected.declared)}`,
    `imported: ${list(r.detected.imported)}`,
    `add: ${list(r.dependencies.add)}`,
    `removable: ${list(r.dependencies.removable)}`,
    ...(r.releaseAge === null ? [] : [`release age: ${r.releaseAge.note}`]),
    ...(r.next === '' ? [] : [`next: ${r.next}`]),
  ];
  return lines.join('\n');
}

/**
 * Migrate one project: detect, rewrite, report (A1, A7, A8).
 *
 * Non-interactive by design (D-052). The second audience is an agent migrating a
 * repository unattended, and a prompt is a wall; safety is `--dry-run` and the refusal on
 * a dirty tree, not a question.
 *
 * Since U12 it moves an incumbent the project chose — declared in its `package.json`, or named
 * by `--only` — in every file or in none: the first pass scans everything, any incumbent a
 * refused file or a kept import still names is held, and only then is anything written.
 */
export async function migrate(options: MigrateOptions): Promise<MigrationReport> {
  const { dir, dryRun = false, force = false } = options;
  checkNames(options);
  const entries = await (options.status ?? workingTree)(dir);
  if (!dryRun && !force && entries !== undefined && entries.length > 0) throw new DirtyTreeError(entries);

  const dependencies = await declaredDependencies(dir);
  const offMajor = await offMajorOf(dir, dependencies);
  const only = options.only === undefined ? undefined : new Set(options.only);
  const skipped = new Set(options.skip);
  // U12-3: an incumbent moves when the project chose it — `--only`, or else its manifest — and nothing excludes it.
  const chosen = HOSTS.filter((host) => (only === undefined ? dependencies.has(host) : only.has(host)) && !skipped.has(host) && !offMajor.some((o) => o.from === host));
  const skip = new Set(HOSTS.filter((host) => !chosen.includes(host)));
  const through = await transitiveOf(dir, dependencies, chosen);

  const files = sourceFiles(dir);
  const scanned: Scanned[] = [];
  for (let i = 0; i < files.length; i += BATCH) {
    // eslint-disable-next-line reliability/no-await-in-loop -- the await IS the bound (A10). Each batch is 256 files in flight at once; awaiting one before opening the next is what keeps the command inside the open-file limit on a repository of any size, and `Promise.all` over every file in a monorepo is EMFILE.
    scanned.push(...(await scanBatch(dir, files.slice(i, i + BATCH), skip, through)));
  }

  // U12-4: what the first pass refused or kept is held everywhere, and a second pass over the
  // files that named an incumbent rewrites without it. Refusing never adds a refusal — it only
  // removes sites — so the second pass refuses nothing the first did not.
  const held = heldBy(scanned);
  const rewrites =
    held.length === 0
      ? scanned.map(({ file, result }) => ({ file, result }))
      : scanned.map(({ file, result, text }) => ({ file, result: text === undefined ? result : rewriteFile(text, new Set([...skip, ...held.map((h) => h.from)]), through).rewrite }));
  const changed = rewrites.filter(({ result }) => result.mapped.length > 0).map(({ file, result }) => ({ file, source: result.source }));
  if (!dryRun) await writeAll(dir, changed);

  const all = rewrites.flatMap(({ file, result }) => result.mapped.map((m) => ({ ...m, file })));
  const refused: Refusal[] = scanned.flatMap(({ file, result }) => result.refused.map((r) => ({ file, ...r })));
  const kept: Kept[] = scanned.flatMap(({ file, result }) => result.kept.map((k) => ({ file, ...k })));
  const guided: Guided[] = scanned.flatMap(({ file, guided: sites }) => sites.map((site) => ({ file, ...site })));
  const imported = [...new Set(scanned.flatMap(({ seen }) => seen))].sort();
  const declared = HOSTS.filter((host) => dependencies.has(host));
  // A dependency is removable only when it moved everywhere: a held incumbent is still
  // imported — by a refused file, which is left whole, or by a kept import — so the
  // maintainer's `npm rm` would break their own build. Until 2026-09-30 a `chalk` imported only
  // beside a refused `commander/lib/help.js` was called removable, and `next` said
  // `npm uninstall chalk`. One the project did not choose is not this command's to remove.
  const removable = declared.filter((host) => chosen.includes(host) && !held.some((h) => h.from === host));
  const add = [...new Set(all.flatMap((m) => [packageOf(m.to), ...(PEERS_OF[m.to] ?? [])]))].filter((p) => !dependencies.has(p)).sort();
  const partial = PARTIAL.filter((d) => dependencies.has(d.from)).map((d) => ({ from: d.from, to: d.to, ...(GRADED[d.host] as Row) }));
  const refusedFiles = new Set(refused.map((r) => r.file)).size;
  const undeclared = imported.filter((host) => !dependencies.has(host) && only?.has(host) !== true);

  const report: MigrationReport = {
    summary: summaryOf(changed.length, refusedFiles, dryRun),
    files: changed.length,
    imports: all.length,
    mapped: rollup(all),
    refused,
    kept,
    detected: { declared, imported },
    dependencies: { before: declared, removable, after: declared.length - removable.length, add },
    // The grades of what the project uses and chose; an undeclared incumbent is not this run's.
    graded: gradedFor([...new Set([...declared, ...imported])].filter((host) => !undeclared.includes(host)).sort()),
    partial,
    offMajor,
    guided,
    undeclared,
    held,
    transitive: [...through.entries()].map(([from, by]) => ({ from, through: by, exports: identityOf(from) })),
    releaseAge: await releaseAgeOf(dir),
    next: nextStep(dir, add, removable, await familyVersions()),
    dryRun,
    changed: !dryRun && changed.length > 0,
    exitCode: refused.length > 0 ? ExitCode.RUNTIME : ExitCode.OK,
  };
  // U12-5: the text surface, under a symbol so `--json` never carries it (`render.ts`).
  Object.defineProperty(report, TEXT, { value: () => textOf(report), enumerable: false });
  return report;
}

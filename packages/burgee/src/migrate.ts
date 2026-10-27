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
import { existsSync, readdirSync, statSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ambientRuntime, run } from 'bellpull';

import { DROP_INS, GRADED, GRADED_MAJORS, GRADED_VERSIONS, isLevel, PREVIOUS_MAJOR_ENTRIES, type Row, SUPPORTED_MAJORS } from './compat.js';
import { ExitCode } from './exit-code.js';
import { guidedSites, mentionsAGuided, type GuidedSite, type Token } from './migrate-guided.js';
import { hostOfApi, isMajorHost, type MajorHost, moveOf, nearestOf, removedMajor, type RemovedSite, removedSites } from './migrate-majors.js';
import { isUntracked, listed, pathsOf, preflightOf, type PreflightRow, type ProjectManifest } from './migrate-preflight.js';
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
  'burgee/commander/extra-typings': [
    'AddHelpTextContext',
    'AddHelpTextPosition',
    'Argument',
    'BurgeeParseOptions',
    'Command',
    'CommandOptions',
    'CommandUnknownOpts',
    'CommanderError',
    'DualOptions',
    'ErrorOptions',
    'ExecutableCommandOptions',
    'Help',
    'HelpConfiguration',
    'HelpContext',
    'HookEvent',
    'HookListener',
    'InferArgument',
    'InferArguments',
    'InferCommandArguments',
    'InferOptions',
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
  'caique/inquirer/prompts': [
    'CheckboxConfig',
    'CheckboxTheme',
    'Choice',
    'ConfirmConfig',
    'ConfirmTheme',
    'EditorConfig',
    'EditorFileOptions',
    'EditorTheme',
    'ExpandChoice',
    'ExpandConfig',
    'ExpandKey',
    'InputConfig',
    'InputTheme',
    'NormalizedChoice',
    'NumberConfig',
    'PasswordConfig',
    'PasswordTheme',
    'RawlistChoice',
    'RawlistConfig',
    'RawlistTheme',
    'SearchChoice',
    'SearchConfig',
    'SearchTheme',
    'SelectConfig',
    'SelectTheme',
    'Separator',
    'checkbox',
    'confirm',
    'editor',
    'expand',
    'input',
    'number',
    'password',
    'rawlist',
    'search',
    'select',
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
  'closeout/onetime': [
    'OnetimeFunction',
    'Options',
    'default',
  ],
  'closeout/cli-cursor': [
    'default',
  ],
  'linegauge/cli-truncate': [
    'Options',
    'default',
  ],
  'linegauge/widest-line': [
    'default',
  ],
  'roundel/colorette': [
    'Color',
    'Colorette',
    'bgBlack',
    'bgBlackBright',
    'bgBlue',
    'bgBlueBright',
    'bgCyan',
    'bgCyanBright',
    'bgGreen',
    'bgGreenBright',
    'bgMagenta',
    'bgMagentaBright',
    'bgRed',
    'bgRedBright',
    'bgWhite',
    'bgWhiteBright',
    'bgYellow',
    'bgYellowBright',
    'black',
    'blackBright',
    'blue',
    'blueBright',
    'bold',
    'createColors',
    'cyan',
    'cyanBright',
    'dim',
    'gray',
    'green',
    'greenBright',
    'hidden',
    'inverse',
    'isColorSupported',
    'italic',
    'magenta',
    'magentaBright',
    'red',
    'redBright',
    'reset',
    'strikethrough',
    'underline',
    'white',
    'whiteBright',
    'yellow',
    'yellowBright',
  ],
  'roundel/kleur': [
    'Color',
    'Kleur',
    'default',
    'module.exports',
  ],
  'roundel/kleur/colors': [
    '$',
    'Colorize',
    'bgBlack',
    'bgBlue',
    'bgCyan',
    'bgGreen',
    'bgMagenta',
    'bgRed',
    'bgWhite',
    'bgYellow',
    'black',
    'blue',
    'bold',
    'cyan',
    'dim',
    'gray',
    'green',
    'grey',
    'hidden',
    'inverse',
    'italic',
    'magenta',
    'red',
    'reset',
    'strikethrough',
    'underline',
    'white',
    'yellow',
  ],
  'roundel/picocolors': [
    'Colors',
    'Formatter',
    'createColors',
    'default',
    'isColorSupported',
    'module.exports',
  ],
  'roundel/supports-color': [
    'ColorInfo',
    'ColorSupport',
    'ColorSupportLevel',
    'Options',
    'createSupportsColor',
    'default',
  ],
  'roundel/yoctocolors': [
    'Format',
    'bgBlack',
    'bgBlue',
    'bgBlueBright',
    'bgCyan',
    'bgCyanBright',
    'bgGray',
    'bgGreen',
    'bgGreenBright',
    'bgMagenta',
    'bgMagentaBright',
    'bgRed',
    'bgRedBright',
    'bgWhite',
    'bgWhiteBright',
    'bgYellow',
    'bgYellowBright',
    'black',
    'blue',
    'blueBright',
    'bold',
    'cyan',
    'cyanBright',
    'default',
    'dim',
    'gray',
    'green',
    'greenBright',
    'hidden',
    'inverse',
    'italic',
    'magenta',
    'magentaBright',
    'overline',
    'red',
    'redBright',
    'reset',
    'strikethrough',
    'underline',
    'underlineBlack',
    'underlineBlue',
    'underlineBlueBright',
    'underlineCurly',
    'underlineCyan',
    'underlineCyanBright',
    'underlineDashed',
    'underlineDotted',
    'underlineDouble',
    'underlineGray',
    'underlineGreen',
    'underlineGreenBright',
    'underlineMagenta',
    'underlineMagentaBright',
    'underlineRed',
    'underlineRedBright',
    'underlineWhite',
    'underlineWhiteBright',
    'underlineYellow',
    'underlineYellowBright',
    'white',
    'whiteBright',
    'yellow',
    'yellowBright',
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
    'KeyOrigin',
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
    'TRUTH_TABLE',
    'Transform',
    'TruthRow',
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
    'packageLayer',
    'renderExplanation',
    'resolve',
    'screaming',
    'search',
    'searchAll',
    'truthTable',
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
  'seniority/find-up': [
    'FindDownOptions',
    'Match',
    'Options',
    'findDown',
    'findDownSync',
    'findUp',
    'findUpMultiple',
    'findUpMultipleSync',
    'findUpStop',
    'findUpSync',
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
  'burgee/commander/extra-typings': ['CommanderError', 'InvalidArgumentError', 'InvalidOptionArgumentError'],
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
export const REQUIRE_NAMESPACE: readonly string[] = ['ansi-escapes', 'chalk', 'ora', 'log-update', 'boxen', 'string-width', 'strip-ansi', 'wrap-ansi', 'slice-ansi', 'restore-cursor', 'exit-hook', 'terminal-link', 'meow', 'cli-cursor', 'cli-truncate', 'widest-line', 'supports-color', 'yoctocolors'];

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
 * migrate-dynamic-specifiers R1–R3 — the three computed-specifier shapes read as loading no
 * incumbent: a path built from the working directory (`require(path.join(process.cwd(),
 * 'package.json'))`), a member of a parsed argv object (`import(argv.parser)`), and an element of
 * an argv array (`argv.use.map((plugin) => import(plugin))`).
 */
export type DynamicShape = 'cwd-path' | 'argv-member' | 'argv-element';

/** A computed specifier that was not refused, because its shape says it loads the user's file or module, never an incumbent (R6). */
export interface Dynamic {
  file: string;
  line: number;
  shape: DynamicShape;
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
  /** migrate-older-majors — the smallest claimed major above the one found, or `null` when none is. */
  nearest: number | null;
  /**
   * migrate-older-majors — every line that uses an API the incumbent removed after the major found,
   * up to the highest claimed one, each cited to the incumbent's changelog. `[]` for an incumbent
   * with no table (`REMOVED_APIS`).
   */
  sites: Removed[];
  /**
   * migrate-older-majors — each specifier the project imports, with the entry it moves to at
   * `nearest`, when no site's API is gone by then and every specifier has an entry there; `null`
   * otherwise, and for an incumbent with no table, whose removals nothing here checks. Printed, never written.
   */
  move: Record<string, string> | null;
}

/** A line of an off-major project that uses an API a claimed major removed. */
export interface Removed extends RemovedSite {
  file: string;
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
  /** `minimumReleaseAgeExclude` as written: names, globs (`@scope/*`) and `name@1.2.3 || 1.2.4`. */
  exclude: string[];
  /** Each family package `next` pins below its graded version, because the graded one is too young. */
  pins: ReleaseAgePin[];
  note: string;
}

/** A family package pinned to the newest version the release age lets install, or to the first one it will. */
export interface ReleaseAgePin {
  name: string;
  /** The caret floor `next` prints. */
  version: string;
  /** The version this burgee was graded beside. */
  graded: string;
  /** When `version` is old enough to install, ISO 8601: already past, or the date the install starts working. */
  installable: string;
  /**
   * migrate-pins-carry-the-drop-in — present when a release of the major older than `since` was
   * passed over because it does not export every specifier the rewrite imports.
   */
  requires?: { specifiers: string[]; since: string };
}

export interface MigrationReport {
  /** U12-5 — the outcome in words: `partial: 3 files rewritten, 1 refused`, `complete: …`, `blocked: …` or `nothing to rewrite`. */
  summary: string;
  /**
   * migrate-preflight R1 — what adopting the drop-ins costs this project, read before anything is
   * written: a Node its `engines` allows that cannot load them, jest that cannot, what `--force`
   * let through. A `blocking` row on a run that would rewrite a file writes nothing (R6).
   */
  preflight: PreflightRow[];
  files: number;
  imports: number;
  mapped: Mapped[];
  refused: Refusal[];
  /**
   * migrate-dynamic-specifiers R6 — computed specifiers read as loading no incumbent, by file and
   * line. Never a refusal, never a hold, and never the exit code.
   */
  dynamic: Dynamic[];
  /** Type-only imports left pointing at the incumbent, each with the note that says why. */
  kept: Kept[];
  detected: Detection;
  /** `add`: the family packages the rewritten imports now name, which the project must depend on. */
  dependencies: { before: string[]; removable: string[]; after: number; add: string[] };
  /**
   * The grade of each incumbent the project uses and chose. `major` is set when the project is
   * on a claimed older major: the row is then that major's own suite's, the one its entry
   * (`burgee/commander/v14`) is graded by, never the current major's.
   */
  graded: (Row & { host: string; major?: number })[];
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
  /** migrate-dynamic-specifiers R1–R3 — the computed specifiers read as one of the three shapes. */
  dynamic: Omit<Dynamic, 'file'>[];
  /**
   * R4 — every incumbent a string or template outside a specifier names, read only in a file with a
   * computed specifier: what that specifier could be built from.
   */
  named: string[];
}

const WORD = /[A-Za-z0-9_$]/;

/**
 * What a quoted literal is recorded as; anything else quoted is `lit`, which is never a specifier.
 * A quote character, because no word or punctuation token can be one: until 2026-10-19 it was
 * `str`, so `import(str)` read as a literal and was not refused (migrate-dynamic-specifiers).
 */
const QUOTED = "'";

/** After these, a `/` divides; after anything else it opens a regular expression. */
const DIVIDES = new Set([')', ']', '}', QUOTED]);

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

/** A run of {@link WORD} characters from `lastIndex`: one match per word rather than one test per character (A10). */
const WORD_RUN = /[A-Za-z0-9_$]*/y;

/** Index just past the identifier or number starting at `at`, or `at` when neither starts there. */
function endOfWord(source: string, at: number): number {
  WORD_RUN.lastIndex = at;
  WORD_RUN.test(source);
  return WORD_RUN.lastIndex;
}

/** The code tokens behind the cursor, plus A4's open-call state and U12-1's call state. */
interface Tokens {
  previous: string;
  before: string;
  /** The two before `before`: a {@link CALLS} call is `vi . mock (`, and `x . vi . mock (` is not one. */
  third: string;
  fourth: string;
  /** The one before `fourth`: R3's `argv . use . map (` is five tokens. */
  fifth: string;
  /** A {@link CALLS} name is behind the cursor, so a `(` next opens it. */
  ready: Call | undefined;
  /** The token just pushed is the `(` of a {@link CALLS} call, so a quoted literal next is its specifier. */
  opened: Call | undefined;
  /** How deep the cursor is in a {@link CALLS} call's type arguments, and whose they are. */
  angle: number;
  generic: Call | undefined;
  /** The two behind us were `import (` or `require (`, and what follows decides A4. */
  pending: boolean;
  /** Lines where a call was opened and what followed was not a string literal, nor one of R1–R3's shapes. */
  nonLiteral: number[];
  /** The tokens inside an `import (` or `require (` whose argument is not a literal, up to its own `)`. */
  computed: { line: number; depth: number; seq: string[] } | undefined;
  /** R3 — where the cursor is in a callback passed to `argv . x . map (`, before its first parameter. */
  callback: Callback | undefined;
  /** R3 — every name bound as the first parameter of such a callback, file-wide. */
  elements: Set<string>;
  dynamic: Omit<Dynamic, 'file'>[];
  /**
   * The tokens since the last `import` or `export` keyword — the clause of the statement in
   * progress — or `undefined` once there is none. A clause never holds `(` or `=`, and the
   * token after its `from` is the specifier, so either closes it: `export function f(…)`
   * does not drag its body along.
   */
  clause: string[] | undefined;
}

/** migrate-dynamic-specifiers R2, R3 — the names a parsed argv object goes by. A new one joins when a measured project needs it. */
const ARGV = ['argv', 'args', 'options', 'opts', 'flags'];

/**
 * R1 — `path.join(` or `path.resolve(`, from `process.cwd()` or `__dirname`, then quoted literals
 * only: a file under the working directory or the module's own, never a package. Matched against
 * the call's tokens joined by a space; `'` is {@link QUOTED}.
 */
const CWD_PATH = /^path \. (?:join|resolve) \( (?:process \. cwd \( \)|__dirname)(?: , ')* \)$/;

/** R2 — the whole argument is `argv . x`: the user's own module, named on the command line. */
const ARGV_MEMBER = new RegExp(`^(?:${ARGV.join('|')}) \\. [\\w$]+$`);

/** R3 — the array methods whose callback receives an argv array's elements. */
const ELEMENT_METHODS = ['map', 'forEach', 'flatMap', 'filter'];

/**
 * R3 — where the cursor is between `argv . x . map (` and the callback's first parameter:
 * `p =>`, `(p) =>`, `async (p) =>`, `function (p)` and `async function (p)`. Keyed by state and
 * token. `fn` binds nothing until its `(`, because `function name (p)` names the function.
 */
type Callback = 'open' | 'async' | 'fn' | 'paren';
const CALLBACK = new Map<string, Callback>([
  ['open async', 'async'],
  ['open (', 'paren'],
  ['open function', 'fn'],
  ['async (', 'paren'],
  ['async function', 'fn'],
  ['fn (', 'paren'],
]);
/** The states a name binds in: not `fn`, whose next name is the function's own. */
const BINDS: readonly string[] = ['open', 'async', 'paren'];

/** The shape of a computed specifier's tokens, or `undefined` for one that could name anything (R5). */
function shapeOf(seq: readonly string[], elements: ReadonlySet<string>): DynamicShape | undefined {
  const text = seq.join(' ');
  if (CWD_PATH.test(text)) return 'cwd-path';
  if (ARGV_MEMBER.test(text)) return 'argv-member';
  // A single name is its own text; any longer sequence has a space in it, which no name has.
  return elements.has(text) ? 'argv-element' : undefined;
}

/**
 * A4, and R1–R3 — a call opened as `import (` or `require (` whose next token is not a literal
 * is captured to its own `)`, then read as one of the three shapes or refused. A second one opened
 * inside it is refused outright, and so is the outer one, since a call is no shape's argument.
 */
function capture(tokens: Tokens, text: string, line: number): void {
  if (tokens.pending && text !== QUOTED && text !== ')') {
    if (tokens.computed === undefined) tokens.computed = { line, depth: 1, seq: [] };
    else tokens.nonLiteral.push(line);
  }
  const open = tokens.computed;
  if (open === undefined) return;
  if (text === '(') open.depth += 1;
  if (text === ')') open.depth -= 1;
  if (open.depth > 0) {
    open.seq.push(text);
    return;
  }
  tokens.computed = undefined;
  const shape = shapeOf(open.seq, tokens.elements);
  if (shape === undefined) tokens.nonLiteral.push(open.line);
  else tokens.dynamic.push({ line: open.line, shape });
}

/** R3 — one step of the walk from `argv . x . map (` to its callback's first parameter, binding it when it is reached. */
function walk(tokens: Tokens, state: Callback, text: string): void {
  tokens.callback = CALLBACK.get(`${state} ${text}`);
  if (tokens.callback === undefined && BINDS.includes(state) && WORD.test(text)) tokens.elements.add(text);
}

/** R3 — the `(` just arriving opens `argv . x . map (`, so a callback may follow. */
function opensACallback(tokens: Tokens): boolean {
  return ELEMENT_METHODS.includes(tokens.previous) && tokens.before === '.' && tokens.fourth === '.' && ARGV.includes(tokens.fifth);
}

/**
 * Record one code token.
 *
 * A4's refusal is decided here rather than at each call site: if a call was opened and the
 * thing inside it is not a string literal, the specifier is not one this scan can read, and
 * the file it is in will be left alone.
 */
function push(tokens: Tokens, text: string, line: number): void {
  // Stryker disable next-line ConditionalExpression: A10 — the call is the per-token cost; `capture` makes the same no-op decision itself
  if (tokens.pending || tokens.computed !== undefined) capture(tokens, text, line);
  // Stryker disable next-line ConditionalExpression: A10 — with no walk in progress, a step matches no key and binds nothing; the test is the per-token cost
  if (tokens.callback !== undefined) walk(tokens, tokens.callback, text);
  if (text === '(' && opensACallback(tokens)) tokens.callback = 'open';
  tokens.pending = text === '(' && (tokens.previous === 'import' || tokens.previous === 'require');
  trackCall(tokens, text);
  if (text === 'import' || text === 'export') tokens.clause = [];
  else if (text === '(' || text === '=' || tokens.previous === 'from') tokens.clause = undefined;
  else tokens.clause?.push(text);
  tokens.fifth = tokens.fourth;
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
  const { sites, tokens } = pass(source);
  // A call the file never closes could hold anything.
  if (tokens.computed !== undefined) tokens.nonLiteral.push(tokens.computed.line);
  const { nonLiteral, dynamic } = tokens;
  // Stryker disable next-line ConditionalExpression,EqualityOperator,ArithmeticOperator: A10 — the second pass over a file with no computed specifier reads names nothing uses
  const named = nonLiteral.length + dynamic.length === 0 ? [] : namedOutsideASpecifier(source);
  return { sites, nonLiteral, dynamic, named };
}

/** One pass of {@link scan}. `literal`, when given, is handed the bounds of every string and template that is not a specifier. */
function pass(source: string, literal?: (start: number, end: number) => void): { sites: Site[]; tokens: Tokens } {
  const sites: Site[] = [];
  // Stryker disable next-line StringLiteral: the five slots start empty; no check matches '' or any other non-token, so the first tokens read the same from any start
  const tokens: Tokens = { previous: '', before: '', third: '', fourth: '', fifth: '', ready: undefined, opened: undefined, angle: 0, generic: undefined, pending: false, nonLiteral: [], computed: undefined, callback: undefined, elements: new Set(), dynamic: [], clause: undefined };
  lex(source, (text, line, start, end) => {
    if (text === QUOTED && isSpecifier(tokens)) sites.push(siteOf(source, { open: start, close: end, line }, tokens));
    else if (text === QUOTED || text === 'lit') literal?.(start, end);
    push(tokens, text, line);
  });
  return { sites, tokens };
}

/** R4 — the incumbents named outside a specifier, in a second pass, run only over a file with a computed specifier (A10). */
function namedOutsideASpecifier(source: string): string[] {
  const named = new Set<string>();
  pass(source, (start, end) => {
    for (const host of hostsIn(source.slice(start, end))) named.add(host);
  });
  return [...named];
}

const HOST_NAMES = new Set(HOSTS);

/**
 * R4 — the incumbents a literal's text, quotes included, names: a piece of it that equals one, or
 * two consecutive pieces that equal a scoped one. It is cut at path separators, quotes and a
 * template's `$` and `}`, so `node_modules/chalk`, `C:\\deps\\chalk` and `` `${dir}/chalk` ``
 * name chalk, and `chalk-template` names nothing.
 */
function hostsIn(raw: string): string[] {
  const parts = raw.split(/[\\/'"`$}]/);
  return parts.flatMap((part, i) => [part, `${part}/${parts[i + 1]}`]).filter((name) => HOST_NAMES.has(name));
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
  /** On a relevant file: its computed specifiers read as loading no incumbent (migrate-dynamic-specifiers R6). */
  dynamic?: Omit<Dynamic, 'file'>[];
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
    if (name !== undefined && name !== 'default' && WORD.test(name)) names.push(name);
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

/** No specifier written to an older major's own entry: every one goes where `MAPPING` says. */
const CURRENT: ReadonlyMap<string, string> = new Map();

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
  return rewriteFile(source, skip, transitive, CURRENT).rewrite;
}

/**
 * {@link rewriteSource}, and every incumbent the file names in a specifier position, skipped or
 * not — what `detected.imported` and `undeclared` read. `entries` names the specifiers that move
 * to an older major's own entry instead of `MAPPING`'s (`previous-majors` R6).
 */
function rewriteFile(source: string, skip: ReadonlySet<string>, transitive: ReadonlyMap<string, readonly string[]>, entries: ReadonlyMap<string, string>): { rewrite: Rewrite; specifiers: string[] } {
  // Stryker disable next-line ConditionalExpression,ArrayDeclaration: A10 — `migrate()` reads only files the pre-filter admitted, so this returns early only for `rewriteSource`, which reads no `specifiers`
  if (!mentionsAHost(source)) return { rewrite: { source, mapped: [], refused: [], kept: [], relevant: false }, specifiers: [] };
  const scanned = scan(source);
  const { sites } = scanned;
  // R4 — an incumbent this run moves, named in a string beside a computed specifier, could be what
  // it loads: every computed specifier in the file is refused, and the file holds that incumbent
  // too, whether or not it imports it. One the run does not move cannot split, so it guards nothing.
  const loadable = scanned.named.filter((host) => !skip.has(host));
  const guarded = loadable.length > 0;
  const nonLiteral = guarded ? [...scanned.nonLiteral, ...scanned.dynamic.map((d) => d.line)] : scanned.nonLiteral;
  const dynamic = guarded ? [] : scanned.dynamic;
  const named = sites.filter((s) => MAPPING[s.specifier] !== undefined || isDeep(s.specifier));
  const specifiers = [...new Set(named.map((s) => s.specifier))];
  const hits = named.filter((s) => !skip.has(packageOf(s.specifier)));
  if (hits.length === 0 && !guarded) return { rewrite: { source, mapped: [], refused: [], kept: [], relevant: false }, specifiers };

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
  if (refused.length > 0) return { rewrite: { source, mapped: [], refused, kept: [], relevant: true, dynamic, retained: [...new Set([...hits.map((s) => packageOf(s.specifier)), ...loadable])] }, specifiers };

  let out = source;
  const mapped: { from: string; to: string }[] = [];
  for (const site of moving.sort((a, b) => b.start - a.start)) {
    const to = entries.get(site.specifier) ?? (MAPPING[site.specifier] as string);
    out = `${out.slice(0, site.start)}${to}${out.slice(site.end)}`;
    mapped.push({ from: site.specifier, to });
  }
  return { rewrite: { source: out, mapped: mapped.reverse(), refused: [], kept, relevant: true, dynamic }, specifiers };
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

/**
 * migrate-older-majors R1 — the files `package.json`'s `bin` names that {@link sourceFiles} did not
 * find: qrcode's crash is in `bin/qrcode`, which has no extension. A path outside the project,
 * missing, under a generated tree, or with an extension that is not source (`cli.sh`) is not read.
 */
function binsOf(dir: string, bin: unknown, found: readonly string[]): string[] {
  const named = typeof bin === 'string' ? [bin] : Object.values(bin ?? {});
  const paths = named.filter((p) => typeof p === 'string').map((p) => posix.normalize(p.replaceAll('\\', '/')));
  return [
    ...new Set(
      paths.filter((path) => {
        const extension = posix.extname(path);
        return (
          !path.startsWith('/') &&
          !path.startsWith('../') &&
          !path.split('/').some((part) => SKIP.has(part)) &&
          (extension === '' || SOURCE_EXTENSIONS.has(extension)) &&
          !found.includes(path) &&
          statSync(join(dir, path), { throwIfNoEntry: false })?.isFile() === true
        );
      }),
    ),
  ];
}

/** The four fields a manifest declares a dependency in. U12-3 counts every one: a peer or an optional dependency is as much the project's choice as a dependency is. */
const DECLARING = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'] as const;

type Manifest = ProjectManifest & Partial<Record<(typeof DECLARING)[number], Record<string, string>>> & { bin?: unknown };

/** The manifest at `path`, or an empty one when there is none to read. */
async function manifestAt(path: string): Promise<Manifest> {
  try {
    return (JSON.parse(await readFile(path, 'utf8')) as Manifest | null) ?? {};
  } catch {
    return {};
  }
}

/** Every dependency a manifest declares, with its range — for the project, one of A1's two independent sources. */
function declaredBy(raw: Manifest): Map<string, string> {
  return new Map(DECLARING.flatMap((field) => Object.entries(raw[field] ?? {})));
}

/** Every dependency the manifest at `path` declares, with its range; empty when there is none to read. */
async function declaredIn(path: string): Promise<Map<string, string>> {
  return declaredBy(await manifestAt(path));
}

/** migrate-preflight R5 — the root jest configs jest itself looks for, by name. */
const JEST_CONFIGS = ['js', 'cjs', 'mjs', 'ts', 'json'].map((ext) => `jest.config.${ext}`);

/** The text of each root jest config that exists. */
async function jestConfigsIn(dir: string): Promise<string[]> {
  const texts = await Promise.all(JEST_CONFIGS.map(async (file) => await readFile(join(dir, file), 'utf8').catch(() => undefined)));
  return texts.filter((text) => text !== undefined);
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
 *
 * `entries` is the other half (`previous-majors` R6): each specifier of an incumbent on a
 * claimed older major that has its own entry, with that entry — `commander` on 14 is
 * `burgee/commander/v14`. The major is read from the project, never from the drop-in at runtime.
 */
/** An off-major row before the scan: `withSites` adds what the files say. */
type Found = Omit<OffMajor, 'sites' | 'move'>;

async function majorsOf(dir: string, dependencies: Map<string, string>): Promise<{ offMajor: Found[]; entries: Map<string, string>; majors: Map<string, number> }> {
  const found = await Promise.all(HOSTS.map(async (from) => ({ from, found: (await installedVersion(dir, from)) ?? dependencies.get(from) })));
  const entries = new Map<string, string>();
  const majors = new Map<string, number>();
  const offMajor = found.flatMap(({ from, found: version }) => {
    const graded = GRADED_VERSIONS[from];
    if (version === undefined || graded === undefined) return [];
    const major = majorOf(version);
    if (major === undefined) return [];
    // A graded host always has its majors: `supported-majors-lock.test.ts` holds one list per graded host.
    const claimed = SUPPORTED_MAJORS[from] as readonly number[];
    if (!claimed.includes(major)) return [{ from, found: version, graded, nearest: nearestOf(major, claimed) ?? null }];
    if (GRADED_MAJORS[`${HOST_OF.get(from) as string}-${major}`] !== undefined) majors.set(from, major);
    for (const specifier of Object.keys(MAPPING).filter((s) => packageOf(s) === from)) {
      const entry = PREVIOUS_MAJOR_ENTRIES[specifier]?.[major];
      if (entry !== undefined) entries.set(specifier, entry);
    }
    return [];
  });
  return { offMajor, entries, majors };
}

/** migrate-older-majors — what `removedSites` reads, once per run. */
interface Older {
  /** Each off-major incumbent with a table (`REMOVED_APIS`), and the major found. */
  found: Map<MajorHost, number>;
  /** The highest major claimed: a removal after it is no claimed major's concern. */
  claimed: Record<MajorHost, number>;
  /** What the façade exports: a member it exports is valid on every claimed major. */
  exports: Record<MajorHost, readonly string[]>;
}

/** One value per incumbent with a table. */
function perHost<T>(of: (host: MajorHost) => T): Record<MajorHost, T> {
  return { commander: of('commander'), yargs: of('yargs') };
}

function olderOf(offMajor: readonly Found[]): Older {
  const found = new Map<MajorHost, number>();
  for (const o of offMajor) if (isMajorHost(o.from)) found.set(o.from, majorOf(o.found) as number);
  return {
    found,
    claimed: perHost((host) => Math.max(...(SUPPORTED_MAJORS[host] as readonly number[]))),
    exports: perHost((host) => FACADE_EXPORTS[MAPPING[host] as string] as readonly string[]),
  };
}

/**
 * migrate-older-majors — an off-major row with its sites, and the move to its nearest claimed major
 * when {@link moveOf} lets one through: each specifier the project imports, with the entry it
 * takes at that major (`previous-majors` R6's, or `MAPPING`'s). A deep import has no entry.
 */
function withSites(row: Found, older: Older, scanned: readonly Scanned[]): OffMajor {
  // An incumbent with no table has no found major here, so no nearest major above it and no move.
  const found = older.found.get(row.from as MajorHost) as number;
  const sites = scanned.flatMap(({ file, removed }) => removed.filter((site) => hostOfApi(site.api) === row.from).map((site) => ({ file, ...site })));
  const imports = [...new Set(scanned.flatMap(({ specifiers }) => specifiers.filter((specifier) => packageOf(specifier) === row.from)))].sort();
  const to = moveOf(found, SUPPORTED_MAJORS[row.from] as readonly number[], sites, imports.some((specifier) => MAPPING[specifier] === undefined));
  const move = to === undefined || imports.length === 0 ? null : Object.fromEntries(imports.map((specifier) => [specifier, PREVIOUS_MAJOR_ENTRIES[specifier]?.[to] ?? (MAPPING[specifier] as string)]));
  return { ...row, sites, move };
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
function installer(dir: string): { add: string; remove: string; exact: string } {
  const has = (file: string): boolean => existsSync(join(dir, file));
  if (has('pnpm-lock.yaml')) return { add: 'pnpm add', remove: 'pnpm remove', exact: '--save-exact' };
  if (has('yarn.lock')) return { add: 'yarn add', remove: 'yarn remove', exact: '--exact' };
  if (has('bun.lockb') || has('bun.lock')) return { add: 'bun add', remove: 'bun remove', exact: '--exact' };
  return { add: 'npm install', remove: 'npm uninstall', exact: '--save-exact' };
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
    const built = JSON.parse(await readFile(join(here, 'family-versions.json'), 'utf8')) as { versions?: Record<string, string> } & Record<string, string>;
    // `{ versions, since }` since migrate-pins-carry-the-drop-in; a flat map before it.
    return built.versions ?? built;
  } catch {
    const found = await Promise.all(FAMILY.map(async (name) => [name, (await readFile(join(here, '..', '..', name, 'package.json'), 'utf8').catch(() => '{}')) as string] as const));
    return Object.fromEntries(found.flatMap(([name, raw]) => {
      const { version } = JSON.parse(raw) as { version?: string };
      return version === undefined ? [] : [[name, version]];
    }));
  }
}

/** For each family package, the version from which every release of its graded major exports each subpath: `{ roundel: { './picocolors': '1.1.0' } }`. */
export type SubpathFloors = Readonly<Record<string, Readonly<Record<string, string>>>>;

/**
 * migrate-pins-carry-the-drop-in — the `since` half of `family-versions.json`.
 *
 * The build reads it from this repository's release tags (`scripts/family-versions.mjs`): for
 * each subpath, the oldest version of the current major from which every tagged release exports
 * it. Run from source there is no such file and no history to read at run time, so there are no
 * floors, which is what this printed before; the published package always carries the file.
 */
export async function subpathFloors(here: string = dirname(fileURLToPath(import.meta.url))): Promise<SubpathFloors> {
  try {
    return (JSON.parse(await readFile(join(here, 'family-versions.json'), 'utf8')) as { since?: SubpathFloors }).since ?? {};
  } catch {
    return {};
  }
}

/**
 * The lowest version of each package that exports every subpath the rewrite imports, and the
 * specifiers that set it: `roundel/picocolors` → `{ roundel: { version: '1.1.0', specifiers: [...] } }`.
 *
 * A package the table names but whose subpath it does not — a pattern export, or a subpath newer
 * than the table — floors at the graded version: nothing older is known to carry it. A package
 * the table does not name at all has no floor.
 */
function floorsOf(specifiers: readonly string[], since: SubpathFloors, graded: Readonly<Record<string, string>>): Map<string, { version: string; specifiers: string[] }> {
  const floors = new Map<string, { version: string; specifiers: string[] }>();
  for (const specifier of specifiers) {
    const name = packageOf(specifier);
    const table = since[name];
    const at = graded[name];
    if (table === undefined || at === undefined) continue;
    const version = table[`.${specifier.slice(name.length)}`] ?? at;
    const floor = floors.get(name);
    if (floor === undefined || byVersion(version, floor.version) > 0) floors.set(name, { version, specifiers: [specifier] });
    else if (byVersion(version, floor.version) === 0) floor.specifiers.push(specifier);
  }
  return floors;
}

/** A version with no range around it: `1.2.3`, or a prerelease of one. What `--save-exact` writes. */
const EXACT = /^\d+\.\d+\.\d+(?:-[\w.-]+)?$/;

/**
 * How one range is written: `''` exact, `'~'` around an exact version, `undefined` for anything
 * else (`^1.2.3`, `>=18`, `*`, a tag). A caret is not told apart: `next` writes one by default.
 */
function styleOf(range: string): '' | '~' | undefined {
  if (EXACT.test(range)) return '';
  return range.startsWith('~') && EXACT.test(range.slice(1)) ? '~' : undefined;
}

/**
 * B-20261027-migrate-pins-match-exact-convention — how the family packages `next` adds are
 * written, in the project's own convention rather than burgee's. Exact when every runtime
 * dependency the manifest declares is exact (concurrently pins all six, the incumbent among them,
 * and `^1.7.2` was the one caret in its manifest); otherwise the style every incumbent the run
 * moves shares, `~` or exact; otherwise the caret U12-2 chose.
 */
function pinStyle(runtime: Readonly<Record<string, string>>, incumbents: readonly string[]): '' | '~' | '^' {
  const ranges = Object.values(runtime);
  if (ranges.length > 0 && ranges.every((range) => styleOf(range) === '')) return '';
  const styles = new Set(incumbents.map(styleOf));
  const [only] = styles;
  return styles.size === 1 && only !== undefined ? only : '^';
}

/**
 * `npm install roundel@^1.0.0 flagstaff@^1.2.1 && npm uninstall chalk ora`, or the half that applies.
 *
 * Pinned since U12-2. Unpinned, `pnpm add burgee flagstaff roundel` under mac-cleaner's
 * `minimumReleaseAge` resolved roundel 0.6.2, flagstaff 1.0.3 and burgee 0.15.0 and saved them,
 * and none of the three carries the drop-in the report had just graded. A caret at the version
 * the graded drop-in shipped in installs that version or a compatible later one, and fails
 * loudly rather than settling for an older one. A peer that is not ours (`react-reconciler`)
 * is not pinned: its version is the project's business. In a project that pins exactly, the pin
 * is exact, with the installer's own flag, since `npm install burgee@1.7.2` alone saves `^1.7.2`.
 */
function nextStep(dir: string, add: string[], remove: string[], { versions, style }: { versions: Readonly<Record<string, string>>; style: '' | '~' | '^' }): string {
  const pm = installer(dir);
  const pinned = add.map((name) => (versions[name] === undefined ? name : `${name}@${style}${versions[name]}`));
  const adder = style === '' ? `${pm.add} ${pm.exact}` : pm.add;
  const steps = [pinned.length > 0 ? `${adder} ${pinned.join(' ')}` : '', remove.length > 0 ? `${pm.remove} ${remove.join(' ')}` : ''];
  return steps.filter((c) => c !== '').join(' && ');
}

/** The settings that refuse a version younger than a number of minutes, by file, and how each is spelled there. */
const RELEASE_AGE: readonly { file: string; key: string; exclude: string; separator: ':' | '=' }[] = [
  { file: 'pnpm-workspace.yaml', key: 'minimumReleaseAge', exclude: 'minimumReleaseAgeExclude', separator: ':' },
  { file: '.npmrc', key: 'minimum-release-age', exclude: 'minimum-release-age-exclude[]', separator: '=' },
  { file: 'npmrc', key: 'minimum-release-age', exclude: 'minimum-release-age-exclude[]', separator: '=' },
];

type Setting = Omit<ReleaseAge, 'pins' | 'note'> & { key: string };

/**
 * U12-2 — the project's minimum release age, when it sets one, and what it exempts.
 *
 * Read as lines, not parsed: the key is a top-level scalar in both formats, so a line that
 * starts with it is the setting and anything indented or commented out is not. A setting is
 * the reason a pinned install can still fail, so the report names the file it came from.
 */
async function releaseAgeOf(dir: string): Promise<Setting | null> {
  for (const { file, key, exclude, separator } of RELEASE_AGE) {
    // eslint-disable-next-line reliability/no-await-in-loop -- three small files, in the order a reader would look, and the first one that answers wins
    const text = await readFile(join(dir, file), 'utf8').catch(() => '');
    const lines = text.split('\n');
    for (const line of lines) {
      if (!line.startsWith(key)) continue;
      const [name, value = ''] = line.split(separator);
      // A comment after a YAML value (`1440 # a day`) is not part of it.
      const digits = /^\d+/.exec(value.trim())?.[0];
      if (name?.trim() !== key || digits === undefined) continue;
      return { file, key, minutes: Number(digits), exclude: excludeOf(lines, exclude, separator) };
    }
  }
  return null;
}

/** One list entry with its comment and quotes taken off: `"roundel@1.0.4" # docs only` is `roundel@1.0.4`. */
function unquote(entry: string): string {
  const bare = (entry.split('#')[0] as string).trim();
  return bare.length > 1 && (bare[0] === '"' || bare[0] === "'") && bare.endsWith(bare[0]) ? bare.slice(1, -1) : bare;
}

/**
 * The release-age exemptions, as written: a YAML block list or flow list under the key, or
 * `key[]=name` lines in an npmrc. An entry is a package name, a glob, or `name@1.0.0 || 1.0.1`.
 */
function excludeOf(lines: readonly string[], key: string, separator: ':' | '='): string[] {
  if (separator === '=') return lines.filter((l) => l.startsWith(`${key}=`)).map((l) => unquote(l.slice(key.length + 1)));
  const at = lines.findIndex((l) => l.startsWith(`${key}:`));
  if (at === -1) return [];
  const flow = /\[(.*)\]/.exec(lines[at] as string)?.[1];
  if (flow !== undefined) return flow.split(',').map(unquote).filter((e) => e !== '');
  const out: string[] = [];
  for (const line of lines.slice(at + 1)) {
    const item = /^\s+-(.*)$/.exec(line)?.[1];
    if (item !== undefined && unquote(item) !== '') out.push(unquote(item));
    else if (line.trim() !== '' && !line.trimStart().startsWith('#')) break;
  }
  return out;
}

/** pnpm's exclude glob: `*` is any run of characters, everything else is literal. Matched by hand, so no pattern is built at runtime. */
function globMatches(pattern: string, name: string): boolean {
  const parts = pattern.split('*');
  const first = parts[0] as string;
  const last = parts.at(-1) as string;
  if (parts.length === 1) return pattern === name;
  if (!name.startsWith(first) || !name.endsWith(last) || name.length < first.length + last.length) return false;
  let at = first.length;
  for (const part of parts.slice(1, -1)) {
    at = name.indexOf(part, at);
    if (at === -1 || at + part.length > name.length - last.length) return false;
    at += part.length;
  }
  return true;
}

/** The versions of `name` an exemption covers: every one (`'*'`), the listed ones, or none. */
function exempted(name: string, exclude: readonly string[]): '*' | Set<string> {
  const versions = new Set<string>();
  for (const entry of exclude) {
    const at = entry.lastIndexOf('@');
    const pattern = at > 0 ? entry.slice(0, at) : entry;
    if (!globMatches(pattern, name)) continue;
    if (at <= 0) return '*';
    for (const v of entry.slice(at + 1).split('||')) versions.add(v.trim());
  }
  return versions;
}

/** The publish time of every version of `name`, from the registry's packument; `undefined` when it cannot be read. */
export type PublishTimes = (name: string) => Promise<Record<string, string> | undefined>;

/**
 * The public registry's `time` field. Five seconds and no retry: an unreachable registry only
 * costs the floor, and `next` falls back to the graded pins with the note that says why.
 */
// ponytail: npmjs.org only; read `registry=` from the project's npmrc when a mirror user needs it.
const REGISTRY_TIMEOUT_MS = 5000;
const MINUTE_MS = 60_000;

const registryTimes: PublishTimes = async (name) => {
  try {
    const response = await fetch(`https://registry.npmjs.org/${encodeURIComponent(name)}`, { signal: AbortSignal.timeout(REGISTRY_TIMEOUT_MS) });
    return response.ok ? ((await response.json()) as { time?: Record<string, string> }).time : undefined;
  } catch {
    return undefined;
  }
};

/** Newest first within one major: `pinsUnder` only ever compares versions of the graded major. */
const byVersion = (a: string, b: string): number => {
  const [x, y] = [a, b].map((v) => v.split('.').map(Number)) as [number[], number[]];
  return (x[1] as number) - (y[1] as number) || (x[2] as number) - (y[2] as number);
};

/**
 * U12-2 — under a release age, the version each family package can actually install.
 *
 * mcpc sets `minimumReleaseAge: 4320`. roundel 1.0.3 and 1.0.4 and flagstaff 1.2.4 and 1.2.5
 * were docs-only patches, and each restarted the three-day clock, so `roundel@^1.0.4` never
 * installed while the family kept shipping. The floor is the newest release of the graded
 * major whose publish time is that old: pnpm resolves a caret to the newest version old
 * enough, which is then that one. Never a lower major — `^0.6.2` is the release without the
 * drop-in that the unpinned command saved on mac-cleaner. No version old enough yet: the one
 * that becomes old enough first, with the date it does. Exempt by `minimumReleaseAgeExclude`,
 * or a registry that does not answer: the graded pin, unchanged.
 */
async function pinsUnder(
  age: Setting,
  add: readonly string[],
  graded: Readonly<Record<string, string>>,
  clock: { times: PublishTimes; now: Date; floors: ReadonlyMap<string, { version: string; specifiers: string[] }> },
): Promise<{ pins: ReleaseAgePin[]; unread: string[] }> {
  const { times, now, floors } = clock;
  const wanted = add.filter((name) => graded[name] !== undefined && exempted(name, age.exclude) !== '*');
  const found = await Promise.all(
    wanted.map(async (name) => {
      const version = graded[name] as string;
      const listed = await times(name);
      if (listed === undefined) return { name, version, pin: undefined };
      const exempt = exempted(name, age.exclude) as Set<string>;
      const major = version.split('.')[0];
      const ofMajor = Object.entries(listed)
        .filter(([v]) => /^\d+\.\d+\.\d+$/.test(v) && v.split('.')[0] === major)
        .map(([v, at]) => ({ version: v, installable: exempt.has(v) ? Date.parse(at) : Date.parse(at) + age.minutes * MINUTE_MS }))
        .filter((c) => !Number.isNaN(c.installable));
      // migrate-pins-carry-the-drop-in: a release older than the first one that exports every
      // subpath the rewrite imports cannot be the floor, however old it is (svgo, roundel 1.0.4).
      const floor = floors.get(name);
      const candidates = floor === undefined ? ofMajor : ofMajor.filter((c) => byVersion(c.version, floor.version) >= 0);
      const ready = candidates.filter((c) => c.installable <= now.getTime()).sort((a, b) => byVersion(b.version, a.version))[0];
      const soonest = candidates.sort((a, b) => a.installable - b.installable)[0];
      const chosen = ready ?? soonest;
      const requires = floor !== undefined && candidates.length < ofMajor.length ? { requires: { specifiers: floor.specifiers, since: floor.version } } : {};
      return { name, version, pin: chosen === undefined ? undefined : { name, version: chosen.version, graded: version, installable: new Date(chosen.installable).toISOString(), ...requires } };
    }),
  );
  return {
    pins: found.flatMap(({ pin }) => (pin === undefined || (pin.version === pin.graded && Date.parse(pin.installable) <= now.getTime()) ? [] : [pin])),
    unread: found.filter(({ pin }) => pin === undefined).map(({ name }) => name),
  };
}

/** The `releaseAge` the report carries: the setting, the pins it forced, and one note that says what `next` will do. */
function releaseAgeNote(age: Setting, { pins, unread }: { pins: readonly ReleaseAgePin[]; unread: readonly string[] }, now: Date, style: string): ReleaseAge {
  const lines = pins.map((p) => {
    // migrate-pins-carry-the-drop-in: when an older release was old enough but lacks a subpath, the note says which one.
    const carrying = p.requires === undefined ? '' : ` that exports ${p.requires.specifiers.join(', ')} (first in ${p.requires.since})`;
    const major = p.version.slice(0, p.version.indexOf('.'));
    return Date.parse(p.installable) <= now.getTime()
      ? `${p.name} ${p.graded} is younger than that, so next pins ${style}${p.version}, the newest ${p.name} ${major}.x${carrying} old enough; run your tests on it`
      : `no ${p.name} ${major}.x${carrying} is old enough until ${p.installable.replace('T', ' ').replace(/:\d\d\.\d+Z$/, '')} UTC, when ${p.version} is: the install fails before then, or exempt ${p.name} from the rule`;
  });
  if (lines.length === 0 && unread.length === 0) lines.push('every family version in next is older than that');
  if (unread.length > 0) lines.push(`the registry did not say when ${unread.join(', ')} ${unread.length === 1 ? 'was' : 'were'} published, so next pins the graded version, which may be younger than that`);
  const { file, key, minutes, exclude } = age;
  return {
    file,
    minutes,
    exclude,
    pins: [...pins],
    note: [`${file} sets ${key} to ${minutes} minutes`, ...lines].join('; '),
  };
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
  /**
   * migrate-preflight R7 — the entries, as `git status --porcelain` prints them. @swc/cli's install
   * wrote an untracked `node-compile-cache/`, and the refusal said only how many changes there were.
   */
  readonly hint: string;
  /** An untracked-only tree is ignored or committed; anything tracked, committed or stashed. */
  readonly fix: string;
  constructor(readonly entries: string[]) {
    super(`the git tree has ${counted(entries.length, 'uncommitted change')}`);
    this.name = 'DirtyTreeError';
    this.hint = listed(entries);
    this.fix = entries.every(isUntracked) ? `add ${pathsOf(entries)} to .gitignore or commit them, or pass --force` : 'commit or stash your changes, or pass --force';
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
  /** Injected by the tests; the public registry otherwise. Read only when the project sets a release age. */
  registry?: PublishTimes;
  /** Injected by the tests; the clock otherwise. */
  now?: Date;
  /** Injected by the tests; the `since` table the build wrote beside this module otherwise. */
  since?: SubpathFloors;
}

/**
 * A6 — the tree is clean, or `--force` or `--dry-run` says to go on anyway, or this throws. What it
 * returns is the untracked entries `--force` let through, for the record (migrate-preflight R7).
 */
async function checkTree(options: MigrateOptions): Promise<string[]> {
  const { dir, dryRun = false, force = false } = options;
  const entries = (await (options.status ?? workingTree)(dir)) ?? [];
  if (!dryRun && !force && entries.length > 0) throw new DirtyTreeError(entries);
  return force ? entries.filter(isUntracked) : [];
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
  /** Every incumbent specifier it names, deep ones included: what an off-major move would have to serve. */
  specifiers: string[];
  guided: GuidedSite[];
  /** migrate-older-majors — its lines that use an API an off-major incumbent's claimed majors removed. */
  removed: RemovedSite[];
  text?: string;
}

/** What every file of one run is rewritten under: the incumbents left alone, those another dependency installs, and the older majors' own entries. */
interface Plan {
  skip: ReadonlySet<string>;
  transitive: ReadonlyMap<string, readonly string[]>;
  entries: ReadonlyMap<string, string>;
  /** migrate-older-majors — the off-major incumbents with a table, and what their sites are read against. */
  older: Older;
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
async function scanBatch(dir: string, batch: string[], { skip, transitive, entries, older }: Plan): Promise<Scanned[]> {
  // Read as bytes and decode only what the pre-filter admits: on the bench tree a third of
  // the files never become a string at all, which is 405 ms against 427 for the same work.
  const sources = await Promise.all(batch.map(async (file) => await readFile(join(dir, file))));
  return sources.map((bytes, i) => {
    const text = mentionsAHost(bytes) ? bytes.toString('utf8') : undefined;
    const { rewrite, specifiers } = text === undefined ? { rewrite: EMPTY, specifiers: [] } : rewriteFile(text, skip, transitive, entries);
    const seen = [...new Set(specifiers.map(packageOf))];
    const guided = mentionsAGuided(bytes) ? guidedSites(tokensOf(bytes.toString('utf8'))) : [];
    // A10: the second token pass runs only over a file that imports an off-major incumbent with a table.
    const found = new Map([...older.found].filter(([host]) => seen.includes(host)));
    const removed = found.size === 0 ? [] : removedSites(tokensOf(text as string), found, older.claimed, older.exports);
    // Stryker disable next-line ConditionalExpression: keeping an unrelated file's text changes no result, only memory (A10); a relevant file always has its text
    return { file: batch[i] as string, result: rewrite, seen, specifiers, guided, removed, ...(rewrite.relevant ? { text: text as string } : {}) };
  });
}

/** The per-mapping rollup, in the order `MAPPING` declares — so two runs print the same table. Its `to` is what was written, an older major's entry included. */
function rollup(all: { from: string; to: string; file: string }[]): Mapped[] {
  return Object.keys(MAPPING).flatMap((from) => {
    const hits = all.filter((m) => m.from === from);
    const [first] = hits;
    return first === undefined ? [] : [{ from, to: first.to, imports: hits.length, files: new Set(hits.map((m) => m.file)).size }];
  });
}

/**
 * A7 — the compat figures come from `compat.ts`, which `compat-baseline-lock.test.ts`
 * holds equal to `compat-oracle/baseline/<host>.json`. A number typed into a report
 * template is a number that goes stale silently, and this repository has published four
 * of those and caught them all late.
 */
function gradedFor(packages: readonly string[], majors: ReadonlyMap<string, number>): (Row & { host: string; major?: number })[] {
  const rows = new Map<string, Row & { host: string; major?: number }>();
  for (const p of packages) {
    // Every incumbent has a host and every host a grade: `migrate-drop-ins-lock.test.ts` and
    // `compat-baseline-lock.test.ts` hold both, so neither lookup can miss.
    const host = HOST_OF.get(p) as string;
    const major = majors.get(p);
    // The first package of a host decides its row: `yargs` on 17 is graded as 17 even when a
    // `yargs-parser` the project also declares sorts after it on no claimed older major.
    if (rows.has(host)) continue;
    // previous-majors: a program on a claimed older major runs on that major's entry, so it reads that major's grade.
    rows.set(host, major === undefined ? { host, ...(GRADED[host] as Row) } : { host, major, ...(GRADED_MAJORS[`${host}-${major}`] as Row) });
  }
  return [...rows.values()];
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
function counted(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 's'}`;
}
const fileCount = (n: number): string => counted(n, 'file');

/** U12-5 — the outcome in words, so a partial run never reads as a finished one. migrate-preflight R6: a blocked one says so first. */
function summaryOf(touched: number, refusedFiles: number, dryRun: boolean, blocking: number): string {
  if (blocking > 0) return `blocked: ${counted(blocking, 'preflight check')}; nothing written (${fileCount(touched)} would be rewritten)`;
  const done = `${fileCount(touched)} ${dryRun ? 'would be rewritten' : 'rewritten'}`;
  if (refusedFiles > 0) return `partial: ${done}, ${refusedFiles} refused`;
  return touched > 0 ? `complete: ${done}` : 'nothing to rewrite';
}

/** `1 line uses`, `2 lines use`. */
const linesUse = (n: number): string => `${counted(n, 'line')} ${n === 1 ? 'uses' : 'use'}`;

/** migrate-older-majors R5: a run that rewrote nothing, beside lines a claimed major removed, says it has a work list. */
function workListed(summary: string, removed: number): string {
  return summary === 'nothing to rewrite' && removed > 0 ? `${summary}; ${linesUse(removed)} an API a claimed major removed (see offMajor)` : summary;
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

/**
 * migrate-preflight — the rows for one run, and how many of them block it: none when it would
 * write nothing (R6). An off-major incumbent is considered (R1): adopting costs the same either way.
 */
async function gate(
  dir: string,
  run: { manifest: Manifest; dependencies: Map<string, string>; considered: readonly string[]; untracked: string[] },
  planned: number,
): Promise<{ preflight: PreflightRow[]; blocking: number }> {
  const preflight = preflightOf({
    manifest: run.manifest,
    declared: run.dependencies,
    jestConfigs: await jestConfigsIn(dir),
    // Every incumbent is its own key in MAPPING; `migrate-preflight.test.ts` holds that.
    targets: run.considered.map((host) => MAPPING[host] as string),
    family: FAMILY,
    untracked: run.untracked,
  });
  return { preflight, blocking: planned === 0 ? 0 : preflight.filter((row) => row.blocking).length };
}

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
 * migrate-older-majors R5 — an off-major incumbent, its nearest claimed major and the move to it
 * or what stands in the way, then each line its claimed majors removed, with the fix.
 */
function offMajorLines(o: OffMajor): string[] {
  const nearest = o.nearest === null ? '' : `; nearest claimed ${o.nearest}`;
  // With no nearest major there are no sites: each is removed above the found major and at or below a claimed one.
  const blocked = o.sites.filter((site) => removedMajor(site) <= (o.nearest as number)).length;
  let move = '';
  if (o.move !== null) move = `, move ${Object.entries(o.move).map(([from, to]) => `${from} -> ${to}`).join(', ')}`;
  else if (blocked > 0) move = `, no move: ${counted(blocked, 'line')} below ${blocked === 1 ? 'uses' : 'use'} an API ${o.nearest} removed`;
  return [
    `${o.from} ${o.found} (graded ${o.graded})${nearest}${move}`,
    ...o.sites.map((site) => `  ${site.file}:${site.line}  ${site.api}  removed in ${site.removedIn}; use: ${site.replacement}${site.firstUse === undefined ? '' : ` (first use line ${site.firstUse})`}`),
  ];
}

/**
 * migrate-preflight R6 — what the list of moves is called. A blocked run wrote nothing, dry run
 * or not, so it never says `rewrote`: until 2026-10-25 a blocked run printed `rewrote:` over the
 * files it had left alone. The summary is the outcome in words, and `summaryOf` alone writes `blocked:`.
 */
function rewroteLabel(r: MigrationReport): string {
  if (r.summary.startsWith('blocked:')) return 'would rewrite, not rewritten (blocked)';
  return r.dryRun ? 'would rewrite' : 'rewrote';
}

/**
 * U12-5 — the report as a person reads it. The engine's text surface is one level deep and
 * printed every list in this report as a line of JSON; this is the same report in sentences
 * and aligned lines, first line the summary. `--json` is unchanged: the data is the data.
 */
export function textOf(r: MigrationReport): string {
  const lines = [
    r.summary,
    ...section('before the move', r.preflight.map((p) => `${p.blocking ? 'block' : 'warn'}  ${p.check}  ${p.message}; fix: ${p.fix}`)),
    ...section(
      rewroteLabel(r),
      r.mapped.map((m) => `${m.from} -> ${m.to}  ${m.imports} import${m.imports === 1 ? '' : 's'} in ${fileCount(m.files)}`),
    ),
    ...section('refused, and left exactly as it was', r.refused.map(refusalLine)),
    ...section('read as not an incumbent (a computed specifier)', r.dynamic.map((d) => `${d.file}:${d.line}  ${d.shape}`)),
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
    ...section('on a major that was not graded, left alone', r.offMajor.flatMap(offMajorLines)),
    ...section('no drop-in; see the guide', r.guided.map((g) => `${g.file}:${g.line}  ${g.from}  ${g.pattern}  ${g.guide}`)),
    ...section('graded by the incumbent’s own suite', r.graded.map((g) => `${g.host}${g.major === undefined ? '' : ` ${g.major}`}  ${g.passed} / ${g.reference} (the incumbent passes ${g.control})`)),
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
  const { dir, dryRun = false } = options;
  checkNames(options);
  const untracked = await checkTree(options);

  const manifest = await manifestAt(join(dir, 'package.json'));
  const dependencies = declaredBy(manifest);
  const { offMajor, entries: ownEntries, majors } = await majorsOf(dir, dependencies);
  const only = options.only === undefined ? undefined : new Set(options.only);
  const skipped = new Set(options.skip);
  // U12-3: an incumbent is considered when the project chose it — `--only`, or else its manifest — and nothing excludes it.
  const considered = HOSTS.filter((host) => (only === undefined ? dependencies.has(host) : only.has(host)) && !skipped.has(host));
  // It moves when it is also on a claimed major.
  const chosen = considered.filter((host) => !offMajor.some((o) => o.from === host));
  const skip = new Set(HOSTS.filter((host) => !chosen.includes(host)));
  const through = await transitiveOf(dir, dependencies, chosen);

  const sources = sourceFiles(dir);
  const files = [...sources, ...binsOf(dir, manifest.bin, sources)];
  const older = olderOf(offMajor);
  const scanned: Scanned[] = [];
  // Stryker disable MethodExpression: a project of more than one batch is migrate-bench.test.ts's 1,000 files, which the mutation lane skips (SKIPPED_TESTS)
  for (let i = 0; i < files.length; i += BATCH) {
    // eslint-disable-next-line reliability/no-await-in-loop -- the await IS the bound (A10). Each batch is 256 files in flight at once; awaiting one before opening the next is what keeps the command inside the open-file limit on a repository of any size, and `Promise.all` over every file in a monorepo is EMFILE.
    scanned.push(...(await scanBatch(dir, files.slice(i, i + BATCH), { skip, transitive: through, entries: ownEntries, older })));
  }
  // Stryker restore MethodExpression

  // U12-4: what the first pass refused or kept is held everywhere, and a second pass over the
  // files that named an incumbent rewrites without it. Refusing never adds a refusal — it only
  // removes sites — so the second pass refuses nothing the first did not.
  const held = heldBy(scanned);
  const rewrites =
    held.length === 0
      ? scanned.map(({ file, result }) => ({ file, result }))
      : scanned.map(({ file, result, text }) => ({ file, result: text === undefined ? result : rewriteFile(text, new Set([...skip, ...held.map((h) => h.from)]), through, ownEntries).rewrite }));
  const changed = rewrites.filter(({ result }) => result.mapped.length > 0).map(({ file, result }) => ({ file, source: result.source }));

  // migrate-preflight R6: decided after the scan, because only a run that would write is blocked,
  // and before the one writer.
  const { preflight, blocking } = await gate(dir, { manifest, dependencies, considered, untracked }, changed.length);
  const writes = !dryRun && blocking === 0;
  if (writes) await writeAll(dir, changed);

  const all = rewrites.flatMap(({ file, result }) => result.mapped.map((m) => ({ ...m, file })));
  const refused: Refusal[] = scanned.flatMap(({ file, result }) => result.refused.map((r) => ({ file, ...r })));
  const dynamic: Dynamic[] = scanned.flatMap(({ file, result }) => (result.dynamic ?? []).map((d) => ({ file, ...d })));
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

  const graded = await familyVersions();
  const age = await releaseAgeOf(dir);
  const now = options.now ?? new Date();
  const under =
    age === null
      ? { pins: [], unread: [] }
      : await pinsUnder(age, add, graded, { times: options.registry ?? registryTimes, now, floors: floorsOf([...new Set(all.map((m) => m.to))].sort(), options.since ?? (await subpathFloors()), graded) });

  const rows = offMajor.map((row) => withSites(row, older, scanned));
  const moved = [...new Set(all.map((m) => packageOf(m.from)))].flatMap((host) => dependencies.get(host) ?? []);
  const style = pinStyle(manifest.dependencies ?? {}, moved);

  const report: MigrationReport = {
    summary: workListed(summaryOf(changed.length, refusedFiles, dryRun, blocking), rows.reduce((n, row) => n + row.sites.length, 0)),
    preflight,
    files: changed.length,
    imports: all.length,
    mapped: rollup(all),
    refused,
    dynamic,
    kept,
    detected: { declared, imported },
    dependencies: { before: declared, removable, after: declared.length - removable.length, add },
    // The grades of what the project uses and chose; an undeclared incumbent is not this run's.
    graded: gradedFor([...new Set([...declared, ...imported])].filter((host) => !undeclared.includes(host)).sort(), majors),
    partial,
    offMajor: rows,
    guided,
    undeclared,
    held,
    transitive: [...through.entries()].map(([from, by]) => ({ from, through: by, exports: identityOf(from) })),
    releaseAge: age === null ? null : releaseAgeNote(age, under, now, style),
    // migrate-preflight R6: a blocked run moved nothing, so the install and uninstall that follow a
    // move are not its next step; the preflight rows' fixes are.
    next: blocking > 0 ? '' : nextStep(dir, add, removable, { versions: { ...graded, ...Object.fromEntries(under.pins.map((p) => [p.name, p.version])) }, style }),
    dryRun,
    changed: writes && changed.length > 0,
    exitCode: refused.length > 0 || blocking > 0 ? ExitCode.RUNTIME : ExitCode.OK,
  };
  // U12-5: the text surface, under a symbol so `--json` never carries it (`render.ts`).
  Object.defineProperty(report, TEXT, { value: () => textOf(report), enumerable: false });
  return report;
}

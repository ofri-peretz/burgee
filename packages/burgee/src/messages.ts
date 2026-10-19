/**
 * The engine's human strings, by id — the catalog a locale pack translates
 * (`localised-human-surfaces` R1).
 *
 * **English is not read from here.** Every string below is also written where it is used
 * today, and that copy is the one a run prints: the catalog is the table a pack is checked
 * against and the one `locale.ts` reads to recognise an English line it can translate. So a
 * program that never localises loads none of it, the startup graph pays no byte for it, and
 * English is byte-identical by construction rather than by a snapshot catching a typo.
 * `messages.test.ts` holds the two copies together in both directions: a catalog entry that
 * differs by one character from its call site fails it, and so does a usage error written
 * without an entry here.
 *
 * A template is the English with each varying part named in braces: `{option}` is a value a
 * pack places where its language wants it, and never translates. `{count}` is the one name
 * with a meaning: a message that carries it may be translated as plural forms, keyed by what
 * `Intl.PluralRules` selects for the pack's locale (R4).
 *
 * What is not here, on purpose: the `error:`, `hint:`, `fix:`, `usage:` and `next:` labels,
 * which scripts and agents read as structure; every machine surface (`--json`, `--schema`,
 * `--mcp`, `--format=agent`, error kinds and exit codes), which never changes with the locale
 * (R3); and the commander, yargs and meow front-ends, whose strings their incumbents' suites
 * grade.
 */
export const MESSAGES = {
  // Usage errors: what was typed wrong.
  'usage.unknownOption': 'unknown option {option}',
  'usage.unknownCommand': 'unknown command "{command}"',
  'usage.unknownShell': 'unknown shell "{shell}"',
  'usage.missingOption': 'missing required option --{option}',
  'usage.missingArgument': 'missing required argument "{argument}"',
  'usage.number': '{option} expects a number, got "{value}"',
  'usage.integer': '{option} expects an integer, got {value}',
  'usage.minimum': '{option} must be at least {minimum}, got {value}',
  'usage.maximum': '{option} must be at most {maximum}, got {value}',
  'usage.choice': '--{option} must be one of {choices}, got "{value}"',
  'usage.schema': '--{option}: {issues}',
  'usage.exactlyOne': 'exactly one of {options} is required',
  'usage.atLeastOne': 'at least one of {options} is required',
  'usage.atMostOne': 'at most one of {options} may be given',
  'usage.together': '{options} cannot be used together',
  'usage.requires': '--{option} requires --{other}',
  'usage.notAllowed': '--{option} is not allowed with these values',
  'usage.timeout': '--timeout takes a duration such as 500ms, 5s or 2m, not "{value}"',
  'usage.color': '--color takes always, never or auto, not "{value}"',
  'usage.noFields': '"{command}" declares no fields to list',
  'usage.unknownField': 'unknown field {fields}',
  'usage.unknownFields': 'unknown fields {fields}',
  'usage.noSchemaField': '{at} has no field "{field}"',
  'usage.fieldOne': '--field drills into one command',
  'usage.stdinOnce': '"-" was given for {count} file arguments, and standard input can be read once',
  'usage.tooManyArguments': 'too many arguments: expected {expected}, got {given} ({words})',
  'usage.givenTwice': '--{option} was given twice: "{first}" and "{last}"',
  // `burgee init` (first-cli R1, R4): a file it would overwrite, and an install that failed.
  'usage.exists': '{path} already exists',
  'init.installFailed': '{command} exited {code}',
  'config.noVersion': 'no version declared',
  'timeout.passed': 'timed out after {ms} ms',
  // Hints: what to do about it.
  'hint.runHelp': 'run --help to see the available options',
  'hint.runSchema': 'run --schema for every command and option as JSON, in one call; --explain <option> says where a value came from',
  'hint.didYouMean': 'did you mean {suggestion}?',
  'hint.didYouMeanOneOf': 'did you mean one of {suggestions}?',
  'hint.singleDash': 'did you mean --{option}? a single dash introduces one-letter options',
  'hint.textDefault': 'text is the default',
  'hint.passOption': 'pass --{option} <value>',
  'hint.passFlag': 'pass --{option}',
  'hint.passNumber': 'pass {option} <number>',
  'hint.passValue': 'pass {option} {value}',
  'hint.passChoice': 'pass --{option} {value}',
  'hint.check': 'check --{option}',
  'hint.passOne': 'pass one of them',
  'hint.dropAllButOne': 'drop all but one of {options}',
  'hint.dropOne': 'drop one of them',
  'hint.checkValues': 'check the values --{option} is declared to require',
  'hint.timeout': 'a bare number is milliseconds; it must be above 0',
  'hint.noColor': 'pass --no-color to turn colour off',
  'hint.wholeResult': 'run "{command} --json" to see its whole result',
  'hint.validFields': 'valid fields: {fields}',
  'hint.schemaFields': 'fields here: {fields}',
  'hint.nameCommand': 'name the command first: --schema <command> --field <path>',
  'hint.stdinOnce': 'pass a path for all but one of them',
  'hint.largerTimeout': 'run it again with a larger --timeout',
  'hint.overwrite': 'pass --force to overwrite it',
  'hint.declareVersion': 'pass version to defineProgram, or set "version" in the owning package.json',
  // The usage block a failure teaches with (D-20260930-failures-teach-recovery).
  'usage.options': 'options:',
  'usage.commands': 'commands:',
  'usage.more': '  … the rest: {command}',
  // Help: headings, the global rows and the root's line for agents.
  'help.usage': 'Usage:',
  'help.arguments': 'Arguments:',
  'help.options': 'Options:',
  'help.globalOptions': 'Global options:',
  'help.commands': 'Commands:',
  'help.examples': 'Examples:',
  'help.environment': 'Environment:',
  'help.exitCodes': 'Exit codes:',
  'help.json': 'machine-readable output',
  'help.help': 'show this help',
  'help.schema': 'the program as data',
  'help.explain': "where an option's value came from",
  'help.color': 'always, never or auto (default: auto); NO_COLOR is honoured',
  'help.noColor': 'the same as --color=never',
  'help.quiet': 'silence progress and hints; data and errors still print',
  'help.timeout': 'end the run after this long, exit {code}: 500ms, 5s, 2m',
  'help.completion': 'Print a shell completion script: bash, zsh, fish, pwsh or fig',
  'help.completionShell': 'bash, zsh, fish, pwsh or fig',
  'help.agentsMd': ' AGENTS.md beside this program says how to drive it.',
  'help.forAgents': 'For agents: --schema prints every command, option, default and env var as JSON, in one call. --json prints one envelope on stdout, and --explain <option> says where a value came from.',
  // What each exit code asks of the caller, in root help's `Exit codes:` (never in `--schema`).
  'exit.ok': 'the command completed',
  'exit.runtime': 'it ran and failed; read the message',
  'exit.usage': 'bad arguments or an unknown command; rewrite the command',
  'exit.config': 'the config or environment did not load; fix it, not the command',
  'exit.cancelled': 'cancelled, or a decision is needed; decide, then run a next command',
  'exit.auth': 'a credential is missing or refused; set {env} and run it again',
  'exit.timeout': 'the --timeout deadline passed; run it again with more time',
  'exit.sigint': 'interrupted; stop',
} as const satisfies Readonly<Record<string, string>>;

/** A catalog id: what a pack keys its translations by. */
export type MessageId = keyof typeof MESSAGES;

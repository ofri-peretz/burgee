/**
 * caique's own chrome, by id — the catalog a locale pack translates (`localised-human-surfaces`
 * R6). Every id begins `caique.`, so one pack object carries burgee's messages and these, and
 * each package checks only its own.
 *
 * As in burgee, **English is not read from here**: each string is also written where it is
 * used, and that copy is the one printed. A run with a locale and a pack recognises a finished
 * English line as an instance of a template and renders the pack's message with its values
 * (`locale.ts`). `messages.test.ts` holds the two copies together.
 *
 * What is not here: the author's own question, choice labels and hints, which are theirs; and
 * `caique/clack` and `caique/inquirer`, whose strings their incumbents' suites grade.
 */
export const MESSAGES = {
  // What the line-mode widgets draw (`ask.ts`).
  'caique.answerYesNo': 'answer y or n',
  'caique.enterNumber': 'enter a number (1-{last}):',
  'caique.enterNumbers': 'enter numbers separated by commas, or blank for none:',
  'caique.numberRange': 'enter a number from 1 to {last}',
  'caique.notAChoice': '{answer} is not a choice; use numbers from 1 to {last}',
  'caique.notChoices': '{answers} are not choices; use numbers from 1 to {last}',
  'caique.givingUp': 'giving up after {count} attempts',
  // The refusals `decide()` returns when nobody can be asked.
  'caique.requiredUnderJson': '{flag} is required under --json',
  'caique.noOneUnderJson': 'pass {flag}; --json means no one is here to answer "{question}"',
  'caique.requiredNobody': '{flag} is required when nobody is there to answer',
  'caique.requiredNobodyAsked': '{flag} is required when nobody is there to answer (--interactive needs a person, and CI or an agent is driving this)',
  'caique.requiredNoTerminal': '{flag} is required when there is no terminal',
  'caique.requiredNoTerminalAsked': '{flag} is required when there is no terminal (--interactive needs a terminal on stdin)',
  'caique.wouldHaveAsked': 'pass {flag}; it would have been asked as "{question}"',
  // The cancel line (`binding.ts`).
  'caique.cancelledAt': 'cancelled at --{option}',
  'caique.passToSkip': 'pass --{option} to skip the question',
} as const satisfies Readonly<Record<string, string>>;

/** A catalog id: what a pack keys caique's translations by. */
export type MessageId = keyof typeof MESSAGES;

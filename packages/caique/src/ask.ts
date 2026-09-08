/**
 * The six widgets, in line mode (R5) — and line mode is not a fallback, it is the floor.
 *
 * Every widget here works by writing a question and reading a line. No raw mode, no cursor
 * movement, no escape sequence, no redraw. That makes it the accessible mode by
 * construction rather than by a second implementation kept in step by hand: a screen
 * reader gets the same bytes a terminal does, and `select` is a numbered list because a
 * numbered list is what a person can answer without seeing a highlight move.
 *
 * It is also what makes the widgets testable without a PTY. A `Reader` is one method that
 * returns the next line, so the whole suite is strings in and strings out; the raw-mode
 * renderer that arrows and highlights will come later sits *on top* of this and answers
 * the same questions, which is how it stays honest.
 *
 * Nothing here reads `process`, and nothing decides *whether* to ask — that is `decide()`,
 * which runs first and refuses when there is no one to ask.
 */
import { type BoundPrompt, type Choice, type PromptSpec } from './spec.js';

/** A line of input, or `undefined` when the stream ended — which is a cancellation. */
export interface Reader {
  line(): Promise<string | undefined>;
}

export interface Writer {
  write(text: string): void;
}

export interface Io {
  reader: Reader;
  writer: Writer;
}

export type Answer = string | boolean | string[];

/** Answered, or cancelled — cancellation is a value here and a `CANCELLED` error above (R4). */
export type Asked = { ok: true; value: Answer } | { ok: false; reason: 'cancelled' };

const CANCELLED: Asked = { ok: false, reason: 'cancelled' };

/** Re-asking forever on invalid input is a hang with extra steps. */
const MAX_ATTEMPTS = 5;
const DECIMAL = 10;

const YES = new Set(['y', 'yes', 'true', '1']);
const NO = new Set(['n', 'no', 'false', '0']);

/** `Overwrite it? (y/N)` — the default in capitals, the convention every CLI already uses. */
function confirmSuffix(initial: unknown): string {
  return initial === true ? ' (Y/n) ' : ' (y/N) ';
}

function textSuffix(initial: unknown): string {
  return typeof initial === 'string' && initial !== '' ? ` (${initial}) ` : ' ';
}

/** The numbered list R5 asks for. One-based, because a person is reading it. */
function listChoices(choices: Choice[]): string {
  return choices.map((choice, index) => `  ${index + 1}) ${choice.label ?? choice.value}${choice.hint === undefined ? '' : ` — ${choice.hint}`}`).join('\n');
}

/** A 1-based index into `choices`, or nothing when the answer names no choice. */
function pick(answer: string, choices: Choice[]): Choice | undefined {
  const index = Number.parseInt(answer, DECIMAL);
  if (Number.isInteger(index) && index >= 1 && index <= choices.length) return choices[index - 1];
  // A person who types the label rather than its number has answered the question.
  return choices.find((choice) => choice.value === answer || choice.label === answer);
}

interface Attempt {
  /** What to write before reading. Written once per attempt, so a retry re-states it. */
  question: string;
  /** The answer, or a message saying why it is not one. */
  parse: (line: string) => { ok: true; value: Answer } | { ok: false; problem: string };
}

function confirmAttempt(spec: PromptSpec, label: string): Attempt {
  return {
    question: label + confirmSuffix(spec.initial),
    parse: (line) => {
      const answer = line.trim().toLowerCase();
      if (answer === '') return { ok: true, value: spec.initial === true };
      if (YES.has(answer)) return { ok: true, value: true };
      if (NO.has(answer)) return { ok: true, value: false };
      return { ok: false, problem: 'answer y or n' };
    },
  };
}

function selectAttempt(choices: Choice[], label: string): Attempt {
  return {
    question: `${label}\n${listChoices(choices)}\n  enter a number (1-${choices.length}): `,
    parse: (line) => {
      const choice = pick(line.trim(), choices);
      return choice === undefined ? { ok: false, problem: `enter a number from 1 to ${choices.length}` } : { ok: true, value: choice.value };
    },
  };
}

function multiselectAttempt(choices: Choice[], label: string): Attempt {
  return {
    question: `${label}\n${listChoices(choices)}\n  enter numbers separated by commas, or blank for none: `,
    parse: (line) => {
      const parts = line
        .split(',')
        .map((part) => part.trim())
        .filter((part) => part !== '');
      if (parts.length === 0) return { ok: true, value: [] };
      const picked = parts.map((part) => pick(part, choices));
      const missing = parts.filter((_, index) => picked[index] === undefined);
      if (missing.length > 0) return { ok: false, problem: `${missing.join(', ')} ${missing.length === 1 ? 'is not a choice' : 'are not choices'}; use numbers from 1 to ${choices.length}` };
      return { ok: true, value: picked.map((choice) => (choice as Choice).value) };
    },
  };
}

/**
 * text, password and path all read a line. `password` differs only in that the caller must
 * not echo it, which is the reader's business — this module never sees a terminal, so
 * hiding the input cannot be got wrong here.
 */
function lineAttempt(spec: PromptSpec, label: string): Attempt {
  return {
    question: label + textSuffix(spec.initial),
    parse: (line) => {
      const answer = line === '' && typeof spec.initial === 'string' ? spec.initial : line;
      const problem = spec.validate?.(answer);
      return problem === undefined ? { ok: true, value: answer } : { ok: false, problem };
    },
  };
}

function attemptFor(spec: PromptSpec, label: string): Attempt {
  const choices = spec.choices ?? [];
  if (spec.kind === 'confirm') return confirmAttempt(spec, label);
  if (spec.kind === 'select') return selectAttempt(choices, label);
  if (spec.kind === 'multiselect') return multiselectAttempt(choices, label);
  return lineAttempt(spec, label);
}

/**
 * Ask one prompt and return its answer.
 *
 * A stream that ends is a cancellation, not an empty answer: `Ctrl-D` and a closed pipe
 * both mean nobody is going to type, and treating that as `''` is how a program ends up
 * writing to a path the user never chose. Invalid input is re-asked, bounded — after
 * `MAX_ATTEMPTS` it gives up rather than looping, because a loop against a stream that
 * keeps answering wrongly is the hang this package exists to prevent, wearing a hat.
 */
export async function ask(prompt: BoundPrompt | PromptSpec, io: Io): Promise<Asked> {
  const label = prompt.message;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const { question, parse } = attemptFor(prompt, label);
    io.writer.write(question);
    // A prompt is a conversation: the next question depends on the last answer, which is
    // what sequential means. Promise.all() would ask all five at once and read none.
    // eslint-disable-next-line reliability/no-await-in-loop -- see above
    const line = await io.reader.line();
    if (line === undefined) return CANCELLED;

    const result = parse(line);
    if (result.ok) return { ok: true, value: result.value };
    io.writer.write(`  ${result.problem}\n`);
  }

  io.writer.write(`  giving up after ${MAX_ATTEMPTS} attempts\n`);
  return CANCELLED;
}

/**
 * What a widget would have written, without reading anything — the static projection (U3).
 * The docs gallery, `--help` and a transcript in an issue all want the question without
 * the conversation, and every other package in this family can answer that; so does this.
 */
export function projection(spec: PromptSpec): string {
  const { question } = attemptFor(spec, spec.message);
  return question.trimEnd();
}

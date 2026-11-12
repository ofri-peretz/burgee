/**
 * `date` in `caique/clack`: the layout a locale gives it, and every way a key changes a field
 * — typing, stepping, moving and erasing — checked by the date it answers, not only the frame.
 *
 * Colour is off (`vitest-colour-setup.ts`), so frames are compared as text.
 */
import { Readable, Writable } from 'node:stream';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { CANCEL_SYMBOL } from './clack-core.js';
import { date, type DateOptions } from './clack-date.js';

class Output extends Writable {
  buffer: string[] = [];
  isTTY = false;
  columns = 80;
  rows = 20;
  override _write(chunk: Buffer | string, _encoding: BufferEncoding, done: (error?: Error | null) => void): void {
    this.buffer.push(chunk.toString());
    done();
  }
}

class Input extends Readable {
  override _read(): void {
    // Keys arrive as emitted `keypress` events, never as data.
  }
}

const NAMED: Record<string, { char?: string; name: string; shift?: boolean }> = {
  return: { char: '\r', name: 'return' },
  escape: { char: 'escape', name: 'escape' },
  tab: { char: '\t', name: 'tab' },
  'shift-tab': { char: '\t', name: 'tab', shift: true },
  up: { name: 'up' },
  down: { name: 'down' },
  left: { name: 'left' },
  right: { name: 'right' },
  backspace: { char: '\u007F', name: 'backspace' },
};

/** Run a date prompt through `keys` — a string of digits is typed one digit at a time — and return its answer and frames. */
async function drive(opts: Omit<DateOptions, 'input' | 'output'>, keys: string[]): Promise<{ answer: Date | symbol; writes: string[] }> {
  const input = new Input();
  const output = new Output();
  const answer = date({ ...opts, input, output });
  for (const key of keys.flatMap((k) => (/^\d+$/.test(k) ? [...k] : [k]))) {
    const event = NAMED[key] ?? { char: key, name: key };
    input.emit('keypress', event.char, { name: event.name, sequence: event.char, shift: event.shift });
    // eslint-disable-next-line reliability/no-await-in-loop -- keys are pressed one at a time, each after the last one's frame
    await new Promise((resolve) => setImmediate(resolve));
  }
  return { answer: await answer, writes: output.buffer };
}

const utc = (year: number, month: number, day: number): Date => new Date(Date.UTC(year, month - 1, day));

/** The field line of the first frame: the fields and their separators. */
async function fieldsOf(opts: Omit<DateOptions, 'input' | 'output' | 'message'>): Promise<string> {
  const { writes } = await drive({ message: 'when?', ...opts }, ['escape']);
  return (writes[1] ?? '').split('\n')[2] ?? '';
}

/** Parts a stubbed `Intl.DateTimeFormat` returns: a `~` for each literal, a `0` for each field. */
const parts = (types: string[]): { type: string; value: string }[] => types.map((type) => ({ type, value: type === 'literal' ? '~' : '0' }));

const needsDate = (value: Date | undefined): string | undefined => (value === undefined ? 'a date, please' : undefined);

const notMonday = (value: Date | undefined): string | undefined => (value?.getUTCDay() === 1 ? 'not a Monday' : undefined);

describe('the layout a locale gives', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('takes the separator between the fields, not the space after an era', async () => {
    // Pashto writes `AP 1378-10-25`: the first literal is the space after the era.
    expect(await fieldsOf({ locale: 'ps' })).toBe('│  yyyy-mm-dd');
  });

  it('takes the separator between the fields, not a suffix after the last one', async () => {
    // Bulgarian writes `15.01.2000 г.`: the last literal is the year's suffix.
    expect(await fieldsOf({ locale: 'bg' })).toBe('│  dd.mm.yyyy');
  });

  it('trims the spaces around a separator that has more than spaces', async () => {
    // Hungarian writes `2000. 01. 15.`: the separator is `. `, drawn as `.`.
    expect(await fieldsOf({ locale: 'hu' })).toBe('│  yyyy.mm.dd');
  });

  it.each([
    ['YMD', '│  yyyy/mm/dd'],
    ['MDY', '│  mm/dd/yyyy'],
    ['DMY', '│  dd/mm/yyyy'],
  ] as const)('a format of %s orders the fields that way, with a slash between them', async (format, line) => {
    expect(await fieldsOf({ format })).toBe(line);
  });

  it('keeps a separator that is only a space', async () => {
    expect(await fieldsOf({ locale: 'yo' })).toBe('│  dd mm yyyy');
  });

  it('falls back to a slash when the fields are not separated by a literal', async () => {
    for (const types of [
      ['year', 'month', 'day'],
      ['literal', 'year'],
    ]) {
      vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(function stub() {
        return { formatToParts: () => parts(types) } as unknown as Intl.DateTimeFormat;
      });
      // eslint-disable-next-line reliability/no-await-in-loop -- one stubbed locale at a time
      expect(await fieldsOf({}), types.join(' ')).not.toContain('~');
      vi.restoreAllMocks();
    }
    vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(function stub() {
      return { formatToParts: () => parts(['year', 'month', 'day']) } as unknown as Intl.DateTimeFormat;
    });
    expect(await fieldsOf({})).toBe('│  yyyy/mm/dd');
  });
});

/** The field line of every frame written, in order. */
const fieldLines = (writes: string[]): string[] => writes.map((write) => write.split('\n')[2] ?? '').filter((line) => line.startsWith('│  '));

describe('typing', () => {
  it('draws a value with its leading zeros, and a part-typed field with spaces where the digits will go', async () => {
    const { writes } = await drive({ message: 'm', format: 'YMD', initialValue: utc(999, 3, 4) }, ['escape']);
    expect(writes[1]).toContain('│  0999/03/04\n');
    const typed = await drive({ message: 'm', format: 'YMD' }, ['2', 'escape']);
    expect(fieldLines(typed.writes)).toContain('│     2/mm/dd');
  });

  it('a field typed only in part is not a date, even when every other field is', async () => {
    const { answer } = await drive({ message: 'm', format: 'YMD' }, ['2024', '1', 'tab', '15', 'return', 'escape']);
    expect(answer).toBe(CANCEL_SYMBOL);
  });

  it('a digit typed into a full field starts it again, rather than filling it', async () => {
    const { answer } = await drive({ message: 'm', format: 'YMD' }, ['20240115', '3', 'return', 'escape']);
    expect(answer).toBe(CANCEL_SYMBOL);
  });

  it('typing into a part-typed field after leaving and coming back starts it again', async () => {
    const { answer } = await drive({ message: 'm', format: 'YMD' }, ['202', 'tab', 'shift-tab', '1999', '0304', 'return']);
    expect(answer).toEqual(utc(1999, 3, 4));
  });

  it('right and tab past the last field stay on it', async () => {
    const { answer } = await drive({ message: 'm', format: 'YMD' }, ['2024', '01', 'right', 'tab', '15', 'return']);
    expect(answer).toEqual(utc(2024, 1, 15));
  });

  it('left before the first field stays on it', async () => {
    const { answer } = await drive({ message: 'm', format: 'YMD' }, ['left', 'shift-tab', '2024', '0115', 'return']);
    expect(answer).toEqual(utc(2024, 1, 15));
  });

  it('a key carrying more than one character types nothing, digits or not', async () => {
    const input = new Input();
    const answer = date({ message: 'm', format: 'YMD', initialValue: utc(2024, 1, 15), input, output: new Output() });
    for (const char of ['5a', 'a5']) input.emit('keypress', char, { name: undefined, sequence: char });
    input.emit('keypress', '\r', { name: 'return', sequence: '\r' });
    expect(await answer).toEqual(utc(2024, 1, 15));
  });

  it('draws the field being edited inverted, an empty one dimmed, and the separators grey', async () => {
    vi.stubEnv('NO_COLOR', undefined);
    vi.stubEnv('FORCE_COLOR', '1');
    try {
      const line = await fieldsOf({ format: 'YMD', initialValue: utc(2024, 1, 15) });
      expect(line).toContain('\u001B[7m2024\u001B[27m\u001B[90m/\u001B[39m01\u001B[90m/\u001B[39m15');
      const blank = await fieldsOf({ format: 'YMD' });
      expect(blank).toContain('\u001B[7myyyy\u001B[27m\u001B[90m/\u001B[39m\u001B[2mmm\u001B[22m\u001B[90m/\u001B[39m\u001B[2mdd\u001B[22m');
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('starts from the initial value, and answers it', async () => {
    const { answer, writes } = await drive({ message: 'm', format: 'YMD', initialValue: utc(2024, 2, 29) }, ['return']);
    expect(answer).toEqual(utc(2024, 2, 29));
    expect(writes[1]).toContain('2024/02/29');
  });

  it('a digit into a full last field starts it again', async () => {
    const { answer } = await drive({ message: 'm', format: 'YMD' }, ['20240115', '09', 'return']);
    expect(answer).toEqual(utc(2024, 1, 9));
  });

  it('shift-tab and left move back a field, and typing there replaces it', async () => {
    expect((await drive({ message: 'm', format: 'YMD' }, ['2024', 'shift-tab', '1999', '0304', 'return'])).answer).toEqual(utc(1999, 3, 4));
    expect((await drive({ message: 'm', format: 'YMD' }, ['2024', 'left', '1999', '0304', 'return'])).answer).toEqual(utc(1999, 3, 4));
  });

  it('backspace clears a field, and on a clear one steps back to the previous field', async () => {
    const { answer } = await drive({ message: 'm', format: 'YMD' }, ['2024', '01', 'backspace', 'backspace', '02', '03', 'return']);
    expect(answer).toEqual(utc(2024, 2, 3));
    const { writes } = await drive({ message: 'm', format: 'YMD' }, ['2024', '01', 'backspace', 'backspace', 'escape']);
    expect(writes.at(-4)).toContain('2024/mm/dd');
  });
});

describe('stepping', () => {
  it('an empty month starts at 12 going down and 01 going up, and stays at 12 going up', async () => {
    expect((await drive({ message: 'm', format: 'MDY' }, ['down', 'tab', '15', '2024', 'return'])).answer).toEqual(utc(2024, 12, 15));
    expect((await drive({ message: 'm', format: 'MDY' }, ['up', 'tab', '15', '2024', 'return'])).answer).toEqual(utc(2024, 1, 15));
    expect((await drive({ message: 'm', format: 'MDY' }, ['12', 'shift-tab', 'up', 'tab', '15', '2024', 'return'])).answer).toEqual(utc(2024, 12, 15));
    const { writes } = await drive({ message: 'm', format: 'MDY' }, ['up', 'escape']);
    expect(fieldLines(writes)).toContain('│  01/dd/yyyy');
  });

  it('an empty day starts at 01 going up', async () => {
    const { writes } = await drive({ message: 'm', format: 'DMY' }, ['up', 'escape']);
    expect(fieldLines(writes)).toContain('│  01/mm/yyyy');
  });

  it('an empty year starts at 0001 going up when there is no minDate', async () => {
    const { writes } = await drive({ message: 'm', format: 'YMD' }, ['up', 'escape']);
    expect(fieldLines(writes)).toContain('│  0001/mm/dd');
  });

  it('up and down step a filled field and stop at the ends of its range', async () => {
    // January has 31 days: up from 31 stays, down goes to 30.
    const { answer } = await drive({ message: 'm', format: 'YMD', initialValue: utc(2024, 1, 31) }, ['right', 'right', 'up', 'down', 'return']);
    expect(answer).toEqual(utc(2024, 1, 30));
  });

  it('an empty field starts at the top of its range going down and the bottom going up', async () => {
    // With no month or year yet, the day's range is a common January's: down from empty is 31.
    const { answer } = await drive({ message: 'm', format: 'DMY' }, ['down', 'tab', 'up', 'tab', 'down', 'return']);
    expect(answer).toEqual(utc(9999, 1, 31));
  });

  it('with a month and no year, the day ranges over that month in a common year', async () => {
    // February, in a year that is not a leap year: down from an empty day is 28.
    const { writes } = await drive({ message: 'm', format: 'DMY' }, ['tab', '02', 'shift-tab', 'shift-tab', 'down', 'escape']);
    expect(writes.join('')).toContain('28/02/yyyy');
  });

  it("an empty year starts at minDate's year going up and maxDate's going down", async () => {
    const minDate = utc(1990, 6, 1);
    const maxDate = utc(2030, 6, 1);
    const up = await drive({ message: 'm', format: 'YMD', minDate, maxDate }, ['up', 'tab', '07', '01', 'return']);
    expect(up.answer).toEqual(utc(1990, 7, 1));
    const down = await drive({ message: 'm', format: 'YMD', minDate, maxDate }, ['down', 'tab', '01', '01', 'return']);
    expect(down.answer).toEqual(utc(2030, 1, 1));
  });
});

describe('what a date is refused for', () => {
  it.each([
    ['a day past the end of its month', '20230230'],
    ['day zero of a month after January', '20230200'],
    ['month zero', '20230015'],
    ['month thirteen', '20231315'],
    ['year zero', '00000115'],
  ])('refuses %s', async (_label, typed) => {
    expect((await drive({ message: 'm', format: 'YMD' }, [typed, 'return', 'escape'])).answer).toBe(CANCEL_SYMBOL);
  });

  it('takes the last day of a month and the last month of a year', async () => {
    expect((await drive({ message: 'm', format: 'YMD' }, ['20231231', 'return'])).answer).toEqual(utc(2023, 12, 31));
    expect((await drive({ message: 'm', format: 'YMD' }, ['20240229', 'return'])).answer).toEqual(utc(2024, 2, 29));
  });

  it('takes a date on minDate or maxDate, whatever time of day the bound carries', async () => {
    const minDate = new Date(Date.UTC(2024, 0, 15, 12));
    const maxDate = new Date(Date.UTC(2024, 0, 20, 12));
    expect((await drive({ message: 'm', format: 'YMD', minDate, maxDate }, ['20240115', 'return'])).answer).toEqual(utc(2024, 1, 15));
    expect((await drive({ message: 'm', format: 'YMD', minDate, maxDate }, ['20240120', 'return'])).answer).toEqual(utc(2024, 1, 20));
    const { writes } = await drive({ message: 'm', format: 'YMD', minDate, maxDate }, ['20240114', 'return', 'escape']);
    expect(writes.join('')).toContain('Date must be on or after 2024-01-15\n');
  });

  it('shows the date it answered once submitted, and nothing once cancelled with no date', async () => {
    const submitted = await drive({ message: 'm', format: 'YMD' }, ['20240109', 'return']);
    expect(submitted.writes.at(-3)?.endsWith('\u001B[J│\n◇  m\n│  2024/01/09')).toBe(true);
    const cancelled = await drive({ message: 'm', format: 'YMD' }, ['escape']);
    expect(cancelled.writes.at(-3)?.endsWith('\u001B[J│\n■  m\n│')).toBe(true);
  });

  it('an incomplete date with a default submits the default', async () => {
    const defaultValue = utc(2024, 5, 6);
    const { answer } = await drive({ message: 'm', format: 'YMD', defaultValue }, ['backspace', 'return']);
    expect(answer).toEqual(defaultValue);
  });

  it("an incomplete date is the caller's validator's to judge when there is one", async () => {
    const { answer, writes } = await drive({ message: 'm', format: 'YMD', validate: needsDate }, ['return', 'escape']);
    expect(answer).toBe(CANCEL_SYMBOL);
    expect(writes.join('')).toContain('a date, please');
  });

  it('a date past maxDate is refused, naming the bound', async () => {
    const { writes } = await drive({ message: 'm', format: 'YMD', maxDate: utc(2020, 1, 1) }, ['20200102', 'return', 'escape']);
    expect(writes.join('')).toContain('Date must be on or before 2020-01-01\n');
  });

  it("a complete date in range is still the caller's validator's to refuse", async () => {
    const { writes, answer } = await drive({ message: 'm', format: 'YMD', validate: notMonday }, ['20240101', 'return', 'escape']);
    expect(writes.join('')).toContain('not a Monday');
    expect(answer).toBe(CANCEL_SYMBOL);
    expect((await drive({ message: 'm', format: 'YMD', validate: notMonday }, ['20240102', 'return'])).answer).toEqual(utc(2024, 1, 2));
  });
});

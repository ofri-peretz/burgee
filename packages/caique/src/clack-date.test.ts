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

describe('typing', () => {
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
    expect(writes.join('')).toContain('Date must be on or before 2020-01-01');
  });

  it("a complete date in range is still the caller's validator's to refuse", async () => {
    const { writes, answer } = await drive({ message: 'm', format: 'YMD', validate: notMonday }, ['20240101', 'return', 'escape']);
    expect(writes.join('')).toContain('not a Monday');
    expect(answer).toBe(CANCEL_SYMBOL);
    expect((await drive({ message: 'm', format: 'YMD', validate: notMonday }, ['20240102', 'return'])).answer).toEqual(utc(2024, 1, 2));
  });
});

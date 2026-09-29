/**
 * clack's `date` prompt: a date typed field by field in the locale's order — or the format
 * given — or stepped with the arrows inside `minDate`…`maxDate`. The answer is a UTC
 * midnight, which is what clack returns.
 */
import { type CommonOptions, type DateFormat, frame, paint, type Prompt, run, runValidation, type Validate } from './clack-core.js';
import { type Answer } from './clack-prompts.js';

export interface DateOptions extends CommonOptions {
  message: string;
  format?: DateFormat;
  locale?: string;
  defaultValue?: Date;
  initialValue?: Date;
  minDate?: Date;
  maxDate?: Date;
  validate?: Validate<Date>;
}

type Segment = 'year' | 'month' | 'day';

/** Each field's width, and what it shows while empty. */
const SHAPE: Record<Segment, { width: number; label: string }> = {
  year: { width: 4, label: 'yyyy' },
  month: { width: 2, label: 'mm' },
  day: { width: 2, label: 'dd' },
};
/** The field order each format names. */
const ORDER: Record<DateFormat, readonly Segment[]> = {
  YMD: ['year', 'month', 'day'],
  MDY: ['month', 'day', 'year'],
  DMY: ['day', 'month', 'year'],
};

const isSegment = (type: string): type is Segment => type === 'year' || type === 'month' || type === 'day';
const widthOf = (segment: Segment): number => SHAPE[segment].width;
const blankOf = (segment: Segment): string => '_'.repeat(widthOf(segment));

/** Any date whose day is past twelve, so a locale's parts cannot be read ambiguously. */
const PROBE_YEAR = 2000;
const PROBE_DAY = 15;
const PROBE = new Date(Date.UTC(PROBE_YEAR, 0, PROBE_DAY));
const DECIMAL = 10;
const MONTHS = 12;
const LAST_YEAR = 9999;
/** The year a day count is taken in when no year has been typed: not a leap year. */
const PLAIN_YEAR = 2001;
const ISO_DATE = 10;

/** The field order and separator for a format, or the locale's own when there is none. */
function layoutOf(format: DateFormat | undefined, locale: string | undefined): { segments: Segment[]; separator: string } {
  if (format !== undefined) return { segments: [...ORDER[format]], separator: '/' };
  const parts = new Intl.DateTimeFormat(locale, { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'UTC' }).formatToParts(PROBE);
  const segments = parts.map((part) => part.type).filter(isSegment);
  // The literal right after the first field. Not the first literal, which in `ps` is the space
  // after the era, and not the last, which in `bg` is the ` г.` after the year.
  const after = parts[parts.findIndex((part) => isSegment(part.type)) + 1];
  const literal = after?.type === 'literal' ? after.value : '/';
  return { segments, separator: literal.trim() === '' ? literal : literal.trim() };
}

const numberOf = (digits: string): number => Number.parseInt(digits.replaceAll('_', '0'), DECIMAL) || 0;
const daysIn = (year: number, month: number): number => new Date(Date.UTC(year || PLAIN_YEAR, month || 1, 0)).getUTCDate();
const isoDay = (date: Date): string => date.toISOString().slice(0, ISO_DATE);

/** The fields of a date being typed, the one being edited, and whether typing replaces it. */
class Fields {
  private readonly values = new Map<Segment, string>();
  active = 0;
  /** Set when the cursor arrives at a field: the next digit replaces it rather than extending it. */
  fresh = true;

  constructor(
    readonly segments: Segment[],
    readonly separator: string,
    start: Date | undefined,
    private readonly bounds: { min?: Date | undefined; max?: Date | undefined },
  ) {
    this.values.set('year', start === undefined ? blankOf('year') : String(start.getUTCFullYear()).padStart(widthOf('year'), '0'));
    this.values.set('month', start === undefined ? blankOf('month') : String(start.getUTCMonth() + 1).padStart(widthOf('month'), '0'));
    this.values.set('day', start === undefined ? blankOf('day') : String(start.getUTCDate()).padStart(widthOf('day'), '0'));
  }

  get(segment: Segment): string {
    // Every segment is set in the constructor.
    return this.values.get(segment) as string;
  }

  private get segment(): Segment {
    // `active` is clamped to the segments by `moveBy`.
    return this.segments[this.active] as Segment;
  }

  /** The date the fields name, or nothing while one is incomplete or the day is past the month's end. */
  date(): Date | undefined {
    const year = numberOf(this.get('year'));
    const month = numberOf(this.get('month'));
    const day = numberOf(this.get('day'));
    const complete = this.segments.every((segment) => !this.get(segment).includes('_'));
    if (!complete || year < 1 || month < 1 || month > MONTHS || day < 1 || day > daysIn(year, month)) return undefined;
    const date = new Date(Date.UTC(year, month - 1, day));
    // `Date.UTC` reads a year below 100 as 19xx, so year 1 would come back as 1901. clack
    // refuses such a date rather than return a different one, and so does this.
    return date.getUTCFullYear() === year ? date : undefined;
  }

  formatted(): string {
    return this.segments.map((segment) => this.get(segment)).join(this.separator);
  }

  /** The range the active field may be stepped through. */
  private range(segment: Segment): [number, number] {
    if (segment === 'year') return [this.bounds.min?.getUTCFullYear() ?? 1, this.bounds.max?.getUTCFullYear() ?? LAST_YEAR];
    if (segment === 'month') return [1, MONTHS];
    return [1, daysIn(numberOf(this.get('year')), numberOf(this.get('month')))];
  }

  moveBy(step: number): void {
    this.active = Math.max(0, Math.min(this.segments.length - 1, this.active + step));
    this.fresh = true;
  }

  /** Up or down one; an empty field starts at the bottom of its range going up, the top going down. */
  step(by: number): void {
    const { segment } = this;
    const [low, high] = this.range(segment);
    const blank = this.get(segment).replaceAll('_', '') === '';
    const start = by > 0 ? low : high;
    const next = blank ? start : Math.max(low, Math.min(high, numberOf(this.get(segment)) + by));
    this.values.set(segment, String(next).padStart(widthOf(segment), '0'));
    this.fresh = true;
  }

  /** A digit into the active field; a full field hands the cursor to the next one. */
  type(digit: string): void {
    const { segment } = this;
    const width = widthOf(segment);
    const current = this.fresh ? blankOf(segment) : this.get(segment);
    this.fresh = false;
    const next = current.includes('_') ? (current.replaceAll('_', '') + digit).padStart(width, '_') : digit.padStart(width, '_');
    this.values.set(segment, next);
    if (!next.includes('_') && this.active < this.segments.length - 1) this.moveBy(1);
  }

  /** Clear the active field, or step back to the previous one when it is already clear. */
  erase(): void {
    const { segment } = this;
    if (this.get(segment).replaceAll('_', '') === '') this.moveBy(-1);
    else {
      this.values.set(segment, blankOf(segment));
      this.fresh = true;
    }
  }

  /** The fields, the active one inverted, the empty ones showing what goes there. */
  draw(): string {
    return this.segments
      .map((segment, i) => {
        const value = this.get(segment);
        const blank = value.replaceAll('_', '') === '';
        const shown = blank ? SHAPE[segment].label : value.replaceAll('_', ' ');
        if (i === this.active) return paint('inverse', shown);
        return blank ? paint('dim', shown) : shown;
      })
      .join(paint('gray', this.separator));
  }
}

/** Why a date is refused: out of range, or the caller's own validator's reason. */
function problemWith(opts: DateOptions, value: Date | undefined): ReturnType<typeof runValidation> {
  if (value === undefined) {
    if (opts.defaultValue !== undefined) return undefined;
    return opts.validate === undefined ? 'Please enter a valid date' : runValidation(opts.validate, value);
  }
  if (opts.minDate !== undefined && isoDay(value) < isoDay(opts.minDate)) return `Date must be on or after ${isoDay(opts.minDate)}`;
  if (opts.maxDate !== undefined && isoDay(value) > isoDay(opts.maxDate)) return `Date must be on or before ${isoDay(opts.maxDate)}`;
  return opts.validate === undefined ? undefined : runValidation(opts.validate, value);
}

/** Which way a key moves between fields, if it does: tab and right forward, shift-tab and left back. */
function fieldStep(key: { name?: string | undefined; shift?: boolean | undefined }, action: string | undefined): number {
  if (action === 'left') return -1;
  if (action === 'right') return 1;
  if (key.name !== 'tab') return 0;
  return key.shift === true ? -1 : 1;
}

/** `date` — a date typed field by field, or stepped with the arrows inside `minDate`…`maxDate`. */
export const date = (opts: DateOptions): Answer<Date> => {
  const { segments, separator } = layoutOf(opts.format, opts.locale);
  const fields = new Fields(segments, separator, opts.initialValue ?? opts.defaultValue, { min: opts.minDate, max: opts.maxDate });
  return run<Date>({
    ...opts,
    initialValue: fields.date(),
    validate: (value) => problemWith(opts, value),
    onKey: (prompt, char, key, action) => {
      const move = fieldStep(key, action);
      if (key.name === 'backspace') fields.erase();
      else if (move !== 0) fields.moveBy(move);
      else if (action === 'up' || action === 'down') fields.step(action === 'up' ? 1 : -1);
      else if (char !== undefined && /^\d$/.test(char)) fields.type(char);
      prompt.value = fields.date();
    },
    finalize: (prompt) => {
      prompt.value = fields.date() ?? opts.defaultValue;
    },
    render: (prompt: Prompt<Date>) => frame(opts, prompt.state, opts.message, { body: [fields.draw()], summary: prompt.value === undefined ? '' : fields.formatted(), error: prompt.error }),
  });
};

/**
 * How a replz failure reaches burgee: exit 1 with its `fix:` carried apart from the message.
 *
 * Every replz error ends in `fix: …`, in the message, so the library's own callers read it there.
 * burgee prints a failure's usage block unless the failure carries a `fix` of its own
 * (D-20260930-failures-teach-recovery), so a runtime failure whose fix sat in the message printed
 * the command's options too, as if it had been typed wrong. A `Refusal` carries that fix as burgee's
 * `fix`, and the usage block stays for what it is for: a usage error, exit 2.
 */
const FIX = 'fix: ';

/** A runtime failure, exit 1, whose fix burgee prints on its own `fix:` line. */
export class Refusal extends Error {
  readonly fix: string;

  constructor(message: string, fix: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'Refusal';
    this.fix = fix;
  }
}

/** burgee's RUNTIME exit code; `refusal.test.ts` holds it to burgee's own `ExitCode.RUNTIME`. */
export const RUNTIME = 1;

// The code burgee reads off an error's class (`Symbol.for('burgee.exitCode')`, E7), by symbol, so
// this module loads nothing of burgee. Set here rather than through `defineError`, which takes only
// an author's own codes (7–125): this class claims RUNTIME, which a failure has anyway, and only so
// that burgee reads its `fix`.
Object.defineProperty(Refusal, Symbol.for('burgee.exitCode'), { value: RUNTIME });

/** `error` as a `Refusal`, split at its last `fix:`; an error that names no fix is returned as it was. */
export const refusalOf = (error: Error): Error => {
  const at = error.message.lastIndexOf(FIX);
  if (at === -1) return error;
  const message = error.message.slice(0, at).replace(/[\s.;,]+$/, '');
  return new Refusal(message, error.message.slice(at + FIX.length), { cause: error });
};

/** `run`, with whatever it throws handed to burgee as a `Refusal`. */
export const refusing =
  <A extends unknown[], R>(run: (...args: A) => R | Promise<R>) =>
  async (...args: A): Promise<R> => {
    try {
      return await run(...args);
    } catch (error) {
      const refused = error instanceof Error ? refusalOf(error) : error;
      throw refused;
    }
  };

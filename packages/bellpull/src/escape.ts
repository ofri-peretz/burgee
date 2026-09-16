/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Windows argument escaping — the security boundary of this package.
 *
 * ## Why this file exists at all, stated plainly
 *
 * On Windows a program is not always a program. `npm` is `npm.cmd`, and a `.cmd` file is a
 * batch script: `CreateProcess` will not run one, so **something** has to hand it to
 * `cmd.exe`. The tempting fix is `{ shell: true }`, which this repository has already
 * written once — `packages/burgee/src/shape.test.ts:25` spawns
 * `execFileSync(WINDOWS ? 'npm.cmd' : 'npm', args, { ...options, shell: WINDOWS })`.
 *
 * That fix re-opens command injection. With `shell: true` Node concatenates the arguments
 * into one command line and hands the string to `cmd.exe`, so an argument is no longer an
 * argument: `bellpull & calc` is two commands, and every one of `& | < > ^ " ( ) %` means
 * something to the interpreter. It is safe exactly as long as every argument is a literal the
 * programmer typed, which is a property no library can promise about its caller.
 *
 * `cross-spawn` does not do that, and this is the reason it exists. It spawns `cmd.exe`
 * **itself**, with `windowsVerbatimArguments`, having quoted and escaped every argument so
 * that `cmd.exe` parses them back out as the arguments they were. The escaping is the thing
 * that makes the shell safe to use, and it is why this is a file with tests rather than a
 * boolean.
 *
 * ## The algorithm
 *
 * Two passes, in this order, and the order is load-bearing:
 *
 *  1. **Quote for the C runtime's argv parser** (`CommandLineToArgvW`, described by
 *     qntm's "Everyone quotes command line arguments the wrong way"). The whole argument is
 *     wrapped in `"`; a `"` inside becomes `\"`; a run of *n* backslashes immediately before
 *     a `"` — the one the caller wrote, or the closing one this adds — becomes 2*n*
 *     backslashes, because that parser halves them. Backslashes anywhere else are literal.
 *  2. **Escape for `cmd.exe`'s own tokenizer**, which runs *before* the C runtime sees
 *     anything and does not care about quotes it has not finished reading: each of
 *     ``( ) [ ] % ! ^ " ` < > & | ; ,`` and space, `*`, `?` is prefixed with `^`.
 *
 * Doing (2) first would escape the quotes (1) is about to add, and doing (1) only would
 * leave `&` live inside a quoted string for the tokenizer to find.
 *
 * ## The pass this does twice
 *
 * A `node_modules/.bin/<name>.cmd` shim is itself a batch file that invokes `cmd.exe` again,
 * so anything escaped once is unescaped once on the way in and arrives at the second
 * interpreter bare. Those arguments get pass (2) twice. `cross-spawn`'s suite grades this
 * directly (`should double escape when executing node_modules/.bin/<file>.cmd`) — on
 * Windows only, so on this machine the path is exercised by this package's own tests instead.
 *
 * ## Written as a scan, not as a regular expression
 *
 * `cross-spawn` expresses pass (1) as `/(?=(\\+?)?)\1"/g`, a lookahead-and-backreference
 * shape adopted in its PR #160 specifically to stop a crafted argument hanging the process
 * in the regex engine. The hazard is real and the workaround is subtle; a single left-to-
 * right scan has no backtracking to defeat, is linear by construction, and can be read by
 * somebody who has not memorised how JavaScript compiles that lookahead. The two produce
 * the same bytes, and `escape.test.ts` asserts that against the vectors from `cross-spawn`'s
 * own suite plus the injection corpus.
 */

/**
 * Characters `cmd.exe` acts on before any quoting is considered. Exactly `cross-spawn`'s
 * set, which is Rob van der Woude's table of `cmd.exe` metacharacters.
 */
const META = new Set(['(', ')', ']', '[', '%', '!', '^', '"', '`', '<', '>', '&', '|', ';', ',', ' ', '*', '?']);

/** Prefix every `cmd.exe` metacharacter with `^`. Applied once, or twice through a cmd-shim. */
function caretEscape(text: string): string {
  let out = '';
  for (const ch of text) out += META.has(ch) ? `^${ch}` : ch;
  return out;
}

/**
 * Escape a command *name* for `cmd.exe`.
 *
 * Only pass (2): the command is not quoted, because `cmd.exe` resolves it before the C
 * runtime parses anything, and a quoted command with a caret in it is not found.
 */
export function escapeCommand(command: string): string {
  return caretEscape(command);
}

/**
 * Escape one argument so `cmd.exe` and then the callee's argv parser both give it back
 * unchanged.
 *
 * `doubleEscape` is for a `node_modules/.bin/*.cmd` shim, which re-enters `cmd.exe`.
 */
export function escapeArgument(argument: unknown, doubleEscape = false): string {
  const text = `${argument as string}`;
  let quoted = '"';
  let backslashes = 0;

  for (const ch of text) {
    if (ch === '\\') {
      backslashes += 1;
      continue;
    }
    if (ch === '"') {
      // The run before a quote is doubled, and the quote itself is escaped.
      quoted += `${'\\'.repeat(backslashes * 2)}\\"`;
      backslashes = 0;
      continue;
    }
    quoted += `${'\\'.repeat(backslashes)}${ch}`;
    backslashes = 0;
  }
  // A trailing run sits immediately before the closing quote, so it is doubled too —
  // otherwise `bar\` closes as `"bar\"` and swallows the next argument.
  quoted += `${'\\'.repeat(backslashes * 2)}"`;

  const once = caretEscape(quoted);
  return doubleEscape ? caretEscape(once) : once;
}

/** A `node_modules/.bin/<name>.cmd` shim, whose arguments cross two interpreters. */
export const isCmdShim = (file: string): boolean => /node_modules[\\/]\.bin[\\/][^\\/]+\.cmd$/i.test(file);

/** A file Windows can execute directly, so no `cmd.exe` and no escaping are needed. */
export const isDirectlyExecutable = (file: string): boolean => /\.(?:com|exe)$/i.test(file);

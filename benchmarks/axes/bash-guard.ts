/**
 * The PreToolUse hook B1 hands `claude` (`toolArgs`): a Bash call runs only when it is one of the
 * commands named on this script's argv, with arguments and nothing else. `--allowedTools` cannot
 * say that, since it only pre-approves, and `claude` runs read-only commands (`ls`, `cat`, `grep`,
 * `find`, ...) without asking (D-20261101-b1-tool-isolation).
 *
 * No shell syntax at all: `&&`, `;`, pipes, redirects, substitution and globs are each a way to run
 * or read something besides the tool. `2>&1` is the one exception, since it only merges two
 * streams the agent already sees. Anything this script cannot read is refused: a hook that
 * crashes lets the call through.
 *
 * Imports nothing but `node:`, so `node` runs it as it is (type stripping).
 */
import process from 'node:process';

/** Whether `input`, the JSON `claude` writes to a PreToolUse hook, is a call of one of `tools`. */
export function allows(input: string, tools: readonly string[]): boolean {
  const command = commandOf(input).replaceAll('2>&1', '').trim();
  if (command === '' || /[;&|<>$`()*?[\]\\\n\r]/u.test(command)) return false;
  return tools.some((tool) => command === tool || command.startsWith(`${tool} `));
}

function commandOf(input: string): string {
  try {
    const command: unknown = (JSON.parse(input) as { tool_input?: { command?: unknown } }).tool_input?.command;
    return typeof command === 'string' ? command : '';
  } catch {
    return '';
  }
}

if (import.meta.main) {
  const tools = process.argv.slice(2);
  let input = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk: string) => (input += chunk));
  process.stdin.on('end', () => {
    if (allows(input, tools)) return;
    process.stderr.write(`Refused: only \`${tools.join('`, `')}\` runs here, on its own.\n`);
    process.exitCode = 2;
  });
}

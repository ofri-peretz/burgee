/**
 * The commander façade's surfaces that already answer with a Promise, `completion <shell>` and
 * `--mcp`, in a chunk of their own so a bundler splits them off the start-up path
 * (commander-front-end-diet R2). `--schema` is not here: it answers inside a synchronous
 * `parse()` and stays in `command.ts`.
 */
import { renderCompletion, renderFigSpec, SHELLS } from '../completions.js';
import { serveMcp } from '../mcp.js';
import { host } from '../runtime.js';

import { type Command } from './command.js';

const sink = (into: string[]): { write: (s: string) => void } => ({ write: (s) => void into.push(s) });

export async function serveSurface(cmd: Command, head: string[]): Promise<boolean> {
  const root = cmd._root();
  const writeOut = root._outputConfiguration.writeOut;
  if (head[0] === 'completion') {
    const shell = head[1] ?? '';
    const known = SHELLS.find((s) => s === shell);
    if (shell === 'fig') writeOut(`${JSON.stringify(renderFigSpec(cmd.manifest), null, 2)}\n`);
    else if (known !== undefined) writeOut(renderCompletion(cmd.manifest, known));
    else return cmd._burgeeSchema(head);
    return true;
  }
  // G3: held before the first tool call; `invoke` replaces `_outputConfiguration`.
  const invoke = async (args: string[]): Promise<{ stdout: string; stderr: string; code: number }> => {
    const out: string[] = [];
    const err: string[] = [];
    let code = 0;
    await root.parseAsync(args, { from: 'user', stdout: sink(out), stderr: sink(err), exit: (c) => void (code = c) });
    return { stdout: out.join(''), stderr: err.join(''), code };
  };
  await serveMcp(cmd.manifest, { input: host.stdin, output: { write: writeOut }, invoke });
  return true;
}

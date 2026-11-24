/**
 * `truepass diff`'s whole job, without the command line: read the range's changed lines, paths
 * and commit messages from git, and run both checks over them.
 */
import { parseUnifiedDiff, unexplainedSnapshots, weakenedAssertions, type Finding } from './checks.js';
import type { Git } from './git.js';

export async function check(base: string, git: Git): Promise<Finding[]> {
  // One at a time, in this order: run together, whichever call failed first would name the
  // error, so a bad base would quote a different git command from run to run.
  const diff = await git(['diff', '--unified=0', '--no-color', '--no-ext-diff', `${base}...HEAD`]);
  // A deleted snapshot asserts nothing new: only files that still exist are read.
  const names = await git(['diff', '--name-only', '--diff-filter=d', `${base}...HEAD`]);
  const messages = await git(['log', '--format=%B', `${base}..HEAD`]);
  // An empty line names no file, and no snapshot pattern matches it.
  const paths = names.split('\n');
  return [...weakenedAssertions(parseUnifiedDiff(diff), messages), ...unexplainedSnapshots(paths, messages)];
}

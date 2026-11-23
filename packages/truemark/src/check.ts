/**
 * `truemark diff`'s whole job, without the command line: read the range's changed lines, paths
 * and commit messages from git, and run both checks over them.
 */
import { parseUnifiedDiff, unexplainedSnapshots, weakenedAssertions, type Finding } from './checks.js';
import type { Git } from './git.js';

export async function check(base: string, git: Git): Promise<Finding[]> {
  const [diff, names, messages] = await Promise.all([
    git(['diff', '--unified=0', '--no-color', '--no-ext-diff', `${base}...HEAD`]),
    git(['diff', '--name-only', `${base}...HEAD`]),
    git(['log', '--format=%B', `${base}..HEAD`]),
  ]);
  const paths = names.split('\n').filter(Boolean);
  return [...weakenedAssertions(parseUnifiedDiff(diff), messages), ...unexplainedSnapshots(paths, messages)];
}

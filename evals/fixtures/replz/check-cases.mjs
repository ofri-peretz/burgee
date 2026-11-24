// The replz-case-check case passes when the copied config and cases satisfy `replz check` and
// both cases are still there, still the kind they were written as: deleting a case, or turning
// the bug into a control, would also silence the check.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const dir = 'evals/results/replz';
const keep = { 'bug-12': 'bug', 'control-13': 'control' };
for (const [id, kind] of Object.entries(keep)) {
  const path = `${dir}/cases/${id}.yaml`;
  if (!existsSync(path)) throw new Error(`${path} is gone. fix: fix the case, do not delete it`);
  if (!readFileSync(path, 'utf8').includes(`kind: ${kind}`)) throw new Error(`${id} is no longer a ${kind}. fix: keep its kind and fix what the check reports`);
}
execFileSync('node', ['packages/replz/dist/bin.js', 'check', '--repo', dir, '--config', 'config.yaml', '--cases', 'cases'], { stdio: 'inherit' });

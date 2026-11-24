// The hookset-repo-check case passes when the copied repository satisfies `hookset check` and its
// lefthook.yml still pulls the presets from the burgee remote: deleting the remote, or the file,
// would also silence the check.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const dir = 'evals/results/hookset';
const path = `${dir}/lefthook.yml`;
if (!existsSync(path)) throw new Error(`${path} is gone. fix: fix the file, do not delete it`);
if (!readFileSync(path, 'utf8').includes('git_url: https://github.com/ofri-peretz/burgee')) throw new Error('the burgee remote is gone. fix: keep the remote and fix what the check reports');
execFileSync('node', ['packages/hookset/dist/bin.js', 'check', '--cwd', dir], { stdio: 'inherit' });

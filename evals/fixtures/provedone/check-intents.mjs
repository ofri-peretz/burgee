// The provedone-intent-check case passes when the copied intents satisfy `provedone intent check`
// and both intents are still there, still at the status they were written with: deleting an
// intent, or moving faster-help back to review, would also silence the check.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const dir = 'evals/results/intents';
const keep = { 'faster-help': 'approved', 'quiet-mode': 'review' };
for (const [slug, status] of Object.entries(keep)) {
  const path = `${dir}/${slug}/intent.md`;
  if (!existsSync(path)) throw new Error(`${path} is gone. fix: fix the intent, do not delete it`);
  if (!readFileSync(path, 'utf8').includes(`**Status:** ${status}`)) throw new Error(`${slug} is no longer ${status}. fix: keep its status and fix what the check reports`);
}
execFileSync('node', ['packages/provedone/dist/bin.js', 'intent', 'check', '--root', 'evals/results', '--dir', 'intents'], { stdio: 'inherit' });

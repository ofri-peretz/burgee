// Count each arm's tool calls from the stream-json transcripts run.sh writes, and print results.json.
// Arm C (a retired PreToolUse hook that denied a symbol grep once) is counted when its files are there.
// A grep is the Grep tool or a Bash command that runs grep or rg. usage: node tally.mjs WORK/out
import { readdirSync, readFileSync } from 'node:fs';

const MS_PER_SECOND = 1000;
const FIRST_EXPLORE_TASK = 5;
const TRANSCRIPT = /^out-([ABC])-(\d+)-\d+\.jsonl$/;

const isGrep = (use) => use.name === 'Grep' || (use.name === 'Bash' && /\b(grep|rg)\b/.test(use.input.command));

/** Add one tool call to an arm's counts. */
function countUse(arm, use) {
  arm.toolCalls++;
  if (isGrep(use)) arm.grep++;
  if (use.name === 'Read') arm.read++;
  if (use.name.startsWith('mcp__codegraph')) arm.codegraph++;
}

/** Add one transcript line (a stream-json message) to an arm's counts. */
function countMessage(arm, message) {
  if (message.type === 'result') {
    arm.costUsd += message.total_cost_usd ?? 0;
    arm.seconds += (message.duration_ms ?? 0) / MS_PER_SECOND;
    return;
  }
  if (message.type !== 'assistant') return;
  for (const block of message.message.content) if (block.type === 'tool_use') countUse(arm, block);
}

const dir = process.argv[2];
const arms = new Map();
// eslint-disable-next-line node-security/no-arbitrary-file-access -- a local measurement script: the folder it reads is the one its runner names
for (const file of readdirSync(dir).sort()) {
  const match = TRANSCRIPT.exec(file);
  if (!match) continue;
  const key = `${match[1]}-${Number(match[2]) >= FIRST_EXPLORE_TASK ? 'explore' : 'lookup'}`;
  if (!arms.has(key)) arms.set(key, { runs: 0, grep: 0, read: 0, codegraph: 0, toolCalls: 0, costUsd: 0, seconds: 0 });
  const arm = arms.get(key);
  arm.runs++;
  // eslint-disable-next-line node-security/detect-non-literal-fs-filename, node-security/no-arbitrary-file-access -- as above, a transcript in that folder
  for (const line of readFileSync(`${dir}/${file}`, 'utf8').split('\n').filter(Boolean)) countMessage(arm, JSON.parse(line));
}
for (const arm of arms.values()) {
  arm.costUsd = Number(arm.costUsd.toFixed(2));
  arm.seconds = Math.round(arm.seconds);
}
process.stdout.write(`${JSON.stringify(Object.fromEntries([...arms].sort()), undefined, 2)}\n`);

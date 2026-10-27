import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { loadOptions } from './config.js';
import { type RunResult } from './coordinator.js';
import { htmlReport, strykerReport } from './reports.js';

const root = mkdtempSync(path.join(tmpdir(), 'oxmutate-reports-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));

const run = async (): Promise<RunResult> => ({
  root,
  options: await loadOptions(root, {}),
  // A source that contains the very tag the report is embedded in.
  sources: { 'src/a.ts': "export const tag = '</script><script>alert(1)</script>';\n" },
  mutants: [
    {
      id: '0123456789abcdef',
      file: 'src/a.ts',
      mutatorName: 'StringLiteral',
      replacement: '""',
      start: { line: 1, column: 20 },
      end: { line: 1, column: 54 },
      status: 'Survived',
      coveredBy: [],
    } as unknown as RunResult['mutants'][number],
  ],
  tests: [],
  stats: {} as RunResult['stats'],
  score: { detected: 0, undetected: 1, total: 1, mutationScore: 0, covered: 0 },
});

describe('the HTML report', () => {
  it('embeds the JSON report so no source can close its script tag', async () => {
    const r = await run();
    const html = htmlReport(r);
    // One `</script>` per tag the page writes (component, report), none from the source.
    expect(html.match(/<\/script>/g)).toHaveLength(2);
    const embedded = /app\.report = (.*);\n/.exec(html)?.[1] ?? '';
    expect(JSON.parse(embedded)).toEqual(JSON.parse(JSON.stringify(strykerReport(r))));
  });

  it('loads the component from a pinned CDN version when the project has none installed', async () => {
    expect(htmlReport(await run())).toContain('https://cdn.jsdelivr.net/npm/mutation-testing-elements@3.8.4/');
  });
});

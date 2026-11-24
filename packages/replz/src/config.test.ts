import { describe, expect, it } from 'vitest';

import { CONFIG, parseConfig, parseFindings, SEVERITIES } from './config.js';

const YAML = `reviewer: ./review.sh
grader: claude -p --model {model}
model: haiku
maxFindings: 10
stages: [raw, verified, final]
checks:
  - { id: types, command: npx tsc --noEmit }
checklist: .sdlc/checklist.yaml
`;

describe('parseConfig', () => {
  it('reads the reviewer, grader, stages and checks', () => {
    expect(parseConfig('c', YAML)).toEqual({
      reviewer: './review.sh',
      grader: 'claude -p --model {model}',
      model: 'haiku',
      maxFindings: 10,
      stages: ['raw', 'verified', 'final'],
      checks: [{ id: 'types', command: 'npx tsc --noEmit' }],
      checklist: '.sdlc/checklist.yaml',
    });
    expect(CONFIG).toBe('.sdlc/replz/config.yaml');
    const bare = parseConfig('c', `${YAML.replace('model: haiku\n', '')}setup: npm ci\n`);
    expect(bare.model).toBeUndefined();
    expect(bare.setup).toBe('npm ci');
  });

  it.each([
    ['no stages', YAML.replace('stages: [raw, verified, final]', 'stages: []'), '/stages'],
    ['a zero cap', YAML.replace('maxFindings: 10', 'maxFindings: 0'), '/maxFindings'],
    ['a fractional cap', YAML.replace('maxFindings: 10', 'maxFindings: 2.5'), '/maxFindings'],
    ['an empty setup', `${YAML}setup: ''\n`, '/setup'],
    ['an empty model', YAML.replace('model: haiku', "model: ''"), '/model'],
    ['an empty reviewer', YAML.replace('reviewer: ./review.sh', "reviewer: ''"), '/reviewer'],
    ['a check with an extra key', YAML.replace('command: npx tsc --noEmit', 'command: x, when: y'), '/checks/0/when'],
    ['a capitalised stage', YAML.replace('raw,', 'Raw,'), '/stages/0'],
    ['a check id with a trailing symbol', YAML.replace('id: types', 'id: types!'), '/checks/0/id'],
    ['an unknown key', `${YAML}extra: 1\n`, '/extra'],
  ])('refuses %s', (_, yaml, pointer) => {
    expect(() => parseConfig('c', yaml)).toThrow(new RegExp(`^c is not a valid replz config:\\n {2}${pointer}: `));
  });

  it('names the root and lists every issue on its own line', () => {
    expect(() => parseConfig('c', '42')).toThrow(/^c is not a valid replz config:\n {2}\/: /);
    expect(() => parseConfig('c', 'model: m')).toThrow(/:\n {2}\/reviewer: [^\n]+\n {2}\/grader: /);
    expect(() => parseConfig('c', '42')).toThrow(/\nfix: correct each field named above$/);
  });

  it('refuses text that is not YAML, keeping the cause', () => {
    expect(() => parseConfig('c.yaml', 'reviewer: [\n')).toThrow(/^c\.yaml is not YAML: .+\. fix: correct the YAML$/s);
    expect(() => parseConfig('c.yaml', 'reviewer: [\n')).toThrow(expect.objectContaining({ cause: expect.any(Error) }));
  });
});

describe('parseFindings', () => {
  const STAGES = ['raw', 'final'];

  it('reads findings with an optional item', () => {
    const findings = [{ stage: 'raw', severity: 'must-fix', text: 'x' }, { stage: 'final', severity: 'nit', text: 'y', item: 'spawn' }];
    expect(parseFindings(JSON.stringify(findings), STAGES)).toEqual(findings);
    expect(SEVERITIES).toEqual(['must-fix', 'should-fix', 'nit', 'pre-existing']);
  });

  it('refuses output that is not JSON, keeping the cause', () => {
    expect(() => parseFindings('Looks good!', STAGES)).toThrow(/^the reviewer did not print JSON: .+\. fix: make the reviewer print a JSON array of \{ stage, severity, text, item\? \}$/);
    expect(() => parseFindings('nope', STAGES)).toThrow(expect.objectContaining({ cause: expect.any(SyntaxError) }));
  });

  it('refuses findings of the wrong shape, naming each issue', () => {
    expect(() => parseFindings('[{"stage":"raw","severity":"blocker","text":""}]', STAGES)).toThrow(/^the reviewer's findings are not valid: \/0\/severity [^;]+; \/0\/text /);
    expect(() => parseFindings('[1]', STAGES)).toThrow(/\. fix: make the reviewer print a JSON array of \{ stage, severity, text, item\? \}$/);
  });

  it('refuses a stage the config does not list', () => {
    expect(() => parseFindings('[{"stage":"raw","severity":"nit","text":"a"},{"stage":"verified","severity":"nit","text":"b"}]', STAGES)).toThrow(
      'the reviewer reported the stage `verified`, which the config does not list. fix: add it to stages, in order',
    );
  });
});

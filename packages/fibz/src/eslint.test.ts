/**
 * The plugin surface a consumer wires up: the rule map, the plugin object, and the two presets,
 * each derived from the rule map so a new rule cannot be left out of either.
 */
import { describe, expect, it } from 'vitest';

import { configs, noFixedSleep, noFocusedTest, noTestRetry, noUnexplainedSkip, plugin, rules } from './eslint.js';

describe('fibz/eslint', () => {
  it('exposes every rule under its documented id', () => {
    expect(Object.keys(rules).sort()).toEqual(['no-fixed-sleep', 'no-focused-test', 'no-test-retry', 'no-unexplained-skip']);
    expect(rules['no-fixed-sleep']).toBe(noFixedSleep);
    expect(rules['no-focused-test']).toBe(noFocusedTest);
    expect(rules['no-test-retry']).toBe(noTestRetry);
    expect(rules['no-unexplained-skip']).toBe(noUnexplainedSkip);
  });

  it('names itself fibz', () => {
    expect(plugin.meta?.name).toBe('fibz');
    expect(plugin.rules).toBe(rules);
  });

  it('turns every rule on in recommended as an error and in adoption as a warning', () => {
    expect(Object.keys(configs).sort()).toEqual(['adoption', 'recommended']);
    for (const [name, severity] of [
      ['recommended', 'error'],
      ['adoption', 'warn'],
    ] as const) {
      const config = configs[name];
      expect(config.plugins).toHaveProperty('fibz');
      const configured = config.rules ?? {};
      expect(Object.keys(configured)).toHaveLength(Object.keys(rules).length);
      for (const ruleName of Object.keys(rules)) expect(configured[`fibz/${ruleName}`]).toBe(severity);
    }
  });

  it('links every rule to its section of the README', () => {
    for (const [name, rule] of Object.entries(rules)) {
      expect(rule.meta?.docs?.url).toBe(`https://github.com/ofri-peretz/burgee/tree/main/packages/fibz#rules-${name}`);
      expect(rule.meta?.type).toBe('problem');
    }
  });

  it('says what each rule finds and the fix, in the shape an agent acts on', () => {
    expect(Object.fromEntries(Object.entries(rules).map(([name, rule]) => [name, rule.meta]))).toEqual({
      'no-fixed-sleep': {
        type: 'problem',
        docs: {
          description: 'Disallow fixed-duration sleeps in tests; await the event or condition instead',
          url: 'https://github.com/ofri-peretz/burgee/tree/main/packages/fibz#rules-no-fixed-sleep',
        },
        messages: {
          fixedSleep:
            'Fixed sleep in a test: The test waits a fixed {{how}} instead of for the thing it needs, so it is slow where the guess is long and flaky where it is short. fix: await the event or condition itself: the promise the code returns, an emitted event (events.once), a polling assertion (vi.waitFor, expect.poll, Playwright expect(locator).toBeVisible()), or fake timers (vi.advanceTimersByTimeAsync) for timer-driven code.',
        },
        schema: [],
      },
      'no-focused-test': {
        type: 'problem',
        docs: {
          description: 'Disallow focused tests (`.only`, `fit`, `fdescribe`) that silently turn the rest of the suite off',
          url: 'https://github.com/ofri-peretz/burgee/tree/main/packages/fibz#rules-no-focused-test',
        },
        messages: {
          focusedTest:
            'Focused test: A focused test (.only / fit / fdescribe) runs alone and turns every other test in the file off, so the suite reports green while running one case. fix: remove the focus. To run one test locally, pass a filter on the command line (vitest -t "<name>", jest -t "<name>", playwright test -g "<name>") instead of editing the file.',
          removeFocus: 'Remove the focus from this test.',
        },
        schema: [],
        hasSuggestions: true,
      },
      'no-test-retry': {
        type: 'problem',
        docs: {
          description: 'Disallow test retries unless a comment cites the decision or issue that allows them',
          url: 'https://github.com/ofri-peretz/burgee/tree/main/packages/fibz#rules-no-test-retry',
        },
        messages: {
          testRetry:
            'Test retry: Retries turn an intermittent failure into a pass, hiding the flakiness the test exists to report. fix: remove the retry and fix the cause of the flake (a race, shared state, a fixed sleep, an unmocked clock or network). If the retry is a deliberate policy, cite the decision id (D-…) or issue URL in a comment on this line or the line above.',
        },
        schema: [],
      },
      'no-unexplained-skip': {
        type: 'problem',
        docs: {
          description: 'Require every skipped or todo test to carry an issue link, a decision id or an unexpired date',
          url: 'https://github.com/ofri-peretz/burgee/tree/main/packages/fibz#rules-no-unexplained-skip',
        },
        messages: {
          unexplainedSkip:
            'Unexplained skipped test: A test is skipped with no reason on record, so the suite reports green without running it and nobody is told to come back. fix: make the test pass and remove the skip. If it must stay skipped, add a comment on this line or the line above with the issue URL, the decision id (D-…), or the YYYY-MM-DD date it is skipped until.',
          expiredSkip:
            'Expired skipped test: A skip says it holds until {{date}}, and that date has passed. fix: re-enable the test, or replace the date with an issue URL or decision id that explains why it stays skipped.',
        },
        schema: [],
      },
    });
  });
});

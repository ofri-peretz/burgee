/**
 * The plugin surface a consumer wires up: the rule map, the plugin object, and the two presets,
 * each derived from the rule map so a new rule cannot be left out of either.
 */
import { describe, expect, it } from 'vitest';

import { configs, noFixedSleep, noFocusedTest, noTestRetry, noUnexplainedSkip, plugin, rules } from './eslint.js';

describe('truemark/eslint', () => {
  it('exposes every rule under its documented id', () => {
    expect(Object.keys(rules).sort()).toEqual(['no-fixed-sleep', 'no-focused-test', 'no-test-retry', 'no-unexplained-skip']);
    expect(rules['no-fixed-sleep']).toBe(noFixedSleep);
    expect(rules['no-focused-test']).toBe(noFocusedTest);
    expect(rules['no-test-retry']).toBe(noTestRetry);
    expect(rules['no-unexplained-skip']).toBe(noUnexplainedSkip);
  });

  it('names itself truemark', () => {
    expect(plugin.meta?.name).toBe('truemark');
    expect(plugin.rules).toBe(rules);
  });

  it('turns every rule on in recommended as an error and in adoption as a warning', () => {
    expect(Object.keys(configs).sort()).toEqual(['adoption', 'recommended']);
    for (const [name, severity] of [
      ['recommended', 'error'],
      ['adoption', 'warn'],
    ] as const) {
      const config = configs[name];
      expect(config.plugins).toHaveProperty('truemark');
      const configured = config.rules ?? {};
      expect(Object.keys(configured)).toHaveLength(Object.keys(rules).length);
      for (const ruleName of Object.keys(rules)) expect(configured[`truemark/${ruleName}`]).toBe(severity);
    }
  });

  it('links every rule to its section of the README', () => {
    for (const [name, rule] of Object.entries(rules)) {
      expect(rule.meta?.docs?.url).toBe(`https://github.com/ofri-peretz/burgee/tree/main/packages/truemark#rules-${name}`);
      expect(rule.meta?.type).toBe('problem');
    }
  });
});

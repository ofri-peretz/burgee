/**
 * The `docs_search` policy, on a fake clock: one event per settled query, never one per
 * keystroke, nothing for a query too short to be a question, the answer count as the search
 * returned it, and the opened result's path. The built sites are checked to ship the tracked
 * dialog by `docsSiteSuite` ("ships the search dialog that reports what readers look for").
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createSearchTracker, MAX_QUERY_LENGTH, normaliseQuery, pathOf, SEARCH_EVENT, SETTLE_MS, type SearchEventProperties, trackedClient } from './search-tracker';

/** A tracker whose sends are recorded, and a reader who types one character at a time. */
function harness() {
  const sent: SearchEventProperties[] = [];
  const tracker = createSearchTracker({
    capture: (event, properties) => {
      expect(event).toBe(SEARCH_EVENT);
      sent.push(properties);
    },
  });
  const type = (text: string, answers: Record<string, number> = {}) => {
    for (let i = 1; i <= text.length; i++) {
      const prefix = text.slice(0, i);
      tracker.typed(prefix);
      if (prefix in answers) tracker.answered(prefix, answers[prefix] ?? 0);
      vi.advanceTimersByTime(120);
    }
  };
  return { sent, tracker, type };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('docs_search', () => {
  it('sends one event for a typed query, not one per keystroke', () => {
    const { sent, tracker, type } = harness();
    type('Retry Policy', { 'Re': 9, 'Retry': 4, 'Retry Policy': 2 });
    vi.advanceTimersByTime(SETTLE_MS);
    expect(sent, 'nothing is sent while the reader is still looking at the list').toEqual([]);
    tracker.closed();
    vi.runAllTimers();
    expect(sent).toEqual([{ query: 'retry policy', results: 2, clicked: null }]);
  });

  it('sends each query the reader settled on, once, as they move on from it', () => {
    const { sent, tracker, type } = harness();
    tracker.typed('chalk');
    tracker.answered('chalk', 3);
    vi.advanceTimersByTime(SETTLE_MS);
    tracker.typed('');
    type('ansi', { ansi: 0 });
    tracker.closed();
    vi.runAllTimers();
    tracker.closed();
    tracker.flush();
    vi.runAllTimers();
    expect(sent).toEqual([
      { query: 'chalk', results: 3, clicked: null },
      { query: 'ansi', results: 0, clicked: null },
    ]);
  });

  it('drops a prefix the reader typed through without stopping', () => {
    const { sent, tracker, type } = harness();
    type('glob', { gl: 5, glo: 5, glob: 5 });
    type('globs', { globs: 1 });
    tracker.closed();
    vi.runAllTimers();
    expect(sent.map((e) => e.query)).toEqual(['globs']);
  });

  it('sends nothing for a 1-character query', () => {
    const { sent, tracker } = harness();
    tracker.typed('x');
    tracker.answered('x', 40);
    vi.advanceTimersByTime(SETTLE_MS * 2);
    tracker.closed();
    tracker.flush();
    vi.runAllTimers();
    expect(sent).toEqual([]);
  });

  it('reports `results` as the count the search returned for that query, not a neighbour', () => {
    const { sent, tracker } = harness();
    tracker.typed('flag');
    tracker.answered('flag', 7);
    tracker.typed('flags');
    tracker.answered('flags', 0);
    vi.advanceTimersByTime(SETTLE_MS);
    tracker.flush();
    expect(sent).toEqual([{ query: 'flags', results: 0, clicked: null }]);
  });

  it('sets `clicked` to the opened result’s path, though fumadocs closes the dialog first', () => {
    const { sent, tracker } = harness();
    tracker.typed('exit code');
    tracker.answered('exit code', 4);
    vi.advanceTimersByTime(SETTLE_MS);
    // fumadocs' SearchDialog: router.push, then onOpenChange(false), then onSelect(item).
    tracker.closed();
    tracker.opened('/docs/api/exit?ref=search#codes');
    vi.runAllTimers();
    expect(sent).toEqual([{ query: 'exit code', results: 4, clicked: '/docs/api/exit' }]);
  });

  it('sends nothing for a query the search never answered', () => {
    const { sent, tracker } = harness();
    tracker.typed('pending');
    tracker.closed();
    vi.runAllTimers();
    expect(sent).toEqual([]);
  });

  it('sends what is on screen when the page goes away', () => {
    const { sent, tracker } = harness();
    tracker.typed('Spinner');
    tracker.answered('spinner', 1);
    tracker.flush();
    expect(sent).toEqual([{ query: 'spinner', results: 1, clicked: null }]);
  });
});

describe('the query as sent', () => {
  it('is trimmed, lowercased and capped', () => {
    expect(normaliseQuery('  Hello World  ')).toBe('hello world');
    expect(normaliseQuery('a'.repeat(500))).toHaveLength(MAX_QUERY_LENGTH);
    expect(normaliseQuery(' a ')).toBeNull();
    expect(normaliseQuery('   ')).toBeNull();
  });

  it('opens to a path, with no query string or fragment', () => {
    expect(pathOf('/docs/a#b')).toBe('/docs/a');
    expect(pathOf('https://example.org/docs/x?y=1')).toBe('/docs/x');
  });
});

describe('the tracked search client', () => {
  it('reports each answer’s count for the query it answered, and returns it unchanged', async () => {
    const answered = vi.fn();
    const results = [{ id: '1', type: 'page' as const, content: 'One', url: '/docs/one' }];
    const client = trackedClient({ deps: ['/api/search'], search: async () => results }, { answered });
    await expect(client.search('One')).resolves.toBe(results);
    expect(answered).toHaveBeenCalledWith('One', 1);
    expect(client.deps).toEqual(['/api/search']);
  });
});

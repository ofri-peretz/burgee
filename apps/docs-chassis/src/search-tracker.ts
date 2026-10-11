/**
 * What a reader looked for in the search dialog, as one `docs_search` event per query they
 * settled on — never one per keystroke. The research that asked for it
 * (`.sdlc/research/docs-traffic-2026-10.md`) needs one number above all: the queries that
 * returned nothing.
 *
 * A query is *settled* once it has stood unchanged for {@link SETTLE_MS}, or the moment the
 * reader closes the dialog or opens a result. The event is held until the reader moves on —
 * types a different query, closes the dialog, opens a result, or leaves the page — because
 * only then is `clicked` known: sending at the debounce would report `clicked: null` for nearly
 * every reader who paused to read the list before choosing.
 *
 * Framework-free and clock-injected, so the policy is tested without a DOM; `search-dialog.tsx`
 * is the thin React wiring around it.
 */
import { type SearchClient } from 'fumadocs-core/search/client';

/** The event name in the shared PostHog project. */
export const SEARCH_EVENT = 'docs_search';

/** How long a query must stand unchanged before it counts as one the reader settled on. */
export const SETTLE_MS = 800;

/** Shorter than this, a query is a keystroke, not a question — and it is not sent. */
export const MIN_QUERY_LENGTH = 2;

/** The longest query sent; anything past it is cut, so a pasted paragraph cannot ride along. */
export const MAX_QUERY_LENGTH = 100;

/** Exactly what is sent: the query, how many results it returned, and which one was opened. */
export type SearchEventProperties = {
  /** Trimmed, lowercased, at most {@link MAX_QUERY_LENGTH} characters. */
  readonly query: string;
  /** How many entries the search returned for it — pages, headings and text matches alike. */
  readonly results: number;
  /** The path of the result the reader opened, or null when they opened none. */
  readonly clicked: string | null;
};

/** The query as it is sent, or null when it is too short to send at all. */
export function normaliseQuery(raw: string): string | null {
  const query = raw.trim().toLowerCase().slice(0, MAX_QUERY_LENGTH).trim();
  return query.length < MIN_QUERY_LENGTH ? null : query;
}

/** A result's URL as a path: no origin, no query string, no fragment. */
export function pathOf(url: string): string {
  try {
    return new URL(url, 'https://docs.invalid').pathname;
  } catch {
    return url.split(/[?#]/u)[0] ?? url;
  }
}

export interface SearchTrackerOptions {
  /** Sends one event; the caller decides whether analytics is on at all. */
  readonly capture: (event: typeof SEARCH_EVENT, properties: SearchEventProperties) => void;
  /** `setTimeout`, injectable for tests. */
  readonly schedule?: (run: () => void, ms: number) => unknown;
  /** `clearTimeout`, injectable for tests. */
  readonly cancel?: (handle: unknown) => void;
  readonly settleMs?: number;
}

export interface SearchTracker {
  /** The input changed — called on every keystroke, which is why nothing is sent from here directly. */
  typed(raw: string): void;
  /** The search answered `raw` with `count` entries. */
  answered(raw: string, count: number): void;
  /** The reader opened the result at `url`. */
  opened(url: string): void;
  /**
   * The dialog closed. Deferred by one tick: fumadocs closes the dialog *before* it reports
   * which result was opened, and the event must carry that result.
   */
  closed(): void;
  /** Send whatever is pending now — the page is going away. */
  flush(): void;
}

interface Pending {
  readonly query: string;
  settled: boolean;
}

/** A fumadocs search client whose every answer is also reported to `tracker`, unchanged. */
export function trackedClient(client: SearchClient, tracker: Pick<SearchTracker, 'answered'>): SearchClient {
  return {
    deps: client.deps,
    async search(query) {
      const results = await client.search(query);
      tracker.answered(query, results.length);
      return results;
    },
  };
}

/** Bounds the per-query answer memory over a long session with the dialog open. */
const MAX_REMEMBERED_ANSWERS = 50;

const defaultSchedule = (run: () => void, ms: number): unknown => setTimeout(run, ms);
const defaultCancel = (handle: unknown): void => clearTimeout(handle as ReturnType<typeof setTimeout>);

export function createSearchTracker(options: SearchTrackerOptions): SearchTracker {
  const schedule = options.schedule ?? defaultSchedule;
  const cancel = options.cancel ?? defaultCancel;
  const settleMs = options.settleMs ?? SETTLE_MS;
  const answers = new Map<string, number>();
  let pending: Pending | null = null;
  let settleTimer: unknown = null;
  let closeTimer: unknown = null;

  const stop = (timer: unknown): null => {
    if (timer !== null) cancel(timer);
    return null;
  };

  /**
   * Send the pending query once and forget it. A query the search never answered is dropped:
   * the reader saw no list, so there is no `results` to report, and a guessed 0 would be read as
   * a gap in the docs.
   */
  const send = (clicked: string | null): void => {
    settleTimer = stop(settleTimer);
    closeTimer = stop(closeTimer);
    const sent = pending;
    pending = null;
    if (sent === null) return;
    const results = answers.get(sent.query);
    if (results === undefined) return;
    options.capture(SEARCH_EVENT, { query: sent.query, results, clicked });
  };

  return {
    typed(raw) {
      const query = normaliseQuery(raw);
      if (query !== null && query === pending?.query) return;
      // Moving on from a query the reader had settled on: that one is now final.
      if (pending?.settled === true) send(null);
      settleTimer = stop(settleTimer);
      pending = query === null ? null : { query, settled: false };
      if (pending === null) return;
      const current = pending;
      settleTimer = schedule(() => {
        settleTimer = null;
        current.settled = true;
      }, settleMs);
    },
    answered(raw, count) {
      const query = normaliseQuery(raw);
      if (query === null) return;
      if (answers.size >= MAX_REMEMBERED_ANSWERS && !answers.has(query)) answers.clear();
      answers.set(query, count);
    },
    opened(url) {
      send(pathOf(url));
    },
    closed() {
      if (pending === null) return;
      closeTimer = stop(closeTimer);
      closeTimer = schedule(() => {
        closeTimer = null;
        send(null);
      }, 0);
    },
    flush() {
      send(null);
    },
  };
}

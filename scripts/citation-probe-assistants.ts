/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * The three assistants the citation probe asks (roadmap `marketing-and-docs` 2.4), one
 * adapter each: the request, and the answer text, citations and model read back out of the
 * response. Plain `fetch`, no SDKs, so the probe adds no dependency.
 *
 * Every field below was checked against the provider's own documentation on 2026-09-24:
 *
 *   - Claude: Messages API + server-side web search. Model id, tool type and fallback
 *     header from the `claude-api` skill; response and citation fields from
 *     platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool.
 *   - OpenAI: Responses API + `web_search` tool,
 *     developers.openai.com/api/docs/guides/tools-web-search.
 *   - Perplexity: the Agent API with the `fast` preset. The roadmap named `sonar` on chat
 *     completions, but Perplexity's docs say "Sonar will be supported until September 27,
 *     2026" — three days after this file was written — and map `sonar` to the Agent API's
 *     `fast` preset (docs.perplexity.ai/docs/agent-api/migrate-from-sonar/how-to).
 */

export type AssistantId = 'claude' | 'openai' | 'perplexity';

/** What one question put to one assistant came back with, before scoring. */
export type AskResult =
  | { ok: true; model: string | null; text: string; citedUrls: string[] }
  | { ok: false; httpStatus: number | null; model: string | null; error: string };

export interface Assistant {
  id: AssistantId;
  /** The secret that gates it. Missing or empty: the assistant is skipped, not failed. */
  secret: 'ANTHROPIC_API_KEY' | 'OPENAI_API_KEY' | 'PERPLEXITY_API_KEY';
  /** The model (or preset) requested. The response's own model id is what gets recorded. */
  requested: string;
  ask: (question: string, key: string, fetchImpl: typeof fetch) => Promise<AskResult>;
}

/** One question's wall-clock budget, continuations included. Web search can take minutes. */
export const QUESTION_TIMEOUT_MS = 240_000;
/** Enough of an error body to say what went wrong, not enough to bloat the run file. */
const ERROR_BODY_CHARS = 300;
/** `pause_turn` resumptions allowed per question before the partial answer is kept. */
const MAX_CONTINUATIONS = 2;
/** Cap on searches per Claude question: a cost bound, and plenty for one question. */
const CLAUDE_MAX_SEARCHES = 5;
/** Non-streaming ceiling the `claude-api` skill recommends. */
const CLAUDE_MAX_TOKENS = 16_000;

type Json = Record<string, unknown>;
const isObject = (x: unknown): x is Json => typeof x === 'object' && x !== null && !Array.isArray(x);
const asArray = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);
const asString = (x: unknown): string | null => (typeof x === 'string' ? x : null);

type Post = { ok: true; body: Json } | { ok: false; httpStatus: number | null; error: string };

interface PostRequest {
  fetchImpl: typeof fetch;
  url: string;
  headers: Record<string, string>;
  body: unknown;
  signal: AbortSignal;
}

/** A 2xx body that is not a JSON object is an error for the probe's purposes. */
function parseObject(raw: string): Json | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    return isObject(parsed) ? parsed : null;
  } catch (error) {
    if (error instanceof SyntaxError) return null;
    throw error;
  }
}

/** POST JSON; a non-2xx status, a network failure or a timeout comes back as a value, never a throw. */
async function postJson({ fetchImpl, url, headers, body, signal }: PostRequest): Promise<Post> {
  let res: Response;
  try {
    res = await fetchImpl(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body), signal });
  } catch (error) {
    return { ok: false, httpStatus: null, error: error instanceof Error ? `${error.name}: ${error.message}` : String(error) };
  }
  const raw = await res.text().catch((error: unknown) => `(the body could not be read: ${String(error)})`);
  if (!res.ok) return { ok: false, httpStatus: res.status, error: raw.slice(0, ERROR_BODY_CHARS) || res.statusText };
  const parsed = parseObject(raw);
  if (parsed) return { ok: true, body: parsed };
  return { ok: false, httpStatus: res.status, error: `response is not a JSON object: ${raw.slice(0, ERROR_BODY_CHARS)}` };
}

const keepAll = (): boolean => true;

/** Every string `url` on the objects in `items` that `keep` accepts. */
function urlsOf(items: unknown, keep: (o: Json) => boolean = keepAll): string[] {
  return asArray(items).flatMap((o) => (isObject(o) && keep(o) && typeof o.url === 'string' ? [o.url] : []));
}

/**
 * The `output_text` parts of a Responses-style `message` output item: their text, and the
 * URLs of the annotations `keep` accepts. OpenAI and Perplexity's Agent API share the shape.
 */
function readMessage(item: Json, keep: (annotation: Json) => boolean): { text: string; citedUrls: string[] } {
  const parts = asArray(item.content).filter((p): p is Json => isObject(p) && p.type === 'output_text');
  return {
    text: parts.map((p) => asString(p.text) ?? '').join(''),
    citedUrls: parts.flatMap((p) => urlsOf(p.annotations, keep)),
  };
}

// ── Claude ──────────────────────────────────────────────────────────────────────────

const CLAUDE_MODEL = 'claude-opus-5';

/** Text blocks' text, and every `web_search_result_location` citation's URL. */
export function readClaude(content: unknown[]): { text: string; citedUrls: string[] } {
  const blocks = content.filter((b): b is Json => isObject(b) && b.type === 'text');
  return {
    text: blocks.map((b) => asString(b.text) ?? '').join(''),
    citedUrls: blocks.flatMap((b) => urlsOf(b.citations)),
  };
}

const claude: Assistant = {
  id: 'claude',
  secret: 'ANTHROPIC_API_KEY',
  requested: CLAUDE_MODEL,
  async ask(question, key, fetchImpl) {
    const signal = AbortSignal.timeout(QUESTION_TIMEOUT_MS);
    const headers = {
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      // `fallbacks: "default"`: a classifier refusal is retried server-side on the model
      // Anthropic recommends. The response's `model` names whichever model answered.
      'anthropic-beta': 'server-side-fallback-2026-07-01',
    };
    const messages: Json[] = [{ role: 'user', content: question }];
    const content: unknown[] = [];
    let model: string | null = null;
    for (let turn = 0; turn <= MAX_CONTINUATIONS; turn++) {
      // Each call depends on the one before: a paused turn is resumed from its content.
      // eslint-disable-next-line reliability/no-await-in-loop
      const res = await postJson({
        fetchImpl,
        url: 'https://api.anthropic.com/v1/messages',
        headers,
        body: {
          model: CLAUDE_MODEL,
          max_tokens: CLAUDE_MAX_TOKENS,
          fallbacks: 'default',
          tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: CLAUDE_MAX_SEARCHES }],
          messages,
        },
        signal,
      });
      if (!res.ok) return { ...res, model };
      model = asString(res.body.model) ?? model;
      const blocks = asArray(res.body.content);
      content.push(...blocks);
      const stop = res.body.stop_reason;
      if (stop === 'refusal') return { ok: false, httpStatus: 200, model, error: 'stop_reason: refusal' };
      // A long server-side search loop pauses; send the paused turn back unchanged to resume.
      if (stop !== 'pause_turn') break;
      messages.push({ role: 'assistant', content: blocks });
    }
    return { ok: true, model, ...readClaude(content) };
  },
};

// ── OpenAI ──────────────────────────────────────────────────────────────────────────

const OPENAI_MODEL = 'gpt-6-astra';

/** `output_text` parts of every `message` output item, and their `url_citation` annotations. */
export function readOpenAI(output: unknown[]): { text: string; citedUrls: string[] } {
  const read = output.filter((i): i is Json => isObject(i) && i.type === 'message').map((i) => readMessage(i, (a) => a.type === 'url_citation'));
  return { text: read.map((r) => r.text).join(''), citedUrls: read.flatMap((r) => r.citedUrls) };
}

const openai: Assistant = {
  id: 'openai',
  secret: 'OPENAI_API_KEY',
  requested: OPENAI_MODEL,
  async ask(question, key, fetchImpl) {
    const res = await postJson({
      fetchImpl,
      url: 'https://api.openai.com/v1/responses',
      headers: { authorization: `Bearer ${key}` },
      body: { model: OPENAI_MODEL, input: question, tools: [{ type: 'web_search' }] },
      signal: AbortSignal.timeout(QUESTION_TIMEOUT_MS),
    });
    if (!res.ok) return { ...res, model: null };
    return { ok: true, model: asString(res.body.model), ...readOpenAI(asArray(res.body.output)) };
  },
};

// ── Perplexity ──────────────────────────────────────────────────────────────────────

/** Perplexity's documented replacement for the `sonar` model. */
const PERPLEXITY_PRESET = 'fast';

/**
 * The answer and sources out of an Agent API `output` array: `output_text` parts of
 * `message` items, and the `url` of every result in `search_results` items (the docs'
 * mapping of Sonar's top-level `citations` / `search_results`).
 *
 * TODO(citation-probe): the docs show `annotations: []` on `output_text` without giving an
 * annotation's shape. A `url` string on one is read if present; nothing else about it is
 * assumed. Check against the first real run file and tighten or drop.
 */
export function readPerplexity(output: unknown[]): { text: string; citedUrls: string[] } {
  const items = output.filter((i): i is Json => isObject(i));
  const sources = items.filter((i) => i.type === 'search_results').flatMap((i) => urlsOf(i.results));
  const read = items.filter((i) => i.type === 'message').map((i) => readMessage(i, keepAll));
  return { text: read.map((r) => r.text).join(''), citedUrls: [...sources, ...read.flatMap((r) => r.citedUrls)] };
}

const perplexity: Assistant = {
  id: 'perplexity',
  secret: 'PERPLEXITY_API_KEY',
  requested: `preset:${PERPLEXITY_PRESET}`,
  async ask(question, key, fetchImpl) {
    // The `fast` preset turns web search on by itself; no `tools` entry is needed.
    const res = await postJson({
      fetchImpl,
      url: 'https://api.perplexity.ai/v1/agent',
      headers: { authorization: `Bearer ${key}` },
      body: { preset: PERPLEXITY_PRESET, input: question },
      signal: AbortSignal.timeout(QUESTION_TIMEOUT_MS),
    });
    if (!res.ok) return { ...res, model: null };
    return { ok: true, model: asString(res.body.model), ...readPerplexity(asArray(res.body.output)) };
  },
};

export const ASSISTANTS: readonly Assistant[] = [claude, openai, perplexity];

/**
 * Where every pinned document comes from (`spec.md` R1). A refresh resolves `ref` to a commit,
 * lists `dir` at that commit, keeps the paths `include` matches, and hashes each one. The commit,
 * not the ref, is what `pins.json` records, so a refresh is the only way a document changes.
 */
import { type Family } from '../corpus-lib.js';

export interface Source {
  readonly family: Family;
  readonly repo: string;
  /** Branch or tag a refresh resolves to a commit. */
  readonly ref: string;
  /** The folder listed, relative to the repository root. */
  readonly dir: string;
  readonly include: RegExp;
}

export const SOURCES: Readonly<Record<string, Source>> = {
  /** Every document the APIs.guru directory lists (intent: "every document it lists"). */
  'apis-guru': { family: 'openapi', repo: 'APIs-guru/openapi-directory', ref: 'main', dir: 'APIs', include: /\/(openapi|swagger)\.(yaml|json)$/ },
  // The named bench (metrics.md G2, G6, N2): four large, hand-maintained specs.
  stripe: { family: 'openapi', repo: 'stripe/openapi', ref: 'master', dir: 'openapi', include: /^openapi\/spec3\.json$/ },
  github: { family: 'openapi', repo: 'github/rest-api-description', ref: 'main', dir: 'descriptions/api.github.com', include: /\/api\.github\.com\.json$/ },
  twilio: { family: 'openapi', repo: 'twilio/twilio-oai', ref: 'main', dir: 'spec/json', include: /\/twilio_[\w]+\.json$/ },
  kubernetes: { family: 'openapi', repo: 'kubernetes/kubernetes', ref: 'master', dir: 'api/openapi-spec', include: /\.json$/ },
  // AsyncAPI's own examples, 3.x from the default branch and 2.x from the last 2.x tag.
  'asyncapi-3': { family: 'asyncapi', repo: 'asyncapi/spec', ref: 'master', dir: 'examples', include: /\.ya?ml$/ },
  'asyncapi-2': { family: 'asyncapi', repo: 'asyncapi/spec', ref: 'v2.6.0', dir: 'examples', include: /\.ya?ml$/ },
  // JSON Schema: the official test suite's validation files, and SchemaStore's catalogue.
  'json-schema-test-suite': { family: 'jsonschema', repo: 'json-schema-org/JSON-Schema-Test-Suite', ref: 'main', dir: 'validation/tests', include: /^validation\/tests\/[^/]+\.json$/ },
  schemastore: { family: 'jsonschema', repo: 'SchemaStore/schemastore', ref: 'master', dir: 'src/schemas/json', include: /\.json$/ },
};

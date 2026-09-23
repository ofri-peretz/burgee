/**
 * The typed reader for `.github/vercel-apps.json` — the one file that names every docs app.
 *
 * Host, Vercel project, app directory, workspace and build settings are stated there and
 * nowhere else (docs-per-package, intent constraint 3). Everything that needs one of them —
 * an app's `src/site.ts`, `next.config.mjs`'s redirects, `scripts/brand.mts`,
 * `scripts/sync-package-docs.ts`, the generators and the locks — reads it through here, so
 * a row cannot be spelled two ways.
 *
 * The JSON is imported, not read from disk: Next inlines it at build time, so a page that
 * renders on demand in a serverless function never needs a file the tracer did not ship.
 */
import table from '../../../.github/vercel-apps.json';

/** One deployable app, exactly as the table states it. */
export interface AppRow {
  /** The `packages/*` name this app documents. */
  readonly package: string;
  /** The `name` in the app's own `package.json` — the string turbo prints. */
  readonly workspace: string;
  /** The app directory, repo-relative. */
  readonly dir: string;
  /** The Vercel project id. Public, not a secret. */
  readonly projectId: string;
  /** The canonical origin, `https://<key>.interlace.tools`, with no trailing slash. */
  readonly productionUrl: string;
  readonly rootDirectory: string;
  readonly buildCommand: string;
  readonly outputDirectory: string;
  /** Exactly one row is `true`: the app that owns compatibility, comparison and gallery. */
  readonly familyPages: boolean;
}

/** A row with the key it is filed under, which is also the `app` input to deploy-docs.yml. */
export type App = AppRow & { readonly key: string };

interface Table {
  readonly orgId: string;
  readonly apps: Readonly<Record<string, AppRow>>;
  readonly excluded: Readonly<Record<string, string>>;
}

const TABLE: Table = table;

/** Every app, in the order the table lists them. */
export const APPS: readonly App[] = Object.entries(TABLE.apps).map(([key, row]) => ({ key, ...row }));

/** Published packages that have no app of their own, each with the reason. */
export const EXCLUDED: Readonly<Record<string, string>> = TABLE.excluded;

/** The row filed under `key`, or a build failure naming the keys that do exist. */
export function appConfig(key: string): App {
  const found = APPS.find((app) => app.key === key);
  if (found === undefined) throw new Error(`No app '${key}' in .github/vercel-apps.json. Known: ${APPS.map((app) => app.key).join(', ')}`);
  return found;
}

/** The one app that owns the family-wide pages — the front door. */
export function familyApp(): App {
  const family = APPS.filter((app) => app.familyPages);
  const [only] = family;
  if (family.length !== 1 || only === undefined) throw new Error(`.github/vercel-apps.json must mark exactly one row familyPages: true; it marks ${family.length}`);
  return only;
}

/** The app that documents `pkg`, or `undefined` for a package with no app of its own. */
export function appForPackage(pkg: string): App | undefined {
  return APPS.find((app) => app.package === pkg);
}

/** The app whose workspace is `workspace` — how a built app finds its own row. */
export function appForWorkspace(workspace: string): App | undefined {
  return APPS.find((app) => app.workspace === workspace);
}

/**
 * Where a package's own page lives: its app's `/docs` when it has one, or a section of the
 * family app when it is `excluded`. This is what makes regrouping a data change — move a
 * package from a row to `excluded` and every link to it follows.
 */
export function packageDocsUrl(pkg: string): string {
  const own = appForPackage(pkg);
  if (own !== undefined && !own.familyPages) return `${own.productionUrl}/docs`;
  return `${familyApp().productionUrl}/docs/packages/${pkg}`;
}

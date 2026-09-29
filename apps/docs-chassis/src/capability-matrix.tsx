/**
 * `<CapabilityMatrix pkg="flagstaff" />` — a package against the packages it replaces, one row
 * per capability, grouped by theme, every mark a link to its evidence.
 *
 * A server component: `view.ts` reads `packages/<pkg>/capabilities.json` and the files its
 * cells resolve against at build time, as `packages.ts` reads manifests, so nothing but the
 * HTML reaches the browser. Two layouts of the same cells: a table from `md` up, and a card per
 * capability below it, because six columns of marks do not fit a phone and a table scrolled
 * sideways hides the very column a reader is comparing against. `theme="…"` draws one theme.
 *
 * The data, the links and the Markdown twin are `../capabilities.ts`; the claims are held true
 * by `scripts/capabilities-lock.test.ts`.
 */
import { cardTheme } from './capability-card-theme';
import { columnHead } from './capability-table-head';
import { tableTheme } from './capability-table-theme';
import { matrixView, TONE } from './capability-view';

export function CapabilityMatrix({ pkg, theme }: { readonly pkg: string; readonly theme?: string }) {
  const view = matrixView(pkg, theme);
  return (
    <div className="not-prose my-6" data-slot="capability-matrix" data-pkg={view.pkg}>
      <p className="mb-3 text-xs text-fd-muted-foreground">
        <span className={TONE.yes}>✓</span> yes · <span className={TONE.partial}>◐</span> partial, with what is missing · <span className={TONE.no}>✗</span> no · — does not apply. Every mark links to its
        evidence: our test or grade, or the incumbent’s source at the version compat-oracle grades.
      </p>
      <div className="hidden overflow-x-auto rounded-xl border bg-fd-card md:block">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">{view.caption}</caption>
          <thead>
            <tr className="border-b">
              <th scope="col" className="p-3 text-start font-medium">
                Capability
              </th>
              {view.columns.map(columnHead)}
            </tr>
          </thead>
          {view.themes.map(tableTheme)}
        </table>
      </div>
      <div className="space-y-6 md:hidden">{view.themes.map(cardTheme)}</div>
    </div>
  );
}

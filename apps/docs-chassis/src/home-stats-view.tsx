/**
 * The home's numbers as a row of stats: the value large and tabular, what it counts beneath,
 * and the file it was read from as a quiet link. A `<dl>` in a container-sized grid, one column
 * on a phone and as many as there are numbers from `@xl`.
 */
import { type ReactNode } from 'react';

import { type Stat } from './home-stats';

function statItem(stat: Stat): ReactNode {
  return (
    <div key={stat.id} data-testid={`home-stat-${stat.id}`} data-slot={`home-stat-${stat.id}`} className="flex flex-col gap-1 rounded-xl border bg-fd-card p-5 shadow-sm">
      <dt className="order-2 text-sm text-fd-muted-foreground">{stat.label}</dt>
      <dd className="order-1 font-mono text-3xl font-semibold tracking-tight tabular-nums">{stat.value}</dd>
      <dd className="order-3 mt-1 text-xs">
        <a href={stat.href} data-testid={`home-stat-${stat.id}-source`} data-slot={`home-stat-${stat.id}-source`} className="text-fd-muted-foreground underline underline-offset-4 hover:text-fd-foreground">
          <span className="sr-only">Source: </span>
          {stat.source}
        </a>
      </dd>
    </div>
  );
}

/** Tracks from `@xl`: one per number, up to three. `homeStats` never returns a single number. */
const TRACKS: Readonly<Record<number, string>> = { 2: '@xl:grid-cols-2' };
const MANY_TRACKS = '@xl:grid-cols-3';

export function homeStatsView(stats: readonly Stat[]): ReactNode {
  if (stats.length === 0) return null;
  return (
    <div className="@container">
      <dl data-testid="home-stats" data-slot="home-stats" className={`grid gap-4 ${TRACKS[stats.length] ?? MANY_TRACKS}`}>
        {stats.map(statItem)}
      </dl>
    </div>
  );
}

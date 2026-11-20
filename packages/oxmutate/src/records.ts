/** The fields of a unit's result record that the suspect rule reads (coordinator.ts `ChildRecord` has all of them). */
export interface Suspected {
  type: string;
  id?: string | undefined;
  test?: string | undefined;
  suspects?: string[] | undefined;
}

/**
 * A worker that recovered from pollution in place (runner.ts `recover`, recover.qnt) writes a
 * `recovered` record naming the verdicts no clean canary had vouched for, then runs those mutants
 * again from clean state. Its earlier `mutant` records for them are dropped; the ones after it stand.
 * (A restart drops every record for its suspects: the worker that wrote them is gone and the unit is
 * re-queued, so none of the pair is run again in that file.)
 */
export function withoutSuspects<R extends Suspected>(records: readonly R[]): R[] {
  const kept: R[] = [];
  for (const r of records) {
    if (r.type === 'recovered') {
      const dropped = new Set((r.suspects ?? []).map((id) => `${id}|${r.test ?? ''}`));
      for (let i = kept.length - 1; i >= 0; i--) {
        const k = kept[i] as R;
        if (k.type === 'mutant' && dropped.has(`${k.id ?? ''}|${k.test ?? ''}`)) kept.splice(i, 1);
      }
    }
    kept.push(r);
  }
  return kept;
}

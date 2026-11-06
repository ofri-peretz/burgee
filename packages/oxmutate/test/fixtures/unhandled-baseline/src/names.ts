export interface Person {
  name: string;
}

/** Logs each present name's length later; the caller only learns that it was scheduled. */
export function schedule(people: (Person | undefined)[], log: (n: number) => void): string {
  const present = people.filter((p) => p !== undefined);
  // eslint-disable-next-line maintainability/no-unhandled-promise, reliability/no-unhandled-promise -- the fixture's point: a rejection nobody handles, which oxmutate must count
  void Promise.resolve().then(() => {
    for (const p of present) log((p as Person).name.length);
  });
  return 'scheduled';
}

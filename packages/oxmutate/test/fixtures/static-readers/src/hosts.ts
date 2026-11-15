// Import-time data in the shape of compat-oracle's hosts.ts (static-readers.md): a list of rows,
// each read by some test files and not others. Every mutant here is static.
export const HOSTS = [
  { name: 'alpha', timeoutMs: 100 },
  { name: 'beta', timeoutMs: 200 },
];
export const hostNamed = (name: string) => HOSTS.find((h) => h.name === name);

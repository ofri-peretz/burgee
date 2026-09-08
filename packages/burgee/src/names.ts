/** One canonical camelCase key per option; kebab-case on the command line (S5, yargs #1679). */

/** `dryRun` → `dry-run`; a kebab key stays as it is. */
export function kebab(name: string): string {
  return name.replaceAll(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

/** `--dry-run` on the command line reaches the handler as `dryRun`. */
export function camel(flag: string): string {
  return flag.replaceAll(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase());
}

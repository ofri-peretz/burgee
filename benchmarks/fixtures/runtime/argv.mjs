/** The argv both CLI-parser workloads parse: 21 options of three types, a repeated flag, a negation, a positional. */
export const ARGV = ['--verbose', '--port', '8080', '--host', 'example.com', '--retries', '3', '--timeout', '1500', '--mode', 'fast', '--no-color', '--tag', 'a', '--tag', 'b', '--dry-run', '--level', '2', '--name', 'x', '--out', 'dist', '--config', 'c.json', '--force', '--quiet', '--depth', '7', '--format', 'json', '--region', 'eu', '--cache', '--limit', '50', 'input.txt'];
export const STRINGS = ['host', 'mode', 'name', 'out', 'config', 'format', 'region'];
export const NUMBERS = ['port', 'retries', 'timeout', 'level', 'depth', 'limit'];
export const BOOLEANS = ['verbose', 'dry-run', 'force', 'quiet', 'cache'];

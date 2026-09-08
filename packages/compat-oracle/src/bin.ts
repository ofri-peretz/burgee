import { main } from './report.js';

// The oracle's own CLI entry: the one file in this package that owns argv, stdout and the
// exit code. Everything else takes a writer.
process.exitCode = await main(process.argv.slice(2), (s) => {
  process.stdout.write(s);
});

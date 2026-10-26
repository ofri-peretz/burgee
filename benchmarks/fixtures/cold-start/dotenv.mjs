// seniority's `.env` drop-in, timed against dotenv: import the default and parse one line, so the
// floor's line is printed only by a parser that read it.
import dotenv from 'dotenv';

process.stdout.write(`${dotenv.parse('GREETING="Hello, ada!"').GREETING ?? 'not parsed'}\n`);

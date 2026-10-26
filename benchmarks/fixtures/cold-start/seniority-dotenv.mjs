// `seniority/dotenv` against dotenv's spawn: the same import, the same line parsed.
import dotenv from 'seniority/dotenv';

process.stdout.write(`${dotenv.parse('GREETING="Hello, ada!"').GREETING ?? 'not parsed'}\n`);

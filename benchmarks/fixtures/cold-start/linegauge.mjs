// linegauge against string-width's spawn: the same default import and the same call on both sides,
// because the default export is string-width's (linegauge constraint 3).
import stringWidth from 'linegauge';

process.stdout.write(`${stringWidth('ada') === 'ada'.length ? 'Hello, ada!' : 'not measured'}\n`);

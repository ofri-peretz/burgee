// seniority R9's time bar: what lilconfig costs to start — 0 dependencies, the lightest config
// loader in seniority's layer. Imports the one function a program calls and prints the floor's
// line only when it loaded, so the row measures the import a program pays before it searches.
import { lilconfig } from 'lilconfig';

process.stdout.write(`${typeof lilconfig === 'function' ? 'Hello, ada!' : 'not loaded'}\n`);

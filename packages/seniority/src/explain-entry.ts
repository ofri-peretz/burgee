/**
 * `seniority/explain` — `--explain <option>`, by itself.
 *
 * The winning source and every candidate it beat, or that was unset (V3). It is a door of its
 * own because it is a branch most programs never take: see the note where it used to live, in
 * `precedence.ts`.
 */
import { explanation, renderExplanation } from './explain.js';
import { type Resolution } from './precedence.js';

/** The rendered form: what `--explain` prints. */
function explain(name: string, resolution: Resolution): string {
  return renderExplanation(explanation(name, resolution));
}

export { explain };
export { explanation, renderExplanation, type Explanation } from './explain.js';

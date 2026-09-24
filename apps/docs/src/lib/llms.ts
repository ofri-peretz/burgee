/**
 * What the front door says at the head of `/llms.txt`, and the pitch every surface repeats.
 *
 * The projection itself — the page index, the package map, the corpus, the `.md` twins — is
 * `docs-chassis/llms`, shared with every package's site. What is burgee's alone is the intro:
 * the pitch, then what burgee is in one sentence. The package map after it is read from the
 * packages' own manifests (`docs-chassis/packages`) and links each package to its own host.
 */
import { SUMMARY } from '#/lib/site';

/**
 * The pitch, once. The root README's tagline, `packages/burgee/README.md`'s, the brand
 * card's `TAGLINE` in `scripts/brand.mts`, the site's default metadata and the head of
 * `/llms.txt` all say this sentence, and `scripts/pitch-lock.test.ts` fails the moment any of
 * them says another — the go-to-market audit found three variants in three places, and a
 * model quotes whichever one it met first.
 */
export const PITCH = "Everything a CLI needs that isn't your CLI. Written once, served to humans and agents alike.";

/** The lines under `# burgee` in `/llms.txt`: the pitch as a quote, then the definition. */
export const LLMS_INTRO: readonly string[] = [`> ${PITCH}`, '', SUMMARY];

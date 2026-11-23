/**
 * Zod 4 schemas, read through Standard JSON Schema: the extractor never names Zod. Zod is a test-only
 * fixture here (it is in the root node_modules), never a dependency of contractdiff.
 */
// eslint-disable-next-line import-next/no-extraneous-dependencies -- a test fixture: Zod is read by the extractor, never shipped
import { z } from 'zod';

export const Pet = z.object({ id: z.number().int(), name: z.string().min(1).describe('what the pet answers to'), tag: z.string().optional() }).meta({ id: 'PetRecord' });

export const Owner = z.object({ pets: z.array(Pet), email: z.email(), kind: z.enum(['person', 'shelter']).nullable() });

export const Tree = z.object({ label: z.string(), get children() { return z.array(Tree); } });

/** Not a schema: `*` leaves it out. */
export const VERSION = '1.0.0';

/** A transform: the input is a string, the output cannot be written. */
export const Length = z.string().transform((text) => text.length);

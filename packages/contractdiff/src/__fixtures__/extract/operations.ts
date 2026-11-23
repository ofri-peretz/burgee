/** An operation map as a module's own exports, beside the schemas it names (apicontract-extract R4). */
// eslint-disable-next-line import-next/no-extraneous-dependencies -- a test fixture: Zod is read by the extractor, never shipped
import { z } from 'zod';

export const Pet = z.object({ id: z.string(), name: z.string(), tag: z.string().optional() });

export const NewPet = z.object({ name: z.string(), tag: z.string().optional() });

export const listPets = { method: 'GET', path: '/pets', input: z.object({ limit: z.number().int().optional() }), output: z.array(Pet) };

export const createPet = { method: 'POST', path: '/pets', input: NewPet, responses: { 201: Pet } };

export const getPet = { method: 'GET', path: '/pets/:id', output: Pet, responses: { 404: null } };

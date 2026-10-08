/**
 * The owning package.json (V4) and the layer it becomes under config discovery (V6), where
 * the walk is unusual: a package.json that does not parse, a tree deeper than the walk goes,
 * and an entry with no package.json above it at all.
 */
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { configLayers } from './config-layers.js';
import { nearestPackage, owningPackage } from './pkg.js';

let dir = '';
afterEach(() => rmSync(dir, { recursive: true, force: true }));
/** `depth` directories below the fixture's root. */
const at = (depth: number): string => join(dir, ...Array.from({ length: depth }, () => 'd'));

describe('nearestPackage', () => {
  it('gives up on a package.json that does not parse, rather than walking past it', () => {
    dir = mkdtempSync(join(tmpdir(), 'burgee-pkg-'));
    writeFileSync(join(dir, 'package.json'), '{ "name": "outer" }');
    mkdirSync(join(dir, 'inner'));
    writeFileSync(join(dir, 'inner', 'package.json'), '{ not json');
    expect(nearestPackage(join(dir, 'inner'))).toBeUndefined();
    expect(nearestPackage(dir)?.data).toEqual({ name: 'outer' });
  });

  it('walks at most 64 directories up', () => {
    dir = mkdtempSync(join(tmpdir(), 'burgee-pkg-deep-'));
    writeFileSync(join(dir, 'package.json'), '{ "name": "top" }');
    mkdirSync(at(64), { recursive: true });
    // 63 levels below: the 64th directory looked at is `dir` itself.
    expect(nearestPackage(at(63))?.data).toEqual({ name: 'top' });
    expect(nearestPackage(at(64))).toBeUndefined();
  });
});

describe('owningPackage — the package that owns a CLI reached through its bin link', () => {
  it('finds the CLI\'s own package.json, not the installing project\'s', () => {
    dir = mkdtempSync(join(tmpdir(), 'burgee-bin-'));
    const tool = join(dir, 'project', 'node_modules', 'tool');
    mkdirSync(join(tool, 'dist'), { recursive: true });
    mkdirSync(join(dir, 'project', 'node_modules', '.bin'), { recursive: true });
    writeFileSync(join(dir, 'project', 'package.json'), '{ "name": "project", "version": "0.0.0" }');
    writeFileSync(join(tool, 'package.json'), '{ "name": "tool", "version": "1.2.3" }');
    writeFileSync(join(tool, 'dist', 'cli.js'), '');
    const link = join(dir, 'project', 'node_modules', '.bin', 'tool');
    // npm links the bin on POSIX; Windows has no unprivileged symlink, and npm writes a shim there.
    try {
      symlinkSync(join(tool, 'dist', 'cli.js'), link);
    } catch {
      return;
    }
    expect(nearestPackage(dirname(link))?.data['version']).toBe('0.0.0');
    expect(owningPackage(link)?.data['version']).toBe('1.2.3');
  });

  it('walks from a path that does not resolve as given', () => {
    dir = mkdtempSync(join(tmpdir(), 'burgee-bin-missing-'));
    writeFileSync(join(dir, 'package.json'), '{ "name": "here" }');
    expect(owningPackage(join(dir, 'no-such-cli.js'))?.data).toEqual({ name: 'here' });
  });
});

describe('configLayers', () => {
  it('has no package.json layer when no package.json owns the entry', async () => {
    dir = mkdtempSync(join(tmpdir(), 'burgee-layers-'));
    const layers = await configLayers('app', {}, { cwd: dir, env: { HOME: dir, XDG_CONFIG_HOME: dir }, pkg: undefined });
    expect(layers).toEqual({});
  });
  it('reads the field named after the program when one does', async () => {
    dir = mkdtempSync(join(tmpdir(), 'burgee-layers-'));
    const pkg = { path: join(dir, 'package.json'), data: { app: { region: 'eu' } } };
    const layers = await configLayers('app', {}, { cwd: dir, env: { HOME: dir, XDG_CONFIG_HOME: dir }, pkg });
    expect(layers).toEqual({ pkg: { path: pkg.path, data: { region: 'eu' } } });
  });
});

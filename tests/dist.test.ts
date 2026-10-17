import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { packageOf } from '../scripts/licenses.mjs';

const notices = (target: string) => resolve(__dirname, `../dist/${target}/LICENSE.txt`);

describe('packageOf', () => {
  it('finds the package a bundled module belongs to', () => {
    expect(packageOf('/p/node_modules/svelte/src/internal/client/index.js')).toBe('svelte');
    expect(packageOf('C:\\p\\node_modules\\@scope\\pkg\\index.js')).toBe('@scope/pkg');
    expect(packageOf('/p/node_modules/a/node_modules/b/x.js')).toBe('b');
    expect(packageOf('/p/src/shared/pac.ts')).toBeNull();
  });
});

describe.each(['chrome', 'firefox'])('%s build licenses', (target) => {
  it.skipIf(!existsSync(notices(target)))('ships the MIT license and notices for bundled packages', () => {
    const text = readFileSync(notices(target), 'utf8');
    expect(text).toContain('Copyright (c) 2026 dkon70');
    expect(text).toMatch(/^svelte \d+\.\d+\.\d+ \(MIT\)$/m);
    expect(/^acorn /m.test(text)).toBe(target === 'firefox');
  });
});

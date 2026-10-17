import { describe, expect, it } from 'vitest';
import chromeBaseline from './fixtures/chrome-manifest.json';
import { buildManifest } from '../scripts/manifest.mjs';

describe('Chrome manifest', () => {
  it('is exactly the pre-Firefox manifest', () => {
    expect(buildManifest('chrome')).toEqual(chromeBaseline);
  });
});

describe('Firefox manifest', () => {
  const m = buildManifest('firefox');

  it('uses an event page instead of a service worker', () => {
    expect(m.background).toEqual({ scripts: ['background.js'], type: 'module' });
  });

  it('has no Chrome-only keys or permissions', () => {
    expect(m.sandbox).toBeUndefined();
    expect(m.minimum_chrome_version).toBeUndefined();
    expect(m.permissions).not.toContain('offscreen');
    expect(m.permissions).not.toContain('webRequestAuthProvider');
    expect(m.content_security_policy.sandbox).toBeUndefined();
  });

  it('declares what Firefox requires', () => {
    expect(m.permissions).toEqual(expect.arrayContaining(['proxy', 'webRequest', 'webRequestBlocking']));
    expect(m.browser_specific_settings.gecko.id).toBe('{746b5e76-a6b7-4690-aed0-ae70ea57dace}');
    expect(m.browser_specific_settings.gecko.data_collection_permissions).toEqual({ required: ['none'] });
  });

  it('shares name, version, permissions model and CSP with Chrome', () => {
    const c = buildManifest('chrome');
    for (const key of ['name', 'version', 'default_locale', 'optional_permissions', 'optional_host_permissions', 'action', 'options_ui', 'icons']) {
      expect(m[key], key).toEqual(c[key]);
    }
    expect(m.content_security_policy.extension_pages).toBe(c.content_security_policy.extension_pages);
  });
});

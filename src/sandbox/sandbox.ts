import type { Localized } from '../shared/i18n';
import type { SandboxRequest, SandboxResponse } from '../shared/sandboxProtocol';
import { PAC_HELPERS } from './pacRuntime';

class SandboxError extends Error {
  constructor(readonly localized: Localized) {
    super(localized.key);
  }
}

function compile(pac: string): (url: string, host: string) => unknown {
  const factory = new Function(`${PAC_HELPERS}\n${pac}\n;return FindProxyForURL;`);
  const fn = factory.call({});
  if (typeof fn !== 'function') throw new SandboxError({ key: 'sandbox.noFunction' });
  return fn as (url: string, host: string) => unknown;
}

function handle(req: SandboxRequest): SandboxResponse {
  try {
    const fn = compile(req.pac);
    if (req.op === 'check') {
      const r = fn('https://example.com/', 'example.com');
      if (typeof r !== 'string') throw new SandboxError({ key: 'sandbox.notString' });
      return { id: req.id, ok: true };
    }
    const results = req.urls.map((url) => {
      const host = new URL(url).hostname.replace(/^\[|\]$/g, '');
      return { url, host, result: String(fn(url, host)) };
    });
    return { id: req.id, ok: true, results };
  } catch (e) {
    if (e instanceof SandboxError) return { id: req.id, ok: false, error: e.localized };
    const detail = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    return { id: req.id, ok: false, error: { key: 'sandbox.exception', params: { detail } } };
  }
}

const parentOrigin = location.ancestorOrigins?.[0] ?? '*';

window.addEventListener('message', (e) => {
  if (e.source !== window.parent) return;
  const req = e.data as SandboxRequest;
  if (!req || typeof req.id !== 'number') return;
  window.parent.postMessage(handle(req), parentOrigin);
});

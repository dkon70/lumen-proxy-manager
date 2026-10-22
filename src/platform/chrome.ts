import { localized, type Localized } from '../shared/i18n';
import { SandboxClient } from '../shared/sandboxProtocol';
import type { Settings } from '../shared/types';
import type { AuthRequest, AuthResponse, BackgroundPlatform, PacEvaluator, ProxyErrorEvent, Target } from './types';

export const TARGET: Target = 'chrome';
export const BROWSER_NAME: string = 'Chrome';
export const EXACT_ROUTE_CHECK: boolean = true;

let offscreenCreating: Promise<void> | null = null;

async function ensureOffscreen(): Promise<void> {
  if (await chrome.offscreen.hasDocument()) return;
  offscreenCreating ??= chrome.offscreen
    .createDocument({
      url: 'offscreen.html',
      reasons: [chrome.offscreen.Reason.IFRAME_SCRIPTING],
      justification: 'Validate the PAC script in an isolated sandbox before applying it',
    })
    .finally(() => (offscreenCreating = null));
  await offscreenCreating;
}

export const background: BackgroundPlatform = {
  async applyProxy(settings: Settings, pac: string | null) {
    if (pac === null) {
      await chrome.proxy.settings.clear({ scope: 'regular' });
      return;
    }
    await chrome.proxy.settings.set({
      scope: 'regular',
      value: { mode: 'pac_script', pacScript: { data: pac, mandatory: settings.blockDirect } },
    });
  },

  async controlledByOther() {
    const control = await chrome.proxy.settings.get({});
    return control.levelOfControl === 'controlled_by_other_extensions';
  },

  watchControl(onChange) {
    chrome.proxy.settings.onChange.addListener((d) => onChange(d.levelOfControl === 'controlled_by_other_extensions'));
  },

  watchRoutes() {},

  onProxyError(listener: (event: ProxyErrorEvent) => void) {
    chrome.proxy.onProxyError.addListener((d) => listener({ code: d.error, fatal: d.fatal }));
  },

  registerAuth(handler: (request: AuthRequest) => Promise<AuthResponse>) {
    chrome.webRequest.onAuthRequired.addListener(
      (details, callback): undefined => {
        const done = callback!;
        if (!details.isProxy || !details.challenger) {
          done({});
          return;
        }
        handler({ requestId: details.requestId, host: details.challenger.host, port: details.challenger.port })
          .then(done)
          .catch(() => done({}));
        return;
      },
      { urls: ['<all_urls>'] },
      ['asyncBlocking'],
    );
  },

  async validatePac(pac: string): Promise<Localized | null> {
    try {
      await ensureOffscreen();
      const r = (await chrome.runtime.sendMessage({ target: 'offscreen', pac })) as { ok: boolean; error?: Localized } | undefined;
      return r && !r.ok ? r.error ?? localized('sandbox.unknown') : null;
    } catch (e) {
      console.warn('[lumen] sandbox check unavailable', e);
      return null;
    } finally {
      chrome.offscreen.closeDocument().catch(() => undefined);
    }
  },

  async accessProblem() {
    return null;
  },
};

export function createPacEvaluator(): PacEvaluator {
  const sandbox = new SandboxClient();
  return {
    async check(pac) {
      const r = await sandbox.request({ op: 'check', pac });
      return r.ok ? null : r.error;
    },
    async route(pac, urls) {
      const r = await sandbox.request({ op: 'eval', pac, urls });
      return r.ok ? r.results ?? [] : r.error;
    },
  };
}

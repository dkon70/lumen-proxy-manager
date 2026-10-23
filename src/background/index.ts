import { background as platform, TARGET } from '#platform';
import { ext } from '../platform/api';
import { describeProxyError } from '../shared/errors';
import { localized, LocalizedError, resolveLang, toLocalized, translate } from '../shared/i18n';
import type { Message, RefreshResult } from '../shared/messages';
import { buildPac } from '../shared/pac';
import { checkPacUrl, looksLikePac, MAX_PAC_BYTES, MAX_PAC_MB, originPattern, PAC_IDLE_TIMEOUT_MS, remotePacText, sha256 } from '../shared/pacSource';
import { activeProxy } from '../shared/settings';
import { KEYS, loadPacCache, loadSettings, loadStatus, patchStatus } from '../shared/storage';
import type { PacCache, Settings } from '../shared/types';

const ALARM_REFRESH = 'pac-refresh';
const ALARM_CLEAR_ERROR = 'clear-error';

let chain: Promise<unknown> = Promise.resolve();

function enqueue(task: () => Promise<void>): Promise<void> {
  const run = chain.then(task).catch(reportApplyError);
  chain = run;
  return run;
}

async function reportApplyError(e: unknown): Promise<void> {
  console.error('[lumen] apply failed', e);
  try {
    const detail = e instanceof Error ? e.message : String(e);
    await patchStatus({ lastError: { ...localized('applyError', { detail }), at: Date.now(), fatal: true } });
    await updateIcon(await loadSettings(), true);
  } catch (err) {
    console.error('[lumen] could not report the apply error', err);
  }
}

function scheduleApply(): Promise<void> {
  return enqueue(applyNow);
}

function syncApplied(): Promise<void> {
  return enqueue(async () => {
    const [s, cache, applied] = await Promise.all([loadSettings(), loadPacCache(), ext.storage.session.get(KEYS.applied)]);
    if (applied[KEYS.applied] !== (await fingerprint(s, cache))) await applyNow();
  });
}

function fingerprint(s: Settings, cache: PacCache | null): Promise<string> {
  return sha256(JSON.stringify([s, cache?.url ?? null, cache?.hash ?? null]));
}

async function applyNow(): Promise<void> {
  const s = await loadSettings();
  const cache = await loadPacCache();

  const off = s.mode === 'system' || (s.mode === 'global' && !activeProxy(s));
  await platform.applyProxy(s, off ? null : buildPac({ settings: s, remotePac: remotePacText(s, cache) }));

  await applyWebRtc(s);
  await scheduleRefresh(s);
  const previousError = (await loadStatus()).lastError;
  const status = await patchStatus({
    appliedAt: Date.now(),
    lastError: previousError?.key === 'applyError' ? null : previousError,
    controlledByOther: await platform.controlledByOther(),
    accessProblem: await platform.accessProblem(),
  });
  await updateIcon(s, status.lastError !== null);
  await ext.storage.session.set({ [KEYS.applied]: await fingerprint(s, cache) });
}

async function applyWebRtc(s: Settings): Promise<void> {
  if (!(await ext.permissions.contains({ permissions: ['privacy'] }))) return;
  const setting = ext.privacy.network.webRTCIPHandlingPolicy;
  if (s.mode === 'system' || s.webrtc === 'untouched') {
    await setting.clear({});
    return;
  }
  await setting.set({
    value: s.webrtc === 'proxy_only' ? 'disable_non_proxied_udp' : 'default_public_interface_only',
  });
}

async function updateIcon(s: Settings, hasError: boolean): Promise<void> {
  const state = s.mode === 'system' ? 'off' : hasError ? 'error' : s.mode;
  await ext.action.setIcon({ path: { 16: `icons/${state}-16.png`, 32: `icons/${state}-32.png` } });
  const lang = resolveLang(s.language);
  const name = activeProxy(s)?.name;
  const title =
    s.mode === 'system'
      ? translate(lang, 'title.off')
      : s.mode === 'global'
        ? translate(lang, 'title.global', { name: name ?? '?' })
        : name
          ? translate(lang, 'title.rulesVia', { name })
          : translate(lang, 'title.rules');
  await ext.action.setTitle({ title: hasError ? translate(lang, 'title.error', { title }) : title });
  await ext.action.setBadgeBackgroundColor({ color: '#c2412d' });
  await ext.action.setBadgeText({ text: hasError && s.mode !== 'system' ? '!' : '' });
}

async function scheduleRefresh(s: Settings): Promise<void> {
  const want = s.mode === 'rules' && s.pac.enabled && s.pac.kind === 'url' && s.pac.url && s.pac.refreshMinutes > 0;
  const existing = await ext.alarms.get(ALARM_REFRESH);
  if (!want) {
    if (existing) await ext.alarms.clear(ALARM_REFRESH);
    return;
  }
  if (existing?.periodInMinutes === s.pac.refreshMinutes) return;
  await ext.alarms.create(ALARM_REFRESH, { periodInMinutes: s.pac.refreshMinutes, delayInMinutes: 1 });
}

async function readLimited(res: Response, onProgress: () => void): Promise<string> {
  const declared = Number(res.headers.get('content-length'));
  if (declared > MAX_PAC_BYTES) throw new LocalizedError('pacFetch.tooBig', { limit: MAX_PAC_MB });
  const reader = res.body!.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    onProgress();
    total += value.byteLength;
    if (total > MAX_PAC_BYTES) {
      await reader.cancel();
      throw new LocalizedError('pacFetch.tooBig', { limit: MAX_PAC_MB });
    }
    chunks.push(value);
  }
  const buf = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    buf.set(c, offset);
    offset += c.byteLength;
  }
  return new TextDecoder().decode(buf);
}

async function refreshPac(): Promise<RefreshResult> {
  const s = await loadSettings();
  try {
    if (!s.pac.enabled || s.pac.kind !== 'url' || !s.pac.url) throw new LocalizedError('pacFetch.notConfigured');
    const url = checkPacUrl(s.pac.url, s.pac.allowHttp);
    if (!(await ext.permissions.contains({ origins: [originPattern(url)] }))) {
      throw new LocalizedError('pacFetch.noPermission', { host: url.hostname });
    }
    const ctrl = new AbortController();
    let timer = setTimeout(() => ctrl.abort(), PAC_IDLE_TIMEOUT_MS);
    const stillAlive = () => {
      clearTimeout(timer);
      timer = setTimeout(() => ctrl.abort(), PAC_IDLE_TIMEOUT_MS);
    };
    let text: string;
    try {
      const res = await fetch(url, { credentials: 'omit', cache: 'no-store', redirect: 'follow', signal: ctrl.signal });
      checkPacUrl(res.url, s.pac.allowHttp);
      if (!res.ok) throw new LocalizedError('pacFetch.status', { status: res.status });
      text = await readLimited(res, stillAlive);
    } catch (e) {
      if (ctrl.signal.aborted) throw new LocalizedError('pacFetch.timeout', { seconds: PAC_IDLE_TIMEOUT_MS / 1000 });
      if (e instanceof LocalizedError) throw e;
      throw new LocalizedError('pacFetch.network', { detail: e instanceof Error ? e.message : String(e) });
    } finally {
      clearTimeout(timer);
    }
    if (!looksLikePac(text)) throw new LocalizedError('pacFetch.notPac');

    const hash = await sha256(text);
    const current = await loadPacCache();
    const next: PacCache = { url: s.pac.url, content: text, hash, fetchedAt: Date.now() };
    const changed = !current || current.hash !== hash || current.url !== s.pac.url;

    if (changed) {
      const err = await platform.validatePac(buildPac({ settings: s, remotePac: text }));
      if (err) throw new LocalizedError('pacFetch.invalid', { error: err });
      await ext.storage.local.set({ [KEYS.pac]: next, [KEYS.pacPrevious]: current });
    } else {
      await ext.storage.local.set({ [KEYS.pac]: next });
    }
    await patchStatus({ pacError: null, pacFetchedAt: next.fetchedAt, pacSize: text.length });
    return { ok: true, size: text.length, changed };
  } catch (e) {
    const error = toLocalized(e, 'pacFetch.network');
    await patchStatus({ pacError: { ...error, at: Date.now() } });
    return { ok: false, error };
  }
}

async function rollbackPac(): Promise<void> {
  const data = await ext.storage.local.get([KEYS.pac, KEYS.pacPrevious]);
  const current = data[KEYS.pac] as PacCache | undefined;
  const previous = data[KEYS.pacPrevious] as PacCache | null | undefined;
  if (!current || !previous || Date.now() - current.fetchedAt > 10 * 60_000) return;
  await ext.storage.local.set({ [KEYS.pac]: previous, [KEYS.pacPrevious]: null });
  await patchStatus({ pacError: { ...localized('pacFetch.rolledBack'), at: Date.now() } });
}

const authAttempts = new Map<string, number>();

platform.registerAuth(async ({ requestId, host, port }) => {
  const s = await loadSettings();
  const p = s.mode === 'system' ? undefined : s.proxies.find((x) => x.host === host.replace(/^\[|\]$/g, '') && x.port === port);
  if (!p || !p.username) return {};
  const now = Date.now();
  for (const [id, t] of authAttempts) if (now - t > 60_000) authAttempts.delete(id);
  if (authAttempts.has(requestId)) {
    await patchStatus({ lastError: { ...localized('proxyError.authRejected', { name: p.name }), at: now, fatal: false } });
    return { cancel: true };
  }
  authAttempts.set(requestId, now);
  return { authCredentials: { username: p.username, password: p.password } };
});

platform.onProxyError(({ code, fatal }) => {
  patchStatus({ lastError: { ...describeProxyError(code), at: Date.now(), fatal } }).then(async () => {
    if (code.includes('PAC_SCRIPT_FAILED')) await rollbackPac();
    await updateIcon(await loadSettings(), true);
    await ext.alarms.create(ALARM_CLEAR_ERROR, { delayInMinutes: 3 });
  });
});

platform.watchControl((controlledByOther) => {
  patchStatus({ controlledByOther });
});

ext.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (KEYS.settings in changes || KEYS.pac in changes) scheduleApply();
});

ext.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === ALARM_REFRESH) await refreshPac();
  if (alarm.name === ALARM_CLEAR_ERROR) {
    await patchStatus({ lastError: null });
    await updateIcon(await loadSettings(), false);
  }
});

ext.runtime.onMessage.addListener((msg: Message & { target?: string }, sender, sendResponse) => {
  if (sender.id !== ext.runtime.id || msg.target) return;
  if (msg.type === 'refreshPac') {
    refreshPac().then(sendResponse);
    return true;
  }
  if (msg.type === 'sync') {
    syncApplied().then(() => sendResponse(true));
    return true;
  }
  if (msg.type === 'applyNow') {
    patchStatus({ lastError: null })
      .then(scheduleApply)
      .then(() => sendResponse(true));
    return true;
  }
});

ext.runtime.onInstalled.addListener(async ({ reason }) => {
  await scheduleApply();
  if (reason === 'install') ext.runtime.openOptionsPage();
});

ext.runtime.onStartup.addListener(async () => {
  await scheduleApply();
  const s = await loadSettings();
  const status = await loadStatus();
  const stale = !status.pacFetchedAt || Date.now() - status.pacFetchedAt > s.pac.refreshMinutes * 60_000;
  if (s.mode === 'rules' && s.pac.enabled && s.pac.kind === 'url' && s.pac.refreshMinutes > 0 && stale) await refreshPac();
});

if (TARGET === 'firefox') syncApplied();

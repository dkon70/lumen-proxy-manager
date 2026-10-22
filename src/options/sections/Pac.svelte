<script lang="ts">
  import { ext } from '../../platform/api';
  import Segmented from '../../ui/components/Segmented.svelte';
  import Switch from '../../ui/components/Switch.svelte';
  import { send, type RefreshResult } from '../../shared/messages';
  import { buildPac } from '../../shared/pac';
  import { checkPacUrl, looksLikePac, MAX_PAC_BYTES, MAX_PAC_MB, originPattern } from '../../shared/pacSource';
  import { createPacEvaluator, TARGET } from '#platform';
  import { localized, toLocalized, type Localized, type MessageKey } from '../../shared/i18n';
  import { activeProxy } from '../../shared/settings';
  import { formatDate, t, tl } from '../../ui/i18n.svelte';
  import { app, update } from '../../ui/store.svelte';

  const evaluator = createPacEvaluator();
  const s = $derived(app.settings);

  let url = $state(app.settings.pac.url);
  let inline = $state(app.settings.pac.inline);
  let busy = $state(false);
  let message = $state<{ kind: 'ok' | 'error'; text: Localized } | null>(null);

  let hasSiteAccess = $state(true);
  if (TARGET === 'firefox') ext.permissions.contains({ origins: ['<all_urls>'] }).then((granted) => (hasSiteAccess = granted));

  async function allowSiteAccess() {
    hasSiteAccess = await ext.permissions.request({ origins: ['<all_urls>'] });
  }

  const isHttp = $derived(url.trim().toLowerCase().startsWith('http:'));

  const INTERVALS: { value: number; label: MessageKey }[] = [
    { value: 60, label: 'pac.interval.60' },
    { value: 360, label: 'pac.interval.360' },
    { value: 720, label: 'pac.interval.720' },
    { value: 1440, label: 'pac.interval.1440' },
    { value: 0, label: 'pac.interval.0' },
  ];

  async function load() {
    message = null;
    let parsed: URL;
    try {
      parsed = checkPacUrl(url, s.pac.allowHttp);
    } catch (e) {
      message = { kind: 'error', text: toLocalized(e) };
      return;
    }
    const granted = await ext.permissions.request({ origins: [originPattern(parsed)] });
    if (!granted) {
      message = { kind: 'error', text: localized('pac.noPermission', { host: parsed.hostname }) };
      return;
    }
    busy = true;
    await update((x) => {
      x.pac.url = parsed.href;
      x.pac.kind = 'url';
      x.pac.enabled = true;
    });
    url = parsed.href;
    const r = await send<RefreshResult>({ type: 'refreshPac' });
    busy = false;
    message = r.ok
      ? { kind: 'ok', text: localized(r.changed ? 'pac.loaded' : 'pac.loadedUnchanged', { size: (r.size / 1024).toFixed(1) }) }
      : { kind: 'error', text: r.error };
  }

  async function saveInline() {
    message = null;
    if (inline.length > MAX_PAC_BYTES) return void (message = { kind: 'error', text: localized('pac.tooBig', { limit: MAX_PAC_MB }) });
    if (!looksLikePac(inline)) return void (message = { kind: 'error', text: localized('pac.noFunction') });
    busy = true;
    const problem = await evaluator.check(buildPac({ settings: s, remotePac: inline }));
    busy = false;
    if (problem) return void (message = { kind: 'error', text: localized('pac.notSaved', { error: problem }) });
    await update((x) => {
      x.pac.inline = inline;
      x.pac.kind = 'inline';
      x.pac.enabled = true;
    });
    message = { kind: 'ok', text: localized('pac.saved') };
  }

  function fmtDate(time: number | null) {
    return time ? formatDate(time) : t('common.none');
  }
</script>

<p class="lead">{t('pac.lead')}</p>

<div class="panel">
  <Switch label={t('pac.use')} checked={s.pac.enabled} onchange={(v) => update((x) => void (x.pac.enabled = v))}>
    {t('pac.useHint')}{#if s.mode !== 'rules'} {t('pac.useHintOtherMode')}{/if}
  </Switch>
  <Switch
    label={t('pac.ownProxy')}
    checked={s.pac.useOwnProxy}
    disabled={!activeProxy(s)}
    onchange={(v) => update((x) => void (x.pac.useOwnProxy = v))}
  >
    {#if activeProxy(s)}
      {t('pac.ownProxyHint', { name: activeProxy(s)!.name })}
    {:else}
      {t('pac.ownProxyNoProxy')}
    {/if}
  </Switch>
</div>

{#if TARGET === 'firefox'}
  <div class="panel padded access">
    <div>
      <strong>{t('pac.showRoute')}</strong>
      <p class="hint">{t('pac.showRouteHint')}</p>
    </div>
    {#if hasSiteAccess}
      <span class="granted">{t('pac.showRouteOn')}</span>
    {:else}
      <button class="btn" onclick={allowSiteAccess}>{t('pac.allowAccess')}</button>
    {/if}
  </div>
{/if}

<Segmented
  label={t('pac.source')}
  value={s.pac.kind}
  onchange={(k) => update((x) => void (x.pac.kind = k))}
  options={[
    { value: 'url', label: t('pac.byUrl') },
    { value: 'inline', label: t('pac.inline') },
  ]}
/>

{#if s.pac.kind === 'url'}
  <div class="panel padded block">
    <label class="field">
      <span>{t('pac.url')}</span>
      <span class="url">
        <input class="input" type="url" placeholder="https://example.com/proxy.pac" bind:value={url} spellcheck="false" />
        <button class="btn primary" onclick={load} disabled={busy || !url.trim()}>{busy ? t('pac.loading') : s.pac.url === url && app.pac ? t('pac.refresh') : t('pac.load')}</button>
      </span>
    </label>
    {#if isHttp}
      <label class="check">
        <input type="checkbox" checked={s.pac.allowHttp} onchange={(e) => update((x) => void (x.pac.allowHttp = e.currentTarget.checked))} />
        <span>{t('pac.allowHttp')}</span>
      </label>
    {/if}
    <label class="field">
      <span>{t('pac.refreshEvery')}</span>
      <select class="input" value={s.pac.refreshMinutes} onchange={(e) => update((x) => void (x.pac.refreshMinutes = Number(e.currentTarget.value)))}>
        {#each INTERVALS as i (i.value)}<option value={i.value}>{t(i.label)}</option>{/each}
      </select>
    </label>
    <dl class="meta">
      <div><dt>{t('pac.fetchedAt')}</dt><dd>{fmtDate(app.pac && app.pac.url === s.pac.url ? app.pac.fetchedAt : null)}</dd></div>
      <div><dt>{t('pac.size')}</dt><dd>{app.pac && app.pac.url === s.pac.url ? t('common.kb', { size: (app.pac.content.length / 1024).toFixed(1) }) : t('common.none')}</dd></div>
    </dl>
    {#if app.status.pacError && !message}
      <p class="note error">{t('pac.lastUpdate', { error: app.status.pacError })}</p>
    {/if}
    <p class="hint">{t(TARGET === 'chrome' ? 'pac.safetyHint' : 'pac.safetyHintFirefox')}</p>
  </div>
{:else}
  <div class="panel padded block">
    <label class="field">
      <span>{t('pac.text')}</span>
      <textarea class="input" rows="14" bind:value={inline} spellcheck="false" placeholder={'function FindProxyForURL(url, host) {\n  return "DIRECT";\n}'}></textarea>
    </label>
    <div class="row-actions">
      <button class="btn primary" onclick={saveInline} disabled={busy || inline === s.pac.inline}>{t('pac.checkAndSave')}</button>
      {#if inline !== s.pac.inline}<button class="btn" onclick={() => (inline = s.pac.inline)}>{t('pac.revert')}</button>{/if}
    </div>
  </div>
{/if}

{#if message}
  <p class="note {message.kind}" role="status">{tl(message.text)}</p>
{/if}

<style>
  .access {
    display: flex;
    align-items: center;
    gap: 16px;
  }
  .access > div {
    flex: 1;
  }
  .access .btn {
    flex: none;
  }
  .granted {
    flex: none;
    color: var(--proxy);
    font-size: 13px;
    font-weight: 600;
  }
  .block {
    display: grid;
    gap: 14px;
    margin-top: 14px;
  }
  .url {
    display: flex;
    gap: 8px;
  }
  .check {
    display: flex;
    gap: 10px;
    align-items: flex-start;
    color: var(--direct);
    font-size: 13px;
  }
  .check input {
    margin-top: 2px;
  }
  .meta {
    display: flex;
    gap: 32px;
    margin: 0;
  }
  .meta div {
    display: grid;
  }
  dt {
    font-size: 12px;
    color: var(--faint);
  }
  dd {
    margin: 0;
    font-variant-numeric: tabular-nums;
  }
</style>

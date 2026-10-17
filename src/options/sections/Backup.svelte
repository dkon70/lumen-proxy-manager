<script lang="ts">
  import { send } from '../../shared/messages';
  import { DEFAULT_SETTINGS, normalizeSettings } from '../../shared/settings';
  import { replaceSettings } from '../../shared/storage';
  import { localized, LocalizedError, toLocalized, type Localized } from '../../shared/i18n';
  import { t, tl } from '../../ui/i18n.svelte';
  import { app } from '../../ui/store.svelte';

  let withPasswords = $state(false);
  let message = $state<{ kind: 'ok' | 'error'; text: Localized } | null>(null);

  function download() {
    const s = structuredClone($state.snapshot(app.settings));
    if (!withPasswords) for (const p of s.proxies) p.password = '';
    const blob = new Blob([JSON.stringify({ app: 'lumen-proxy', exportedAt: new Date().toISOString(), settings: s }, null, 2)], {
      type: 'application/json',
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `lumen-proxy-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  async function restore(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    message = null;
    try {
      const data = JSON.parse(await file.text());
      const raw = data?.app === 'lumen-proxy' ? data.settings : null;
      if (!raw) throw new LocalizedError('backup.notBackup');
      const s = normalizeSettings(raw);
      for (const p of s.proxies) {
        if (!p.password) p.password = app.settings.proxies.find((q) => q.id === p.id)?.password ?? '';
      }
      if (!confirm(t('backup.confirmRestore', { proxies: s.proxies.length, domains: s.proxyList.length + s.directList.length }))) return;
      await replaceSettings(s);
      if (s.pac.enabled && s.pac.kind === 'url' && s.pac.url) send({ type: 'refreshPac' });
      message = { kind: 'ok', text: localized('backup.restored') };
    } catch (err) {
      message = { kind: 'error', text: err instanceof SyntaxError ? localized('backup.corrupt') : toLocalized(err) };
    }
  }

  async function reset() {
    if (!confirm(t('backup.confirmReset'))) return;
    await replaceSettings(DEFAULT_SETTINGS);
    message = { kind: 'ok', text: localized('backup.resetDone') };
  }
</script>

<p class="lead">{t('backup.lead')}</p>

<div class="panel padded block">
  <label class="check">
    <input type="checkbox" bind:checked={withPasswords} />
    <span>{t('backup.withPasswords')}</span>
  </label>
  <div class="row-actions">
    <button class="btn primary" onclick={download}>{t('backup.save')}</button>
    <label class="btn">
      {t('backup.restore')}
      <input type="file" accept="application/json,.json" class="sr-only" onchange={restore} />
    </label>
  </div>
</div>

{#if message}<p class="note {message.kind}" role="status">{tl(message.text)}</p>{/if}

<h2 class="section-title">{t('backup.reset')}</h2>
<button class="btn danger" onclick={reset}>{t('backup.resetAll')}</button>

<style>
  .block {
    display: grid;
    gap: 14px;
  }
  .check {
    display: flex;
    gap: 10px;
    align-items: flex-start;
  }
  .check input {
    margin-top: 3px;
  }
</style>

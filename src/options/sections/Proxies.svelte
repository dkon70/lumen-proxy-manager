<script lang="ts">
  import { ext } from '../../platform/api';
  import Segmented from '../../ui/components/Segmented.svelte';
  import { parseProxyString } from '../../shared/proxyUrl';
  import { isValidPort, isValidProxyHost, SCHEME_LABEL } from '../../shared/settings';
  import { BROWSER_NAME } from '#platform';
  import { LANGUAGE_NAMES, type LanguageSetting } from '../../shared/i18n';
  import type { ProxyScheme, ProxyServer, Theme } from '../../shared/types';
  import { t } from '../../ui/i18n.svelte';
  import { app, update } from '../../ui/store.svelte';

  const s = $derived(app.settings);

  let editing = $state<ProxyServer | null>(null);
  let isNew = $state(false);
  let showPassword = $state(false);
  let paste = $state('');
  let error = $state('');

  function blank(): ProxyServer {
    return { id: crypto.randomUUID(), name: '', scheme: 'http', host: '', port: 8080, username: '', password: '' };
  }

  function startAdd() {
    editing = blank();
    isNew = true;
    error = '';
    paste = '';
  }

  function startEdit(p: ProxyServer) {
    editing = { ...p };
    isNew = false;
    error = '';
    paste = '';
  }

  function applyPaste() {
    if (!editing) return;
    const parsed = parseProxyString(paste);
    if (!parsed) {
      error = t('proxies.error.parse');
      return;
    }
    Object.assign(editing, parsed);
    error = '';
    paste = '';
  }

  async function save(e: SubmitEvent) {
    e.preventDefault();
    if (!editing) return;
    const p = { ...editing, host: editing.host.trim().toLowerCase().replace(/^\[|\]$/g, ''), port: Number(editing.port) };
    if (!isValidProxyHost(p.host)) return void (error = t('proxies.error.host'));
    if (!isValidPort(p.port)) return void (error = t('proxies.error.port'));
    p.name = p.name.trim() || p.host;

    if (p.username) {
      const granted = await ext.permissions.request({ origins: ['<all_urls>'] });
      if (!granted) return void (error = t('proxies.error.permission'));
    }
    await update((x) => {
      const i = x.proxies.findIndex((q) => q.id === p.id);
      if (i >= 0) x.proxies[i] = p;
      else x.proxies.push(p);
      if (!x.activeProxyId) x.activeProxyId = p.id;
    });
    editing = null;
  }

  function remove(p: ProxyServer) {
    if (!confirm(t('proxies.confirmDelete', { name: p.name }))) return;
    update((x) => {
      x.proxies = x.proxies.filter((q) => q.id !== p.id);
      if (x.activeProxyId === p.id) x.activeProxyId = x.proxies[0]?.id ?? null;
    });
  }

  const SCHEMES: ProxyScheme[] = ['http', 'https', 'socks5', 'socks4'];
</script>

<p class="lead">{t('proxies.lead')}</p>

<Segmented
  label={t('mode.label')}
  value={s.mode}
  onchange={(mode) => update((x) => void (x.mode = mode))}
  options={[
    { value: 'system', label: t('mode.system'), tone: 'off' },
    { value: 'rules', label: t('mode.rules'), tone: 'proxy' },
    { value: 'global', label: t('mode.global'), tone: 'global' },
  ]}
/>
<p class="hint mode-hint">
  {#if s.mode === 'system'}{t('mode.hint.system', { browser: BROWSER_NAME })}
  {:else if s.mode === 'rules'}{t(s.defaultAction === 'proxy' ? 'mode.hint.rules.proxy' : 'mode.hint.rules.direct')}
  {:else}{t('mode.hint.global')}{/if}
</p>

<h2 class="section-title">{t('proxies.servers')}</h2>

<div class="panel">
  {#each s.proxies as p (p.id)}
    <div class="proxy">
      <input
        type="radio"
        name="active"
        aria-label={t('proxies.use', { name: p.name })}
        checked={p.id === s.activeProxyId}
        onchange={() => update((x) => void (x.activeProxyId = p.id))}
      />
      <div class="info">
        <strong>{p.name}</strong>
        <span class="muted">{SCHEME_LABEL[p.scheme]} · {p.host.includes(':') ? `[${p.host}]` : p.host}:{p.port}{p.username ? ` · ${t('proxies.withPassword')}` : ''}</span>
      </div>
      <button class="btn small ghost" onclick={() => startEdit(p)}>{t('common.edit')}</button>
      <button class="btn small ghost danger" onclick={() => remove(p)}>{t('common.delete')}</button>
    </div>
  {:else}
    <p class="empty">{t('proxies.empty')}</p>
  {/each}
</div>

{#if editing}
  <form class="panel padded editor" onsubmit={save}>
    <h3>{isNew ? t('proxies.new') : t('proxies.editTitle', { name: editing.name })}</h3>
    <div class="paste">
      <input class="input" placeholder={t('proxies.pastePlaceholder')} bind:value={paste} />
      <button type="button" class="btn" disabled={!paste.trim()} onclick={applyPaste}>{t('proxies.fill')}</button>
    </div>
    <div class="grid">
      <label class="field wide"><span>{t('proxies.name')}</span><input class="input" bind:value={editing.name} placeholder={t('proxies.namePlaceholder')} /></label>
      <label class="field">
        <span>{t('proxies.protocol')}</span>
        <select class="input" bind:value={editing.scheme}>
          {#each SCHEMES as sc (sc)}<option value={sc}>{SCHEME_LABEL[sc]}</option>{/each}
        </select>
      </label>
      <label class="field host"><span>{t('proxies.host')}</span><input class="input" bind:value={editing.host} placeholder="proxy.example.com" required autocomplete="off" spellcheck="false" /></label>
      <label class="field"><span>{t('proxies.port')}</span><input class="input" type="number" min="1" max="65535" bind:value={editing.port} required /></label>
      <label class="field"><span>{t('proxies.username')}</span><input class="input" bind:value={editing.username} autocomplete="off" spellcheck="false" /></label>
      <label class="field">
        <span>{t('proxies.password')}</span>
        <span class="pw">
          <input class="input" type={showPassword ? 'text' : 'password'} bind:value={editing.password} autocomplete="new-password" />
          <button type="button" class="btn small ghost" onclick={() => (showPassword = !showPassword)}>{showPassword ? t('proxies.hide') : t('proxies.show')}</button>
        </span>
      </label>
    </div>
    {#if editing.username && editing.scheme.startsWith('socks')}
      <p class="note warn">{t('proxies.socksAuth', { browser: BROWSER_NAME })}</p>
    {/if}
    {#if editing.scheme === 'http' && editing.username}
      <p class="note">{t('proxies.httpAuth')}</p>
    {/if}
    {#if error}<p class="note error">{error}</p>{/if}
    <div class="row-actions">
      <button class="btn primary" type="submit">{isNew ? t('common.add') : t('common.save')}</button>
      <button class="btn" type="button" onclick={() => (editing = null)}>{t('common.cancel')}</button>
    </div>
  </form>
{:else}
  <button class="btn" onclick={startAdd}>{t('proxies.addProxy')}</button>
{/if}

<h2 class="section-title">{t('proxies.interface')}</h2>
<div class="appearance">
  <span class="field-label">{t('proxies.language')}</span>
  <Segmented
    label={t('proxies.language')}
    value={s.language}
    onchange={(language: LanguageSetting) => update((x) => void (x.language = language))}
    options={[
      { value: 'auto', label: t('proxies.language.auto') },
      { value: 'ru', label: LANGUAGE_NAMES.ru },
      { value: 'en', label: LANGUAGE_NAMES.en },
    ]}
  />
  <span class="field-label">{t('proxies.theme')}</span>
  <Segmented
    label={t('proxies.theme')}
    value={s.theme}
    onchange={(theme: Theme) => update((x) => void (x.theme = theme))}
    options={[
      { value: 'auto', label: t('proxies.theme.auto') },
      { value: 'light', label: t('proxies.theme.light') },
      { value: 'dark', label: t('proxies.theme.dark') },
    ]}
  />
</div>

<style>
  .appearance {
    display: grid;
    grid-template-columns: max-content minmax(0, 1fr);
    align-items: center;
    gap: 10px 16px;
  }
  .field-label {
    font-weight: 500;
  }
  @media (max-width: 560px) {
    .appearance {
      grid-template-columns: 1fr;
    }
  }
  .mode-hint {
    margin: 8px 2px 0;
  }
  .proxy {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 0;
  }
  .proxy input[type='radio'] {
    width: 16px;
    height: 16px;
    accent-color: var(--proxy);
  }
  .info {
    flex: 1;
    display: grid;
    min-width: 0;
  }
  .info span {
    font-size: 13px;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .empty {
    padding: 16px 0;
    color: var(--muted);
  }
  .editor {
    display: grid;
    gap: 14px;
  }
  h3 {
    font-size: 15px;
  }
  .paste {
    display: flex;
    gap: 8px;
  }
  .grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }
  .wide {
    grid-column: 1 / -1;
  }
  .pw {
    display: flex;
    gap: 4px;
  }
  @media (max-width: 560px) {
    .grid {
      grid-template-columns: 1fr;
    }
  }
</style>

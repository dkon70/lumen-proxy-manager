<script lang="ts">
  import { ext } from '../platform/api';
  import FirefoxSetup from '../ui/components/FirefoxSetup.svelte';
  import RouteDiagram from '../ui/components/RouteDiagram.svelte';
  import Segmented from '../ui/components/Segmented.svelte';
  import { domainChoices, isIPv4, isIPv6 } from '../shared/domain';
  import { send } from '../shared/messages';
  import { buildPac } from '../shared/pac';
  import { remotePacText } from '../shared/pacSource';
  import { allMatches, explainRoute, isProxyResult, matchRule } from '../shared/route';
  import { BROWSER_NAME, createPacEvaluator, EXACT_ROUTE_CHECK } from '#platform';
  import { activeProxy, SCHEME_LABEL } from '../shared/settings';
  import type { Mode } from '../shared/types';
  import { t, tl } from '../ui/i18n.svelte';
  import { app, update } from '../ui/store.svelte';

  const evaluator = createPacEvaluator();

  let tabUrl = $state<URL | null>(null);
  let routeResult = $state<string | null>(null);
  let chosen = $state<string | null>(null);

  ext.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
    try {
      const u = tab?.url ? new URL(tab.url) : null;
      tabUrl = u && (u.protocol === 'http:' || u.protocol === 'https:') ? u : null;
    } catch {
      tabUrl = null;
    }
  });

  const s = $derived(app.settings);
  const proxy = $derived(activeProxy(s));
  const host = $derived(tabUrl ? tabUrl.hostname.replace(/^\[|\]$/g, '') : null);
  const match = $derived(host ? matchRule(s, host) : null);
  const matches = $derived(host ? allMatches(s, host) : []);
  const choices = $derived(host ? (isIPv4(host) || isIPv6(host) ? [host] : domainChoices(host)) : []);
  const selected = $derived(chosen && choices.includes(chosen) ? chosen : choices[choices.length - 1]);

  $effect(() => {
    const url = tabUrl;
    const settings = s;
    const pac = app.pac;
    if (!url || settings.mode === 'system') {
      routeResult = null;
      return;
    }
    let cancelled = false;
    try {
      const data = buildPac({ settings, remotePac: remotePacText(settings, pac) });
      evaluator.route(data, [`${url.protocol}//${url.host}/`]).then((r) => {
        if (!cancelled) routeResult = Array.isArray(r) && r[0] ? r[0].result : null;
      });
    } catch {
      routeResult = null;
    }
    return () => (cancelled = true);
  });

  const explained = $derived(host ? explainRoute(s, host, remotePacText(s, app.pac) !== null) : null);

  const active = $derived<'proxy' | 'direct' | 'unknown'>(
    s.mode === 'system'
      ? 'direct'
      : routeResult !== null
        ? isProxyResult(routeResult)
          ? 'proxy'
          : 'direct'
        : !EXACT_ROUTE_CHECK && explained && explained.kind !== 'pac'
          ? explained.kind
          : 'unknown',
  );

  const reason = $derived.by(() => {
    if (s.mode === 'system') return t('popup.reason.off', { browser: BROWSER_NAME });
    if (!host) return '';
    if (match) return t(match.list === 'proxyList' ? 'popup.reason.proxyRule' : 'popup.reason.directRule', { rule: match.rule });
    if (routeResult === 'DIRECT' && s.bypassLocal && !host.includes('.')) return t('popup.reason.local');
    if (s.mode === 'global') return t('popup.reason.global');
    if (remotePacText(s, app.pac)) return t('popup.reason.pac');
    return t(s.defaultAction === 'proxy' ? 'popup.reason.defaultProxy' : 'popup.reason.defaultDirect');
  });

  const viaLabel = $derived(
    routeResult && isProxyResult(routeResult) && !proxy
      ? routeResult.split(';')[0].trim()
      : proxy
        ? proxy.name
        : routeResult && isProxyResult(routeResult)
          ? routeResult.split(';')[0].trim()
          : t('common.proxy'),
  );

  const recentError = $derived(app.status.lastError && Date.now() - app.status.lastError.at < 10 * 60_000 ? app.status.lastError : null);

  function setMode(mode: Mode) {
    update((x) => void (x.mode = mode));
  }

  function addTo(list: 'proxyList' | 'directList', domain: string) {
    const other = list === 'proxyList' ? 'directList' : 'proxyList';
    update((x) => {
      x[other] = x[other].filter((d) => d !== domain);
      if (!x[list].includes(domain)) x[list] = [...x[list], domain];
    });
  }

  function removeRules() {
    const toRemove = matches;
    update((x) => {
      for (const m of toRemove) x[m.list] = x[m.list].filter((d) => d !== m.rule);
    });
  }

  function openOptions(hash = '') {
    ext.tabs.create({ url: ext.runtime.getURL(`options.html${hash}`) });
    window.close();
  }
</script>

{#if app.ready}
  <main>
    <header>
      <img src="/icons/32.png" alt="" width="20" height="20" />
      <h1>Lumen Proxy</h1>
      <button class="btn ghost small" onclick={() => openOptions()} title={t('popup.openSettings')}>{t('popup.settings')}</button>
    </header>

    {#if app.status.accessProblem?.key === 'firefox.privateAccess'}
      <FirefoxSetup compact />
    {:else}
      <Segmented
        label={t('mode.label')}
        value={s.mode}
        onchange={setMode}
        options={[
          { value: 'system', label: t('mode.system'), tone: 'off' },
          { value: 'rules', label: t('mode.rules'), tone: 'proxy' },
          { value: 'global', label: t('mode.global'), tone: 'global' },
        ]}
      />

      {#if s.proxies.length === 0}
        <section class="empty">
          <p>{t('popup.empty')}</p>
          <button class="btn primary" onclick={() => openOptions('#proxies')}>{t('popup.addProxy')}</button>
        </section>
      {:else if s.proxies.length > 1}
        <label class="picker">
          <span class="muted">{t('popup.proxy')}</span>
          <select class="input" value={s.activeProxyId} onchange={(e) => update((x) => void (x.activeProxyId = e.currentTarget.value))}>
            {#each s.proxies as p (p.id)}
              <option value={p.id}>{p.name} · {SCHEME_LABEL[p.scheme]}</option>
            {/each}
          </select>
        </label>
      {/if}

      {#if s.mode === 'global' && !proxy}
        <p class="banner warn">{t('popup.globalNeedsProxy', { browser: BROWSER_NAME })}</p>
      {/if}

      <section class="site">
        {#if host}
          <h2 title={host}>{host}</h2>
          <RouteDiagram {active} proxyLabel={viaLabel} blocked={s.blockDirect && s.mode !== 'system'} />
          <p class="reason">{reason}</p>

          {#if s.mode !== 'system'}
            {#if matches.length}
              <div class="actions">
                <button class="btn" onclick={removeRules}>
                  {matches.length > 1 ? t('popup.removeRules', { count: matches.length }) : t('popup.removeRule', { rule: matches[0].rule })}
                </button>
              </div>
            {:else}
              {#if choices.length > 1}
                <div class="chips" role="radiogroup" aria-label={t('popup.whichDomain')}>
                  <span class="muted">{t('popup.ruleFor')}</span>
                  {#each choices as c (c)}
                    <button role="radio" aria-checked={c === selected} class:on={c === selected} onclick={() => (chosen = c)}>
                      {c}
                    </button>
                  {/each}
                </div>
              {/if}
              <div class="actions">
                <button class="btn primary" disabled={!proxy} onclick={() => addTo('proxyList', selected)}>{t('common.viaProxy')}</button>
                <button class="btn" onclick={() => addTo('directList', selected)}>{t('popup.alwaysDirect')}</button>
              </div>
            {/if}
          {/if}
        {:else}
          <p class="muted">{t('popup.notASite')}</p>
        {/if}
      </section>

      {#if app.status.controlledByOther}
        <p class="banner warn">{t('popup.controlledByOther')}</p>
      {/if}

      {#if recentError && s.mode !== 'system'}
        <div class="banner error" role="alert">
          <span>{tl(recentError)}</span>
          <button class="btn small" onclick={() => send({ type: 'applyNow' })}>{t('common.dismiss')}</button>
        </div>
      {/if}

      {#if app.status.pacError && s.mode === 'rules' && s.pac.enabled}
        <button class="banner warn link" onclick={() => openOptions('#pac')}>{t('popup.pacError', { error: app.status.pacError })}</button>
      {/if}
    {/if}
  </main>
{/if}

<style>
  :global(body.popup) {
    width: 360px;
    background: var(--surface);
  }
  main {
    display: grid;
    gap: 12px;
    padding: 12px;
  }
  header {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  h1 {
    flex: 1;
    font-size: 15px;
    font-weight: 650;
  }
  .picker {
    display: grid;
    grid-template-columns: auto 1fr;
    align-items: center;
    gap: 10px;
  }
  .site {
    display: grid;
    gap: 8px;
    padding: 14px;
    border: 1px solid var(--line);
    border-radius: var(--r-lg);
    background: var(--canvas);
  }
  h2 {
    font-size: 17px;
    font-weight: 650;
    letter-spacing: -0.01em;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .reason {
    color: var(--muted);
    font-size: 13px;
  }
  .actions {
    display: flex;
    gap: 8px;
  }
  .actions .btn {
    flex: 1;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px;
  }
  .chips .muted {
    margin-right: 2px;
    font-size: 12px;
  }
  .chips button {
    height: 24px;
    padding: 0 8px;
    border: 1px solid var(--line);
    border-radius: 999px;
    background: var(--surface);
    color: var(--muted);
    font-size: 12px;
    cursor: pointer;
  }
  .chips button.on {
    border-color: var(--ink);
    color: var(--ink);
    font-weight: 600;
  }
  .empty {
    display: grid;
    gap: 10px;
    padding: 14px;
    border: 1px dashed var(--line-strong);
    border-radius: var(--r-lg);
  }
  .banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 8px 10px;
    border-radius: var(--r-md);
    font-size: 13px;
    text-align: left;
  }
  .banner.error {
    background: var(--danger-soft);
    color: var(--danger);
  }
  .banner.warn {
    background: var(--direct-soft);
    color: var(--direct);
  }
  .banner.link {
    border: 0;
    cursor: pointer;
  }
</style>

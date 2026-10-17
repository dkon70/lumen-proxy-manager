<script lang="ts">
  import type { MessageKey } from '../shared/i18n';
  import { formatNumber, t, tl } from '../ui/i18n.svelte';
  import { app } from '../ui/store.svelte';
  import FirefoxSetup from '../ui/components/FirefoxSetup.svelte';
  import Backup from './sections/Backup.svelte';
  import Check from './sections/Check.svelte';
  import Lists from './sections/Lists.svelte';
  import Pac from './sections/Pac.svelte';
  import Protection from './sections/Protection.svelte';
  import Proxies from './sections/Proxies.svelte';

  const SECTIONS: { id: string; title: MessageKey; component: typeof Proxies }[] = [
    { id: 'proxies', title: 'nav.proxies', component: Proxies },
    { id: 'lists', title: 'nav.lists', component: Lists },
    { id: 'pac', title: 'nav.pac', component: Pac },
    { id: 'protection', title: 'nav.protection', component: Protection },
    { id: 'check', title: 'nav.check', component: Check },
    { id: 'backup', title: 'nav.backup', component: Backup },
  ];

  function fromHash() {
    const id = location.hash.slice(1);
    return SECTIONS.some((x) => x.id === id) ? id : 'proxies';
  }

  let current = $state(fromHash());
  const section = $derived(SECTIONS.find((x) => x.id === current)!);

  $effect(() => {
    const onHash = () => (current = fromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  });

  const counts = $derived<Record<string, string>>({
    proxies: String(app.settings.proxies.length || ''),
    lists: app.settings.proxyList.length + app.settings.directList.length ? formatNumber(app.settings.proxyList.length + app.settings.directList.length) : '',
    pac: app.settings.pac.enabled ? t('common.on') : '',
  });

  const modeLabel = $derived(t(`mode.${app.settings.mode}`));
</script>

<div class="layout">
  <nav aria-label={t('nav.label')}>
    <div class="brand">
      <img src="/icons/32.png" alt="" width="24" height="24" />
      <div>
        <strong>Lumen Proxy</strong>
        <span class="mode" data-mode={app.settings.mode}>{modeLabel}</span>
      </div>
    </div>
    <ul>
      {#each SECTIONS as item (item.id)}
        <li>
          <a href={`#${item.id}`} aria-current={item.id === current ? 'page' : undefined}>
            <span>{t(item.title)}</span>
            {#if counts[item.id]}<span class="count">{counts[item.id]}</span>{/if}
          </a>
        </li>
      {/each}
    </ul>
  </nav>

  <main>
    {#if app.status.accessProblem?.key === 'firefox.privateAccess'}
      <div class="access"><FirefoxSetup /></div>
    {:else if app.status.accessProblem}
      <p class="access note warn" role="alert">{tl(app.status.accessProblem)}</p>
    {/if}
    <h1>{t(section.title)}</h1>
    {#key current}
      <section.component />
    {/key}
  </main>
</div>

<style>
  .layout {
    display: grid;
    grid-template-columns: 240px minmax(0, 1fr);
    min-height: 100vh;
  }
  nav {
    position: sticky;
    top: 0;
    align-self: start;
    height: 100vh;
    padding: 20px 12px;
    border-right: 1px solid var(--line);
    background: var(--surface);
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 8px 20px;
  }
  .brand div {
    display: grid;
  }
  .mode {
    font-size: 12px;
    color: var(--faint);
  }
  .mode[data-mode='rules'] {
    color: var(--proxy);
  }
  .mode[data-mode='global'] {
    color: var(--global);
  }
  ul {
    display: grid;
    gap: 2px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  a {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 10px;
    border-radius: var(--r-sm);
    color: var(--muted);
    text-decoration: none;
    font-weight: 500;
  }
  a:hover {
    background: var(--raised);
    color: var(--ink);
  }
  a[aria-current='page'] {
    background: var(--raised);
    color: var(--ink);
    box-shadow: inset 3px 0 0 var(--proxy);
  }
  .count {
    font-size: 12px;
    color: var(--faint);
    font-variant-numeric: tabular-nums;
  }
  main {
    width: 100%;
    max-width: 820px;
    padding: 28px 40px 64px;
  }
  .access {
    margin-bottom: 20px;
  }
  h1 {
    margin-bottom: 20px;
    font-size: 26px;
    font-weight: 650;
    letter-spacing: -0.02em;
  }
  @media (max-width: 760px) {
    .layout {
      grid-template-columns: 1fr;
    }
    nav {
      position: static;
      height: auto;
      border-right: 0;
      border-bottom: 1px solid var(--line);
    }
    ul {
      grid-auto-flow: column;
      overflow-x: auto;
    }
    a {
      white-space: nowrap;
    }
    main {
      padding: 20px 16px 48px;
    }
  }
</style>

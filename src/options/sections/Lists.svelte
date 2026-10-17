<script lang="ts">
  import Segmented from '../../ui/components/Segmented.svelte';
  import { formatNumber, t } from '../../ui/i18n.svelte';
  import { app, update } from '../../ui/store.svelte';
  import DomainList from './DomainList.svelte';

  let tab = $state<'proxyList' | 'directList'>('proxyList');
  const s = $derived(app.settings);
</script>

<p class="lead">{t('lists.lead')}</p>

<div class="tabs" role="tablist">
  <button role="tab" aria-selected={tab === 'proxyList'} class:on={tab === 'proxyList'} data-tone="proxy" onclick={() => (tab = 'proxyList')}>
    {t('lists.viaProxy')} <span>{formatNumber(s.proxyList.length)}</span>
  </button>
  <button role="tab" aria-selected={tab === 'directList'} class:on={tab === 'directList'} data-tone="direct" onclick={() => (tab = 'directList')}>
    {t('lists.direct')} <span>{formatNumber(s.directList.length)}</span>
  </button>
</div>

<DomainList list={tab} />

<h2 class="section-title">{t('lists.others')}</h2>
<Segmented
  label={t('lists.others')}
  value={s.defaultAction}
  onchange={(v) => update((x) => void (x.defaultAction = v))}
  options={[
    { value: 'direct', label: t('common.direct') },
    { value: 'proxy', label: t('common.viaProxy') },
  ]}
/>
<p class="hint after">{t('lists.othersHint')}</p>

<style>
  .tabs {
    display: flex;
    gap: 4px;
    margin-bottom: 14px;
    border-bottom: 1px solid var(--line);
  }
  .tabs button {
    display: flex;
    gap: 8px;
    align-items: center;
    padding: 8px 12px;
    border: 0;
    border-bottom: 2px solid transparent;
    margin-bottom: -1px;
    background: none;
    color: var(--muted);
    font-weight: 500;
    cursor: pointer;
  }
  .tabs button span {
    font-size: 12px;
    font-variant-numeric: tabular-nums;
    color: var(--faint);
  }
  .tabs button.on {
    color: var(--ink);
  }
  .tabs button.on[data-tone='proxy'] {
    border-color: var(--proxy);
  }
  .tabs button.on[data-tone='direct'] {
    border-color: var(--direct);
  }
  .after {
    margin-top: 8px;
  }
</style>

<script lang="ts">
  import { t } from '../i18n.svelte';

  interface Props {
    active: 'proxy' | 'direct' | 'unknown';
    proxyLabel: string;
    blocked?: boolean;
  }
  let { active, proxyLabel, blocked = false }: Props = $props();
</script>

<div class="route" data-active={active} role="img" aria-label={active === 'proxy' ? t('route.via', { name: proxyLabel }) : active === 'direct' ? t('common.direct') : t('route.unknown')}>
  <svg viewBox="0 0 120 64" aria-hidden="true">
    <circle class="origin" cx="8" cy="32" r="5" />
    <path class="trunk" d="M13 32 H44" />
    <path class="branch proxy" d="M44 32 C60 32 60 12 76 12 H116" />
    <path class="branch direct" d="M44 32 C60 32 60 52 76 52 H116" />
  </svg>
  <div class="ends">
    <span class="end proxy">
      {proxyLabel}
      {#if active === 'proxy' && blocked}<span class="lock" title={t('route.noDirectTitle')}>{t('route.noDirect')}</span>{/if}
    </span>
    <span class="end direct">{t('common.direct')}</span>
  </div>
</div>

<style>
  .route {
    display: grid;
    grid-template-columns: 112px 1fr;
    align-items: center;
    --c-proxy: var(--line-strong);
    --c-direct: var(--line-strong);
  }
  [data-active='proxy'] {
    --c-proxy: var(--proxy);
  }
  [data-active='direct'] {
    --c-direct: var(--direct);
  }
  svg {
    width: 112px;
    height: 60px;
    overflow: visible;
  }
  path {
    fill: none;
    stroke-width: 3;
    stroke-linecap: round;
    transition: stroke 0.25s, stroke-dasharray 0.25s;
  }
  .origin {
    fill: var(--ink);
  }
  .trunk {
    stroke: var(--ink);
  }
  .branch {
    stroke-dasharray: 2 6;
  }
  .branch.proxy {
    stroke: var(--c-proxy);
  }
  .branch.direct {
    stroke: var(--c-direct);
  }
  [data-active='proxy'] .branch.proxy,
  [data-active='direct'] .branch.direct {
    stroke-dasharray: none;
  }
  .ends {
    display: grid;
    gap: 20px;
    margin-left: -2px;
    min-width: 0;
  }
  .end {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    color: var(--faint);
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    transition: color 0.25s;
  }
  [data-active='proxy'] .end.proxy {
    color: var(--proxy);
  }
  [data-active='direct'] .end.direct {
    color: var(--direct);
  }
  .lock {
    padding: 1px 6px;
    border-radius: 999px;
    background: var(--proxy-soft);
    font-size: 11px;
    font-weight: 600;
  }
</style>

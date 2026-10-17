<script lang="ts">
  import { t } from '../i18n.svelte';

  interface Props {
    compact?: boolean;
  }
  let { compact = false }: Props = $props();

  let copied = $state(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText('about:addons');
      copied = true;
      setTimeout(() => (copied = false), 2000);
    } catch {
      copied = false;
    }
  }
</script>

<section class="setup" class:compact role="alert">
  <h2>{t('firefox.setup.title')}</h2>
  <p class="lead">{t('firefox.setup.lead')}</p>
  <ol>
    <li>
      <span>{t('firefox.setup.step1')}</span>
      <button class="btn small" onclick={copy}>{copied ? t('firefox.setup.copied') : t('firefox.setup.copy')}</button>
    </li>
    <li>{t('firefox.setup.step2')}</li>
    <li>{t('firefox.setup.step3')}</li>
  </ol>
  <p class="done">{t('firefox.setup.done')}</p>
</section>

<style>
  .setup {
    display: grid;
    gap: 10px;
    padding: 18px 20px;
    border: 1px solid color-mix(in srgb, var(--direct) 45%, transparent);
    border-radius: var(--r-lg);
    background: var(--direct-soft);
  }
  .compact {
    padding: 14px;
    gap: 8px;
  }
  h2 {
    font-size: 16px;
    font-weight: 650;
  }
  .compact h2 {
    font-size: 15px;
  }
  .lead,
  .done {
    color: var(--muted);
    font-size: 13px;
  }
  ol {
    display: grid;
    gap: 8px;
    margin: 0;
    padding-left: 20px;
  }
  li {
    padding-left: 4px;
  }
  li::marker {
    font-weight: 650;
    color: var(--direct);
  }
  li span {
    display: block;
    margin-bottom: 6px;
  }
  .done {
    color: var(--ink);
    font-weight: 500;
  }
</style>

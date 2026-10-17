<script lang="ts">
  import { ext } from '../../platform/api';
  import Switch from '../../ui/components/Switch.svelte';
  import { BROWSER_NAME, TARGET } from '#platform';
  import type { MessageKey } from '../../shared/i18n';
  import type { WebRtcPolicy } from '../../shared/types';
  import { t } from '../../ui/i18n.svelte';
  import { app, update } from '../../ui/store.svelte';

  const s = $derived(app.settings);
  let rtcError = $state('');

  const RTC: { value: WebRtcPolicy; title: MessageKey; text: MessageKey }[] = [
    { value: 'untouched', title: 'protection.rtc.untouched', text: 'protection.rtc.untouchedText' },
    { value: 'public_only', title: 'protection.rtc.publicOnly', text: 'protection.rtc.publicOnlyText' },
    { value: 'proxy_only', title: 'protection.rtc.proxyOnly', text: 'protection.rtc.proxyOnlyText' },
  ];

  async function setRtc(value: WebRtcPolicy) {
    rtcError = '';
    if (value !== 'untouched' && !(await ext.permissions.request({ permissions: ['privacy'] }))) {
      rtcError = t('protection.rtcPermission', { browser: BROWSER_NAME });
      return;
    }
    await update((x) => void (x.webrtc = value));
  }
</script>

<p class="lead">{t('protection.lead')}</p>

<div class="panel">
  <Switch label={t('protection.blockDirect')} checked={s.blockDirect} onchange={(v) => update((x) => void (x.blockDirect = v))}>
    {#if s.blockDirect}
      {t(TARGET === 'chrome' ? 'protection.blockDirectOn' : 'protection.blockDirectOnFirefox')}
    {:else}
      {t('protection.blockDirectOff', { browser: BROWSER_NAME })}
    {/if}
  </Switch>
  <Switch label={t('protection.bypassLocal')} checked={s.bypassLocal} onchange={(v) => update((x) => void (x.bypassLocal = v))}>
    {t('protection.bypassLocalHint')}
  </Switch>
</div>

<h2 class="section-title">{t('protection.webrtc')}</h2>
<div class="rtc" role="radiogroup" aria-label="WebRTC">
  {#each RTC as o (o.value)}
    <label class="option" class:on={s.webrtc === o.value}>
      <input type="radio" name="webrtc" checked={s.webrtc === o.value} onchange={() => setRtc(o.value)} />
      <span>
        <strong>{t(o.title)}</strong>
        <span class="hint">{t(o.text)}</span>
      </span>
    </label>
  {/each}
</div>
{#if rtcError}<p class="note error">{rtcError}</p>{/if}
<p class="hint after">{t('protection.rtcHint')}</p>

<style>
  .rtc {
    display: grid;
    gap: 8px;
  }
  .option {
    display: flex;
    gap: 12px;
    align-items: flex-start;
    padding: 14px 16px;
    border: 1px solid var(--line);
    border-radius: var(--r-md);
    background: var(--surface);
    cursor: pointer;
  }
  .option.on {
    border-color: var(--proxy);
    box-shadow: inset 0 0 0 1px var(--proxy);
  }
  .option input {
    margin-top: 3px;
    accent-color: var(--proxy);
  }
  .option > span {
    display: grid;
    gap: 2px;
  }
  .after {
    margin-top: 10px;
  }
</style>

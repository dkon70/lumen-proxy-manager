<script lang="ts">
  import { normalizeDomain } from '../../shared/domain';
  import { buildPac } from '../../shared/pac';
  import { remotePacText } from '../../shared/pacSource';
  import { explainRoute, isProxyResult, matchRule } from '../../shared/route';
  import { createPacEvaluator, EXACT_ROUTE_CHECK } from '#platform';
  import { proxyToken } from '../../shared/pac';
  import { activeProxy } from '../../shared/settings';
  import { localized, type Localized } from '../../shared/i18n';
  import { t, tl } from '../../ui/i18n.svelte';
  import { app } from '../../ui/store.svelte';

  const evaluator = createPacEvaluator();

  let text = $state('');
  let results = $state<{ input: string; host: string; result: string; why: Localized; unknown?: boolean }[]>([]);
  let error = $state<Localized | null>(null);

  function toUrl(line: string): string | null {
    const t = line.trim();
    if (!t) return null;
    try {
      const u = new URL(t.includes('://') ? t : `https://${t}`);
      return u.protocol === 'http:' || u.protocol === 'https:' ? `${u.protocol}//${u.host}/` : null;
    } catch {
      return null;
    }
  }

  function explainOffline(url: string, hasPac: boolean) {
    const s = app.settings;
    const host = new URL(url).hostname.replace(/^\[|\]$/g, '');
    const route = explainRoute(s, host, hasPac);
    const proxy = activeProxy(s);
    const via = proxy ? proxyToken(proxy) + (s.blockDirect ? '' : '; DIRECT') : 'DIRECT';
    const result = route.kind === 'proxy' ? via : route.kind === 'direct' ? 'DIRECT' : t('check.pacUnknown');
    const why = route.rule
      ? localized(route.rule.list === 'proxyList' ? 'check.why.proxyRule' : 'check.why.directRule', { rule: route.rule.rule })
      : localized(route.reason === 'global' ? 'check.why.global' : route.reason === 'pac' ? 'check.pacUnknown' : 'check.why.default');
    return { input: url, host, result, why, unknown: route.kind === 'pac' };
  }

  async function run(e: SubmitEvent) {
    e.preventDefault();
    error = null;
    const s = app.settings;
    const lines = text.split(/\s+/).filter(Boolean).slice(0, 50);
    const urls = lines.map(toUrl).filter((u): u is string => u !== null);
    if (!urls.length) return void (error = localized('check.enterAddress'));
    if (s.mode === 'system') return void (error = localized('check.off'));
    const hasPac = remotePacText(s, app.pac) !== null;
    const r = await evaluator.route(buildPac({ settings: s, remotePac: remotePacText(s, app.pac) }), urls);
    if (r === null) return void (results = urls.map((url) => explainOffline(url, hasPac)));
    if (!Array.isArray(r)) return void (error = r);
    results = r.map((x) => {
      const m = matchRule(s, x.host);
      const why = m
        ? localized(m.list === 'proxyList' ? 'check.why.proxyRule' : 'check.why.directRule', { rule: m.rule })
        : localized(s.mode === 'global' ? 'check.why.global' : hasPac ? 'check.why.pacOrDefault' : 'check.why.default');
      return { input: x.url, host: x.host, result: x.result, why };
    });
  }
</script>

<p class="lead">{t(EXACT_ROUTE_CHECK ? 'check.lead' : 'check.leadFirefox')}</p>

<form class="panel padded form" onsubmit={run}>
  <label class="field">
    <span>{t('check.addresses')}</span>
    <textarea class="input" rows="3" bind:value={text} placeholder={'youtube.com\nhttps://mail.google.com/'} spellcheck="false"></textarea>
  </label>
  <div class="row-actions"><button class="btn primary" type="submit">{t('check.run')}</button></div>
  {#if error}<p class="note error">{tl(error)}</p>{/if}
</form>

{#if results.length}
  <div class="panel">
    {#each results as r (r.input)}
      {@const proxied = !r.unknown && isProxyResult(r.result)}
      <div class="res">
        <span class="dot" class:proxied class:unknown={r.unknown}></span>
        <div class="info">
          <strong>{normalizeDomain(r.host) ?? r.host}</strong>
          <span class="hint">{tl(r.why)}</span>
        </div>
        <code class:proxied>{r.result}</code>
      </div>
    {/each}
  </div>
{/if}

<style>
  .form {
    display: grid;
    gap: 12px;
  }
  .res {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 0;
  }
  .dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--direct);
    flex: none;
  }
  .dot.unknown {
    background: var(--faint);
  }
  .dot.proxied {
    background: var(--proxy);
  }
  .info {
    flex: 1;
    display: grid;
    min-width: 0;
  }
  code {
    font-family: var(--mono);
    font-size: 12.5px;
    color: var(--direct);
    text-align: right;
    word-break: break-all;
  }
  code.proxied {
    color: var(--proxy);
  }
</style>

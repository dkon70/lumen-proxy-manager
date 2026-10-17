<script lang="ts">
  import { hostSuffixes, normalizeDomain, parseDomainList } from '../../shared/domain';
  import type { Localized } from '../../shared/i18n';
  import { formatNumber, t, tl } from '../../ui/i18n.svelte';
  import { app, update } from '../../ui/store.svelte';

  type ListKey = 'proxyList' | 'directList';

  interface Props {
    list: ListKey;
  }
  let { list }: Props = $props();

  const other = $derived<ListKey>(list === 'proxyList' ? 'directList' : 'proxyList');
  const moveLabel = $derived(t(list === 'proxyList' ? 'lists.moveToDirect' : 'lists.moveToProxy'));

  const ROW = 38;
  const OVERSCAN = 8;

  let query = $state('');
  let addText = $state('');
  let addError = $state<Localized | null>(null);
  let selected = $state(new Set<string>());
  let scrollTop = $state(0);
  let viewport = $state(480);
  let undo = $state<{ list: ListKey; items: string[]; text: Localized } | null>(null);
  let undoTimer: ReturnType<typeof setTimeout> | undefined;
  let searchEl: HTMLInputElement | undefined = $state();
  let scroller: HTMLDivElement | undefined = $state();

  const items = $derived(app.settings[list]);
  const sorted = $derived([...items].sort());
  const q = $derived(query.trim().toLowerCase());

  const covering = $derived.by(() => {
    if (!q) return [];
    const host = normalizeDomain(q);
    if (!host) return [];
    const set = new Set(items);
    return hostSuffixes(host).filter((h) => set.has(h) && h !== host);
  });

  const filtered = $derived(q ? sorted.filter((d) => d.includes(q)) : sorted);
  const rows = $derived(covering.length ? [...covering, ...filtered.filter((d) => !covering.includes(d))] : filtered);

  const start = $derived(Math.max(0, Math.floor(scrollTop / ROW) - OVERSCAN));
  const end = $derived(Math.min(rows.length, Math.ceil((scrollTop + viewport) / ROW) + OVERSCAN));
  const visible = $derived(rows.slice(start, end));

  const allVisibleSelected = $derived(rows.length > 0 && rows.every((d) => selected.has(d)));

  $effect(() => {
    void q;
    void list;
    scrollTop = 0;
    if (scroller) scroller.scrollTop = 0;
  });

  $effect(() => {
    void list;
    selected = new Set();
  });

  function highlight(d: string): [string, string, string] {
    if (!q) return [d, '', ''];
    const i = d.indexOf(q);
    return i < 0 ? [d, '', ''] : [d.slice(0, i), d.slice(i, i + q.length), d.slice(i + q.length)];
  }

  async function add(e?: SubmitEvent) {
    e?.preventDefault();
    const { valid, invalid } = parseDomainList(addText);
    if (!valid.length) {
      addError = invalid.length ? { key: 'lists.notADomain', params: { items: invalid.slice(0, 3).join(', ') } } : null;
      return;
    }
    const target = list;
    const otherList = other;
    await update((x) => {
      const set = new Set(x[target]);
      const move = new Set(valid);
      for (const d of valid) set.add(d);
      x[target] = [...set];
      x[otherList] = x[otherList].filter((d) => !move.has(d));
    });
    addText = '';
    addError = invalid.length ? { key: 'lists.skipped', params: { items: invalid.slice(0, 5).join(', ') + (invalid.length > 5 ? '…' : '') } } : null;
  }

  function showUndo(items: string[], text: Localized) {
    clearTimeout(undoTimer);
    undo = { list, items, text };
    undoTimer = setTimeout(() => (undo = null), 8000);
  }

  async function remove(domains: string[]) {
    const drop = new Set(domains);
    const target = list;
    await update((x) => void (x[target] = x[target].filter((d) => !drop.has(d))));
    selected = new Set([...selected].filter((d) => !drop.has(d)));
    showUndo(domains, domains.length === 1 ? { key: 'lists.removedOne', params: { domain: domains[0] } } : { key: 'lists.removedMany', params: { count: domains.length } });
  }

  async function move(domains: string[]) {
    const set = new Set(domains);
    const from = list;
    const to = other;
    await update((x) => {
      x[from] = x[from].filter((d) => !set.has(d));
      x[to] = [...new Set([...x[to], ...domains])];
    });
    selected = new Set();
  }

  async function restore() {
    if (!undo) return;
    const { list: target, items: back } = undo;
    await update((x) => void (x[target] = [...new Set([...x[target], ...back])]));
    undo = null;
  }

  function toggle(d: string) {
    const next = new Set(selected);
    if (next.has(d)) next.delete(d);
    else next.add(d);
    selected = next;
  }

  function toggleAll() {
    selected = allVisibleSelected ? new Set() : new Set(rows);
  }

  function exportList() {
    const blob = new Blob([sorted.join('\n') + '\n'], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = list === 'proxyList' ? 'lumen-proxy-list.txt' : 'lumen-direct-list.txt';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  async function importFile(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    addText = await file.text();
    await add();
  }

  function onWindowKey(e: KeyboardEvent) {
    const t = e.target as HTMLElement;
    if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName)) {
      e.preventDefault();
      searchEl?.focus();
    }
  }
</script>

<svelte:window onkeydown={onWindowKey} />

<form class="add" onsubmit={add}>
  <textarea
    class="input"
    rows={addText.includes('\n') ? 4 : 1}
    placeholder={t('lists.addPlaceholder')}
    bind:value={addText}
    onkeydown={(e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        add();
      }
    }}
    aria-label={t('lists.addLabel')}
  ></textarea>
  <button class="btn primary" type="submit" disabled={!addText.trim()}>{t('common.add')}</button>
</form>
{#if addError}<p class="error-text add-error">{tl(addError)}</p>{/if}

<div class="box">
  <div class="toolbar">
    <div class="search">
      <svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5" /><path d="M13 13l4 4" /></svg>
      <input
        bind:this={searchEl}
        class="input"
        type="search"
        placeholder={t('lists.searchPlaceholder')}
        bind:value={query}
        onkeydown={(e) => e.key === 'Escape' && (query = '')}
        aria-label={t('lists.searchLabel')}
        spellcheck="false"
      />
    </div>
    <span class="count" aria-live="polite">
      {#if q}{t('lists.foundOf', { found: formatNumber(filtered.length), total: formatNumber(items.length) })}{:else}{formatNumber(items.length)}{/if}
    </span>
  </div>

  {#if selected.size}
    <div class="bulk">
      <span>{t('lists.selected', { count: formatNumber(selected.size) })}</span>
      <button class="btn small" onclick={() => move([...selected])}>{moveLabel}</button>
      <button class="btn small danger" onclick={() => remove([...selected])}>{t('common.delete')}</button>
      <button class="btn small ghost" onclick={() => (selected = new Set())}>{t('lists.clearSelection')}</button>
    </div>
  {/if}

  {#if rows.length}
    <div class="head">
      <input type="checkbox" checked={allVisibleSelected} onchange={toggleAll} aria-label={t(q ? 'lists.selectAllFound' : 'lists.selectAll')} />
      <span class="muted">{t(q ? 'lists.selectAllFound' : 'lists.selectAll')}</span>
    </div>
    <div
      class="scroller"
      bind:this={scroller}
      bind:clientHeight={viewport}
      onscroll={(e) => (scrollTop = e.currentTarget.scrollTop)}
      role="list"
    >
      <div style:height="{rows.length * ROW}px" class="spacer">
        {#each visible as d, i (d)}
          {@const [a, b, c] = highlight(d)}
          <div class="row" role="listitem" style:transform="translateY({(start + i) * ROW}px)" class:sel={selected.has(d)}>
            <input type="checkbox" checked={selected.has(d)} onchange={() => toggle(d)} aria-label={t('lists.select', { domain: d })} />
            <span class="domain" title={d}>{a}{#if b}<mark>{b}</mark>{/if}{c}</span>
            {#if covering.includes(d)}<span class="tag">{t('lists.covers', { query: q })}</span>{/if}
            <span class="row-actions">
              <button class="btn small ghost" onclick={() => move([d])} title={moveLabel}>{t('lists.move')}</button>
              <button class="btn small ghost danger" onclick={() => remove([d])} aria-label={t('lists.deleteItem', { domain: d })}>{t('common.delete')}</button>
            </span>
          </div>
        {/each}
      </div>
    </div>
  {:else}
    <p class="empty">
      {#if q}
        {t('lists.nothingFound', { query: q })}
        {#if normalizeDomain(q)}<button class="btn small" onclick={() => ((addText = q), add())}>{t('lists.addDomain', { domain: normalizeDomain(q) ?? q })}</button>{/if}
      {:else if list === 'proxyList'}
        {t('lists.emptyProxy')}
      {:else}
        {t('lists.emptyDirect')}
      {/if}
    </p>
  {/if}
</div>

<div class="row-actions footer">
  <label class="btn">
    {t('lists.import')}
    <input type="file" accept=".txt,.list,.conf,text/plain" class="sr-only" onchange={importFile} />
  </label>
  <button class="btn" onclick={exportList} disabled={!items.length}>{t('lists.export')}</button>
</div>

{#if undo}
  <div class="toast" role="status">
    <span>{tl(undo.text)}</span>
    <button class="btn small" onclick={restore}>{t('lists.undo')}</button>
  </div>
{/if}

<style>
  .add {
    display: flex;
    gap: 8px;
    align-items: flex-start;
  }
  .add textarea {
    min-height: 34px;
    font-family: var(--font);
    font-size: 14px;
    line-height: 1.3;
    resize: none;
  }
  .add .btn {
    height: 34px;
  }
  .add-error {
    margin-top: 6px;
  }
  .box {
    margin-top: 14px;
    border: 1px solid var(--line);
    border-radius: var(--r-lg);
    background: var(--surface);
    overflow: hidden;
  }
  .toolbar {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px;
    border-bottom: 1px solid var(--line);
  }
  .search {
    position: relative;
    flex: 1;
  }
  .search svg {
    position: absolute;
    left: 10px;
    top: 9px;
    width: 16px;
    height: 16px;
    fill: none;
    stroke: var(--faint);
    stroke-width: 1.8;
    stroke-linecap: round;
  }
  .search input {
    padding-left: 34px;
    background: var(--raised);
    border-color: transparent;
  }
  .count {
    color: var(--muted);
    font-size: 13px;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .bulk {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    background: var(--global-soft);
    font-size: 13px;
    font-weight: 500;
  }
  .bulk span {
    margin-right: auto;
  }
  .head {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 6px 14px;
    border-bottom: 1px solid var(--line);
    font-size: 13px;
  }
  .scroller {
    height: clamp(280px, calc(100vh - 380px), 720px);
    overflow-y: auto;
    contain: strict;
  }
  .spacer {
    position: relative;
  }
  .row {
    position: absolute;
    left: 0;
    right: 0;
    top: 0;
    height: 38px;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 0 8px 0 14px;
    border-bottom: 1px solid var(--line);
  }
  .row:hover,
  .row:focus-within {
    background: var(--raised);
  }
  .row.sel {
    background: var(--global-soft);
  }
  input[type='checkbox'] {
    width: 15px;
    height: 15px;
    margin: 0;
    accent-color: var(--global);
  }
  .domain {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  mark {
    background: color-mix(in srgb, var(--direct) 28%, transparent);
    color: inherit;
    border-radius: 2px;
  }
  .tag {
    padding: 1px 8px;
    border-radius: 999px;
    background: var(--proxy-soft);
    color: var(--proxy);
    font-size: 12px;
    white-space: nowrap;
  }
  .row .row-actions {
    gap: 2px;
    flex-wrap: nowrap;
    opacity: 0;
  }
  .row:hover .row-actions,
  .row:focus-within .row-actions {
    opacity: 1;
  }
  .empty {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
    padding: 28px 16px;
    color: var(--muted);
  }
  .footer {
    margin-top: 14px;
  }
  .toast {
    position: fixed;
    left: 50%;
    bottom: 24px;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 10px 12px 10px 16px;
    border-radius: var(--r-md);
    background: var(--ink);
    color: var(--surface);
    box-shadow: var(--shadow);
  }
  .toast .btn {
    background: transparent;
    color: inherit;
    border-color: color-mix(in srgb, var(--surface) 40%, transparent);
  }
  @media (hover: none) {
    .row .row-actions {
      opacity: 1;
    }
  }
</style>

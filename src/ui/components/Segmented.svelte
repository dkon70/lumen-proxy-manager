<script lang="ts" generics="T extends string">
  interface Props {
    value: T;
    options: { value: T; label: string; tone?: 'proxy' | 'global' | 'off' }[];
    label: string;
    onchange: (v: T) => void;
  }
  let { value, options, label, onchange }: Props = $props();

  function onkeydown(e: KeyboardEvent) {
    const i = options.findIndex((o) => o.value === value);
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = options[(i + step + options.length) % options.length];
    onchange(next.value);
    (e.currentTarget as HTMLElement).querySelector<HTMLElement>(`[data-v="${next.value}"]`)?.focus();
  }
</script>

<div class="seg" role="radiogroup" aria-label={label} tabindex="-1" {onkeydown}>
  {#each options as o (o.value)}
    <button
      type="button"
      role="radio"
      aria-checked={o.value === value}
      tabindex={o.value === value ? 0 : -1}
      data-v={o.value}
      data-tone={o.tone ?? 'proxy'}
      class:on={o.value === value}
      onclick={() => onchange(o.value)}>{o.label}</button
    >
  {/each}
</div>

<style>
  .seg {
    display: grid;
    grid-auto-columns: 1fr;
    grid-auto-flow: column;
    gap: 2px;
    padding: 3px;
    border-radius: var(--r-md);
    background: var(--raised);
    border: 1px solid var(--line);
  }
  button {
    height: 30px;
    border: 0;
    border-radius: 7px;
    background: transparent;
    color: var(--muted);
    font-weight: 500;
    cursor: pointer;
  }
  button:hover:not(.on) {
    color: var(--ink);
  }
  button.on {
    background: var(--surface);
    color: var(--ink);
    box-shadow: var(--shadow);
  }
  button.on[data-tone='proxy'] {
    color: var(--proxy);
  }
  button.on[data-tone='global'] {
    color: var(--global);
  }
</style>

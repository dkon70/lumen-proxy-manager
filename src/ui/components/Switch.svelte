<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    checked: boolean;
    onchange: (v: boolean) => void;
    label: string;
    children?: Snippet;
    disabled?: boolean;
  }
  let { checked, onchange, label, children, disabled = false }: Props = $props();
</script>

<label class="row" class:disabled>
  <span class="text">
    <span class="label">{label}</span>
    {#if children}<span class="hint">{@render children()}</span>{/if}
  </span>
  <input type="checkbox" role="switch" {checked} {disabled} onchange={(e) => onchange(e.currentTarget.checked)} />
</label>

<style>
  .row {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    padding: 14px 0;
    cursor: pointer;
  }
  .row.disabled {
    opacity: 0.55;
    cursor: default;
  }
  .text {
    display: grid;
    gap: 2px;
  }
  .label {
    font-weight: 500;
  }
  input {
    appearance: none;
    flex: none;
    position: relative;
    width: 38px;
    height: 22px;
    margin: 0;
    border-radius: 11px;
    background: var(--line-strong);
    cursor: inherit;
    transition: background 0.15s;
  }
  input::after {
    content: '';
    position: absolute;
    top: 3px;
    left: 3px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: #fff;
    box-shadow: 0 1px 2px rgb(0 0 0 / 25%);
    transition: transform 0.15s;
  }
  input:checked {
    background: var(--proxy);
  }
  input:checked::after {
    transform: translateX(16px);
  }
</style>

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { Resvg } = require('@resvg/resvg-js');

export const STATES = {
  rules: { from: '#12B3A3', to: '#0F8A7E', edge: '#0A5E56' },
  global: { from: '#6B70F0', to: '#4A4FD6', edge: '#2F33A8' },
  off: { from: '#A3ACB9', to: '#8A94A3', edge: '#5E6977' },
  error: { from: '#E2604B', to: '#C2412D', edge: '#8A2A1C' },
};

const SOURCE = readFileSync(new URL('../assets/icon.svg', import.meta.url), 'utf8');

function recolor(svg, { from, to, edge }) {
  return svg.replace('#12B3A3', from).replace('#0F8A7E', to).replace('#0A5E56', edge);
}

const SMALL = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#12B3A3"/>
      <stop offset="100%" stop-color="#0F8A7E"/>
    </linearGradient>
  </defs>
  <path d="M64 3 L119 20 V63 C119 96 97 118 64 126 C31 118 9 96 9 63 V20 Z" fill="url(#g)" stroke="#0A5E56" stroke-width="4"/>
  <circle cx="64" cy="62" r="33" fill="none" stroke="#FFFFFF" stroke-width="10"/>
  <ellipse cx="64" cy="62" rx="13" ry="33" fill="none" stroke="#FFFFFF" stroke-width="8"/>
  <line x1="31" y1="62" x2="97" y2="62" stroke="#FFFFFF" stroke-width="8"/>
</svg>`;

export function iconSvg(state, size) {
  return recolor(size <= 32 ? SMALL : SOURCE, STATES[state]);
}

export function renderPng(state, size) {
  return new Resvg(iconSvg(state, size), { fitTo: { mode: 'width', value: size } }).render().asPng();
}

if (process.argv[1]?.endsWith('icons.mjs')) {
  mkdirSync('public/icons', { recursive: true });
  for (const size of [16, 32, 48, 128]) writeFileSync(`public/icons/${size}.png`, renderPng('rules', size));
  for (const state of Object.keys(STATES)) {
    for (const size of [16, 32]) writeFileSync(`public/icons/${state}-${size}.png`, renderPng(state, size));
  }
}

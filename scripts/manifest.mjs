import { readFileSync } from 'node:fs';

const read = (name) => JSON.parse(readFileSync(new URL(`../manifest/${name}.json`, import.meta.url), 'utf8'));

function merge(base, override) {
  const out = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (value === null) delete out[key];
    else if (value && typeof value === 'object' && !Array.isArray(value) && out[key] && typeof out[key] === 'object' && !Array.isArray(out[key])) {
      out[key] = merge(out[key], value);
    } else out[key] = value;
  }
  return out;
}

export function buildManifest(target) {
  if (target !== 'chrome' && target !== 'firefox') throw new Error(`Unknown target: ${target}`);
  return merge(read('base'), read(target));
}

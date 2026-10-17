---
name: add-setting
description: Add a new user-facing setting to Lumen Proxy end to end (type, default, validation, background effect, UI, backup, tests). Use when the user asks for a new option, toggle or preference.
---

# Add a setting

Settings are one object in `chrome.storage.local` under the `settings` key. Every layer reads it through
`normalizeSettings()`, so a field that is not wired there silently disappears.

## Steps

1. **Type** - add the field to `Settings` in `src/shared/types.ts`. Prefer string unions over booleans when
   a third state is plausible (see `WebRtcPolicy`).

2. **Default** - add it to `DEFAULT_SETTINGS` in `src/shared/settings.ts`. Pick the safer default.

3. **Validation** - add it to `normalizeSettings()`:
   - enums: `pick(r.field, ALLOWED, fallback)`
   - booleans: `r.field === true` (default false) or `r.field !== false` (default true)
   - numbers: `Number()`, check `Number.isFinite`, clamp to a range
   - strings: `str(value, maxLength)`; domains: `domains(value)`
   Anything that can reach the PAC script must be validated strictly here; never trust it later.

4. **Effect** - if Chrome state must change, do it in `applyNow()` in `src/background/index.ts`.
   It already runs on every settings change. If it needs a new permission:
   - add it to `optional_permissions` in `public/manifest.json`, not `permissions`;
   - check `chrome.permissions.contains` in the background and skip silently when missing;
   - request it in the UI handler, as the first `await` of the click handler.
   If it affects routing, follow the `pac-routing` skill instead of editing `pac.ts` ad hoc.
   If the browser API differs between Chrome and Firefox, add it to the platform contract
   (`src/platform/types.ts`) and implement it in both `chrome.ts` and `firefox.ts` (see the `firefox` skill).

5. **UI** - add a control to the matching section in `src/options/sections/`:
   `update((x) => void (x.field = value))`. Use `Switch` for booleans and `Segmented` or radio cards for
   enums. If the setting matters day to day, consider the popup too.

6. **Strings** - every label, hint and error gets a key in `src/shared/i18n/en.ts` and the same key in
   `src/shared/i18n/ru.ts`; render with `t('key')`. Copy explains the consequence, not the mechanism.
   Errors produced in the background are stored as `Localized` (`{ key, params }`), never as text.

7. **Backup** - nothing to do unless the field is secret. Secrets must be stripped in `Backup.svelte`
   (`download`) unless the user opts in, and preserved on restore like proxy passwords.

8. **Tests** - add a `normalizeSettings` case (bad input falls back to the default). If it changes routing,
   add PAC tests in `tests/pac.test.ts`; if it calls a `chrome.*` API, add a check to `e2e/run.mjs`.

9. **Verify** - `npm test && npm run check && npm run build`, then `npm run e2e` and `npm run lint:firefox`
   if step 4 applied.

## Pitfalls

- `updateSettings` is serialized and re-reads storage; mutate the draft inside the callback, do not close
  over `app.settings`.
- Data written to storage by older versions lacks the field; `normalizeSettings` must supply the default.
- No comments in code; no literal UI strings outside the i18n dictionaries.

# AGENTS.md

Lumen Proxy is a Manifest V3 extension for Chrome and Firefox that routes traffic through user-defined proxies
by rules: own domain lists, an optional external PAC script, a "block DIRECT" kill switch and WebRTC leak settings.
UI is Svelte 5 (runes) + TypeScript, built with Vite. One codebase, two build targets.

## Commands

```bash
npm run build           # both targets: dist/chrome and dist/firefox
npm run build:chrome    # icons -> vite build --mode chrome (+ sandbox bundle, manifest) -> dist/chrome
npm run build:firefox   # icons -> vite build --mode firefox (+ manifest) -> dist/firefox
npm test                # vitest: PAC generator, routing, i18n, manifests, Firefox platform and bundle
npm run check           # svelte-check, must report 0 errors and 0 warnings
npm run lint:firefox    # Mozilla addons-linter on dist/firefox: 0 errors required
npm run e2e             # real Chromium run of dist/chrome against local proxy + PAC servers
npm run e2e:shots       # same, plus screenshots of popup/options (light/dark, en/ru)
npm run e2e:firefox     # real Firefox run of dist/firefox (setup flow, routing, auth, PAC, block DIRECT)
npm run dev:chrome      # watch build of one target (also dev:firefox)
npm run zip             # lumen-proxy-chrome.zip and lumen-proxy-firefox.zip (also zip:chrome, zip:firefox)
npm run zip:source      # lumen-proxy-source.zip for AMO review (git files minus store/, .github/)
npm run store           # build:chrome, then store screenshots and promo images (en/ru/global) into store/
```

A change is done when `npm test`, `npm run check` and `npm run build` pass. Run `npm run e2e` after touching
`src/background/`, `src/platform/chrome.ts`, `src/shared/pac.ts` or the manifest; run `npm run lint:firefox`
after touching `src/platform/firefox.ts` or `manifest/`, and `npm run e2e:firefox` after touching anything that
runs in Firefox.

## Layout

```
src/background/index.ts     background (SW in Chrome, event page in Firefox): settings, PAC fetch, auth, rollback
src/platform/               browser-specific code, selected at build time through the `#platform` alias
  types.ts                  BackgroundPlatform / PacEvaluator contract; contract.ts type-checks both targets
  chrome.ts                 proxy.settings pac_script + mandatory, offscreen sandbox, asyncBlocking auth
  firefox.ts                proxy.settings autoConfig (data: URL, blob: URL over the 1 MiB pref limit), acorn syntax check, blocking auth
  api.ts                    `ext` = `chrome` or `browser`, fixed at build time by __TARGET__
src/shared/                 code shared by background and UI (no DOM, no Svelte)
  types.ts                  Settings, PacCache, Status
  settings.ts               DEFAULT_SETTINGS, normalizeSettings() - the single validation gate
  storage.ts                storage.local access, serialized updateSettings()
  pac.ts                    buildPac(): generates the final PAC script
  route.ts                  matchRule(), explainRoute(): JS mirror of the PAC decision, used by the UI
  pacSource.ts              PAC URL checks, size limit, hashing
  i18n/                     en.ts (source of keys), ru.ts, translate/resolveLang/LocalizedError
  sandboxProtocol.ts        SandboxClient: talks to the sandbox iframe
src/sandbox/                sandboxed page (null origin, no network) that evaluates PAC scripts
src/offscreen/              offscreen document so the service worker can reach the sandbox
src/popup/, src/options/    Svelte UI; options sections live in src/options/sections/
src/ui/                     theme.css (design tokens), store.svelte.ts, i18n.svelte.ts (reactive t()), components
manifest/                   base.json + chrome.json / firefox.json overrides, merged by scripts/manifest.mjs
public/                     icons and _locales (name/description), copied to both targets
static/chrome/sandbox.html  Chrome-only sandbox page; the IIFE sandbox bundle is built in vite.config.ts
assets/icon.svg             source icon (shield with globe); scripts/icons.mjs renders it with resvg into
                            public/icons/: manifest sizes plus per-state toolbar icons (<state>-16/32.png),
                            using a simplified, thicker variant for 16/32 px
scripts/                    icon generator, manifest merge, zip, licenses.mjs (LICENSE.txt with bundled
                            third-party notices, generated from the module graph on every build),
                            store.mjs (store screenshots and promo images, marketing copy in its COPY table)
store/                      store listing: description.en/ru.txt, privacy.en.txt (permission justifications,
                            remote code and data usage answers), generated screenshots/ and promo/
README.md, README.ru.md     GitHub readme in English and Russian; .github/assets/ holds the official store badges
tests/                      vitest unit tests; e2e/run.mjs is the Chromium end-to-end test
```

## Architecture rules

- **Two targets, one codebase.** Browser-specific calls live only in `src/platform/*.ts`; everything else uses
  `ext` from `src/platform/api.ts` and `#platform` exports (`background`, `createPacEvaluator`, `TARGET`,
  `BROWSER_NAME`, `EXACT_ROUTE_CHECK`). A Firefox limitation must never change the Chrome build:
  `tests/manifest.test.ts` pins the Chrome manifest, and `npm run e2e` must stay green.
- **Firefox specifics:** `proxy.settings` works only when the user allows "Run in Private Windows"; until then
  `Status.accessProblem` is `firefox.privateAccess` and `FirefoxSetup.svelte` replaces the popup content and tops the
  options page with step-by-step instructions (extensions cannot request this permission or open about:addons).
  Granting it restarts the extension, which fires `onInstalled` (`update`), so settings apply without user action; no sandbox/offscreen, so the external PAC is only
  syntax-checked (acorn) and the UI explains routes with `explainRoute()` instead of running the PAC
  (for PAC-decided hosts the popup shows the proxy that loaded the tab, from `webRequest` `proxyInfo`);
  no `pacScript.mandatory`; `proxy.settings.onChange` does not exist.
- **State lives in `chrome.storage.local`.** UI writes settings via `update()` / `updateSettings()`;
  the background listens to `storage.onChanged` and re-applies. Do not add message types for things storage
  already propagates. Messages (`src/shared/messages.ts`) are only for actions: `refreshPac`, `applyNow`, and `sync`
  (Firefox only: `updateSettings()` sends it because `storage.onChanged` may not wake a suspended event page; the background
  re-applies when the settings fingerprint in `storage.session` differs, also on every event page start).
- **Everything read from storage or an imported file goes through `normalizeSettings()`.** It is the only
  place that validates input; the PAC generator trusts its output. New fields must be validated there.
- **Routing logic exists twice**: in the generated PAC (`pac.ts`) and in `route.ts` for the UI. Keep them in sync;
  `tests/route.test.ts` compares them on a host matrix.
- **The PAC script must be pure ASCII.** Chrome rejects `pacScript.data` otherwise; `buildPac` escapes via `toAscii`.
- **Background listeners are registered at top level**, synchronously, so they survive SW / event page restarts.
- **No remote code, no inline scripts.** Extension CSP is `script-src 'self'`. Only the sandbox page may `eval`,
  and its CSP has `connect-src 'none'`.
- **Least privilege.** Host permissions are optional and requested at the moment of need, from a user gesture
  (`chrome.permissions.request` must be the first `await` in the click handler).

## Security invariants (do not break)

- External PAC code runs inside a closure; our code captures `Reflect.apply`, `String.prototype.*`, etc. before
  it runs, and `FindProxyForURL` is made non-writable. Never add `"use strict"` to the wrapper: it would make
  the external PAC strict and break legacy scripts.
- With `blockDirect`, no route may fall back to `DIRECT`; in Chrome `pacScript.mandatory` must equal `blockDirect`.
- Own lists always win over the external PAC; the more specific rule wins, `directList` wins on a tie.
- Proxy credentials are given only to the proxy whose host:port matches the challenger, once per request.
- Credentials are never synced and are excluded from backups unless the user opts in.
- Fetched PAC: HTTPS only (HTTP only with explicit `allowHttp`), `credentials: 'omit'`, 32 MB limit (`MAX_PAC_MB`; the generated PAC
  goes through `runtime.sendMessage`, capped by Chrome at 64 MB), 30 s idle timeout,
  validated before it is applied (Chrome: sandbox run; Firefox: acorn parse), rolled back on `ERR_PAC_SCRIPT_FAILED`
  (Chrome).

Each invariant has a test in `tests/pac.test.ts` or `e2e/run.mjs`. Add a test when adding a new one.

## Code style

- TypeScript strict, ES modules, 2-space indent, single quotes, semicolons, ~130 columns.
- No comments in code. Prefer clear names and small functions; put rationale in commit messages or docs.
- Svelte 5 runes only (`$state`, `$derived`, `$effect`, `$props`); no legacy `export let` or stores.
- Styles use tokens from `src/ui/theme.css` (`--proxy`, `--direct`, `--danger`, ...). Never hard-code colors;
  every color must work in both light and dark themes.

## Language

- Code, identifiers, AGENTS.md and skills: English.
- `README.md` (English) and `README.ru.md` (Russian) have the same content; change both together.
- The UI is bilingual: English and Russian. The `language` setting is `auto | ru | en`; `auto` resolves to Russian
  only when the browser UI language starts with `ru`, otherwise English (`resolveLang` in `src/shared/i18n`).
- No user-facing literal strings in components or background code. Add a key to `src/shared/i18n/en.ts` and the
  same key to `ru.ts` (missing keys fail `npm run check`; key and `{param}` parity is tested in `tests/i18n.test.ts`).
- In Svelte use `t(key, params)` / `tl(localized)` / `formatNumber` / `formatDate` from `src/ui/i18n.svelte.ts`;
  they are reactive, so switching the language re-renders without reload.
- The background never stores translated text. Status errors, `RefreshResult` and sandbox errors are `Localized`
  (`{ key, params }`); throw `LocalizedError(key, params)`. Params may be nested `Localized` values. The toolbar
  tooltip is the only place the background translates (`translate(resolveLang(s.language), ...)`).
- Avoid plural forms: phrase counts as "Removed: 5" / "Удалено: 5".
- Copy style in both languages: plain, sentence case, active voice; errors say what happened and what to do.

## Skills

Task-specific instructions live in `.claude/skills/`:

- `add-setting` - add a new user setting end to end
- `pac-routing` - change routing / PAC generation safely
- `e2e-testing` - run and extend the Chromium end-to-end test
- `release` - version bump, build and package for both stores
- `firefox` - work on the Firefox target without breaking Chrome

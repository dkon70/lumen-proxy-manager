---
name: firefox
description: Work on the Firefox build of Lumen Proxy (src/platform/firefox.ts, manifest/firefox.json) or make any change that must behave differently in Firefox and Chrome. Use whenever a browser API differs between the two, or when the user reports a Firefox-only problem.
---

# Firefox target

Both browsers build from the same sources: `npm run build:chrome` → `dist/chrome`, `npm run build:firefox` →
`dist/firefox`. `vite --mode <target>` sets `__TARGET__` and points the `#platform` alias at
`src/platform/<target>.ts`; everything else is shared.

## Golden rule

A Firefox workaround must not change the Chrome build. Put browser-specific code only in
`src/platform/chrome.ts` / `src/platform/firefox.ts` behind the shared contract in `src/platform/types.ts`.
`src/platform/contract.ts` fails `npm run check` if the two modules drift apart; `tests/manifest.test.ts` fails if the
Chrome manifest changes.

## How Firefox differs (and what we do)

| Area | Chrome | Firefox |
|---|---|---|
| Background | service worker | event page (`background.scripts`, module) |
| Applying routes | `proxy.settings` `pac_script` + `mandatory` | `proxy.settings` `autoConfig` with the same PAC as `data:` URL, `proxyDNS: true`; over the 1 MiB pref limit (`MAX_PREF_URL`) a `blob:` URL held by the event page. Firefox keeps the loaded PAC when the blob dies with the page, but a dead blob after a browser restart means DIRECT until the background re-applies (`syncApplied()` on start) |
| Permission | — | user must allow "Run in Private Windows", else `set` throws → `Status.accessProblem` → `FirefoxSetup` guide |
| PAC validation | run in sandbox page via offscreen doc | `acorn` parse only (MV3 CSP forbids eval, no sandbox key) |
| Exact route in UI | runs the PAC (`createPacEvaluator().route`) | `route()` returns `null`; UI uses `explainRoute()`; for PAC-decided hosts the popup shows the proxy that actually loaded the tab (`watchRoutes`: `webRequest.onHeadersReceived` `proxyInfo` → `storage.session` `route:<tabId>`, needs host permission, ignored if older than `Status.appliedAt`) |
| Proxy auth | `onAuthRequired` + `asyncBlocking` + `webRequestAuthProvider` | `onAuthRequired` + `blocking` (Promise) + `webRequestBlocking` |
| Proxy errors | `proxy.onProxyError` (`net::ERR_*`) | `proxy.onError` + `webRequest.onErrorOccurred` filtered to `NS_ERROR_PROXY_*` etc. (needs host permission) |
| Waking the background | `storage.onChanged` wakes the SW | event page may sleep through `storage.onChanged`: `updateSettings()` sends `sync`, and every start runs `syncApplied()` (re-applies if the settings fingerprint changed) |
| Control by others | `proxy.settings.onChange` | not available; checked on every apply |

Map new Firefox error codes in `src/shared/errors.ts`. User-facing copy that names the browser takes `{browser}`
(`BROWSER_NAME`); copy whose meaning differs gets a separate `...Firefox` key in both dictionaries.

## Verify

```bash
npm test               # includes tests/firefox.test.ts (mocked browser API) and tests/firefox-bundle.test.ts
npm run check
npm run build
npm run lint:firefox   # addons-linter: 0 errors; the only accepted warning is Svelte's innerHTML in the runtime
npm run e2e:firefox    # real Firefox: setup flow without permission, then routing, auth, PAC, block DIRECT
npm run e2e            # Chrome must stay green
```

Firefox is found via `FIREFOX_PATH`, the usual install paths per OS (snap included), or downloaded once with
`@puppeteer/browsers` into `.e2e-browsers/`. Snap Firefox gets its profile under `~/snap/firefox/common/`.

## How the Firefox e2e works (`e2e/firefox.mjs`, `e2e/firefox-rdp.mjs`)

- WebDriver BiDi (Puppeteer) cannot see or open `moz-extension://` tabs, so extension control goes through the
  Firefox Remote Debugging Protocol (the protocol of about:debugging): Firefox starts with
  `--start-debugger-server`, `RdpClient` installs the temporary add-on and evaluates code in the background page or
  in an extension page via one shared watcher per add-on (a second watcher does not report existing tabs).
- Permissions are granted from the privileged parent-process console through `ExtensionPermissions`. Grant them
  *before* `installTemporaryAddon` when possible: reloading an add-on while devtools is attached to one of its pages
  that uses `browser.storage` hangs the devtools server (a minimal extension reproduces it; real Firefox reload
  itself completes, which the "setup flow" check verifies by browsing, not via RDP).
- `openOptionsPage()` reuses the current blank tab, so the test first navigates the initial tab to a data: page.
- Headless Firefox in WSL cannot capture screenshots through devtools; to review the Firefox UI, serve
  `dist/firefox` over HTTP and open `popup.html` / `options.html` in Chromium with a mocked `browser` global.

Manual check in a desktop Firefox is still worth doing before a release:
`about:debugging#/runtime/this-firefox` → "Load Temporary Add-on" → `dist/firefox/manifest.json`; the setup guide
must appear; after allowing private windows in about:addons, routing must start by itself.

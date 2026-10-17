---
name: e2e-testing
description: Run or extend the Lumen Proxy end-to-end test in real Chromium (e2e/run.mjs) and take UI screenshots. Use to verify background/manifest/chrome.* changes or to review the UI visually.
---

# End-to-end testing in Chromium

This skill covers the Chrome test (`npm run e2e`). The Firefox test (`npm run e2e:firefox`) is described in the
`firefox` skill.

`e2e/run.mjs` loads `dist/chrome` into headless Chromium and checks real routing against two local servers:

- `127.0.0.1:18080` - HTTP proxy requiring `Basic user:pa:ss`; answers `via-proxy:<host>`
- `127.0.0.1:18081` - serves the external PAC (`pacText`, mutable during the test)

Domains like `site.lumen` do not resolve, so `ERR_NAME_NOT_RESOLVED` proves a request went `DIRECT`
and `via-proxy:...` proves it went through the proxy.

## Run

```bash
npm run build:chrome
npm run e2e          # prints PASS/FAIL per check, exits 1 on failure
npm run e2e:shots    # also writes screenshots to .e2e/shots/ (popup + options, light/dark, en/ru)
```

The commands are the same on Linux, macOS and Windows (PowerShell or cmd).

## Which browser runs (`e2e/browser.mjs`)

1. `CHROME_PATH` if set.
2. A locally installed Chromium:
   - Linux: `/snap/bin/chromium`, `/usr/bin/chromium`, `/usr/bin/chromium-browser`
   - macOS: `/Applications/Chromium.app`, `~/Applications/Chromium.app`
   - Windows: `%LOCALAPPDATA%`, `%PROGRAMFILES%`, `%PROGRAMFILES(X86)%` + `\Chromium\Application\chrome.exe`
3. Otherwise **Chrome for Testing**, downloaded once via `@puppeteer/browsers` into `.e2e-browsers/`
   (~150 MB) and reused on later runs. Pin a version with `E2E_CHROME_VERSION=<build id>`.

Never point the test at branded Google Chrome: since 137 it ignores `--load-extension`, so the browser starts
without the extension and the test times out waiting for the service worker. Chrome for Testing and Chromium
still support the flag. `E2E_BROWSER=cft` forces step 3 even when Chromium is installed — use it to exercise
the macOS/Windows path from Linux.

Work files go to `.e2e/` inside the repo because snap Chromium cannot see the host `/tmp`.

`E2E_LARGE_PAC_MB` (default 12) sets the size of the generated PAC in the large-PAC check; use 31 to test
right below the 32 MB limit and 33 to see the rejection.

## How it works

- The test copies `dist/chrome` to `.e2e/ext` and pre-grants `<all_urls>` and `privacy` in that copy's manifest,
  since nobody can click permission prompts in headless mode. Never change the real manifest for tests.
- Chromium is spawned with `--remote-debugging-port` and Puppeteer connects to it. `puppeteer.launch()`
  hangs with snap Chromium; keep the spawn + connect approach.
- Extension APIs run in the service worker: `inExt(fn)`; settings are patched with `patchSettings({...})`.
- `refreshPac` is sent from the options page, because a service worker does not receive its own messages.
- The popup is opened with `chrome.action.openPopup()`; it can read the tab URL only thanks to the
  pre-granted host permission (a real click grants `activeTab`).

## Adding a check

```js
await patchSettings({ someField: 'value' });
await sleep(500);
check('what the user would notice', condition, detailForFailure);
```

Keep checks independent of order where possible; destructive steps (closing the proxy) stay at the end.

## Troubleshooting

- Hangs on connect: a previous browser is still holding the port, or use another one with `E2E_DEBUG_PORT`.
  Kill the old one:
  - Linux/macOS: `pkill -f "[r]emote-debugging-port=9334"` (the bracket stops pkill from matching your own shell)
  - Windows (PowerShell): `Get-CimInstance Win32_Process -Filter "CommandLine like '%remote-debugging-port=9334%'" | ForEach-Object { Stop-Process -Id $_.ProcessId }`
- "Could not start the browser": the test prints the browser's own error and a hint (for example missing
  shared libraries on Linux).
- "Timed out waiting for service_worker": the browser ignored `--load-extension` (branded Chrome via
  `CHROME_PATH`), or `dist/chrome` is stale — run `npm run build:chrome`.
- Windows: `EBUSY` when cleaning `.e2e/` means a browser from the previous run is still alive; kill it as above.
- Chrome for Testing on Linux needs the usual Chrome shared libraries; if it fails to start, install Chromium
  from the distro or run `npx @puppeteer/browsers install chrome@stable --install-deps` once (needs root).
- Settings not applied: look for `[lumen] apply failed` in the service worker console; non-ASCII in the PAC
  is the classic cause.
- To look at screenshots, read the PNGs in `.e2e/shots/`.

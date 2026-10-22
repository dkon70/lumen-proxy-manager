# Lumen Proxy

**English** · [Русский](README.ru.md)

![Lumen Proxy](store/promo/en/marquee-1400x560.png)

<p>
  <a href="https://chromewebstore.google.com/detail/lumen-proxy/bohgadimlbncallihhhnigidffjfalec"><img src=".github/assets/chrome-web-store.png" alt="Available in the Chrome Web Store" height="58"></a>
  <a href="https://addons.mozilla.org/firefox/addon/lumen-proxy/"><img src=".github/assets/firefox-addons.png" alt="Get the add-on for Firefox" height="58"></a>
</p>

A Chrome and Firefox extension that sends sites through your proxy by your own rules. Your own searchable domain list,
PAC scripts, blocking of direct connections and WebRTC leak protection. Light and dark theme follow the browser.
Interface in English and Russian.

## Features

**Modes**
- **Off**: the extension stays out of the way, browser and system settings apply.
- **By rules**: sites from your list and those chosen by the PAC script go through the proxy.
- **All traffic**: everything goes through the proxy except exceptions and local addresses.

**Site lists**
- Two lists: "Via proxy" and "Direct". A domain covers all its subdomains: `example.com` also covers
  `www.example.com`.
- When rules overlap, the more specific one wins. For example, `google.com` goes through the proxy
  and `mail.google.com` goes direct.
- Instant search with highlighting, even across tens of thousands of domains.
- Paste a site address into the search to see which rule covers it.
- Select several domains to delete them or move them to the other list. A deletion can be undone with "Undo".
- Add domains in bulk: comma-separated, one per line or as links. Import and export as `.txt`.

**PAC scripts**
- Connect a PAC script by link (with auto-update) or paste it as text.
- "Route to my proxy": sites the PAC sends to a proxy go through your server instead of the servers from the script.
- Your lists always take priority over the PAC script.

**Popup**
- Shows where the open site goes and which rule decided it.
- Add a site to a list or remove it in one click, choosing the domain level.
- Switch the mode and the active proxy right there.

**More**
- Several proxy servers: HTTP, HTTPS, SOCKS4, SOCKS5, with login and password.
  Paste a line like `socks5://user:pass@host:port` as a whole.
- "Check an address" shows where any address goes with the current settings.
- Settings backup to a file. Passwords are included only if you tick a separate box.
- Interface language: English or Russian. By default it follows the browser: Russian if the browser is in Russian,
  English otherwise. You can pick it manually in "Proxy servers → Interface".

## Security

- **Block DIRECT** (on by default):
  - if the proxy is unavailable, the site does not open: the extension never silently falls back to a direct connection;
  - `DIRECT` is removed from PAC answers like `PROXY …; DIRECT`;
  - if the PAC script itself breaks, Chrome blocks requests instead of letting them through directly.
- **PAC isolation.** An external script cannot bypass your lists or tamper with the extension's logic,
  even if it tries.
- **Checked before applying.** A new PAC version first runs in a sandbox with no network access.
  If it has errors, the previous version stays. If Chrome still cannot run it, the extension rolls back
  to the previous one.
- **PAC download** over HTTPS only (HTTP only if you allow it), without cookies, up to 32 MB. A slow download
  is not cut off while the server keeps sending data; it stops only after 30 seconds of silence.
- **Least privilege.** Site access is requested only when needed:
  - for one site, when loading a PAC script;
  - for all sites, only if your proxy needs a login (otherwise Chrome cannot pass the password).
- **Passwords** are stored only locally and are never synced. A password goes only to the proxy it was saved for;
  a wrong password is not retried in a loop.
- **No DNS leaks.** Local addresses are detected from the address itself, without DNS queries.
- **No data collection.** The extension sends nothing anywhere.

### WebRTC

By default the extension does not touch WebRTC, so calls keep working. The "Protection" section has three options:

| Option | Calls | What the site sees |
|---|---|---|
| Do not change | work as usual | your real IP |
| Hide local addresses | almost unchanged | your external IP, but not the addresses inside your network |
| Proxy only | possible delays, some services will not connect | only the proxy IP |

A good compromise is "Hide local addresses".

## Installation

- **Chrome** (also Edge, Brave, Opera, Yandex Browser): [Chrome Web Store](https://chromewebstore.google.com/detail/lumen-proxy/bohgadimlbncallihhhnigidffjfalec)
- **Firefox**: [Firefox Add-ons](https://addons.mozilla.org/firefox/addon/lumen-proxy/)

In Firefox, after installing open `about:addons` → Lumen Proxy → "Details" → "Run in Private Windows" →
**Allow**. Without it Firefox does not let extensions change proxy settings.

After installation the settings page opens: add a proxy server and choose a mode.

### Building from source

Requires Node.js 20.19+ and Chrome 116+ (or Edge, Brave, Opera, Yandex Browser) or Firefox 140+.

```bash
npm install
npm run build:chrome     # → dist/chrome
npm run build:firefox    # → dist/firefox
npm run build            # both at once
```

**Chrome:**
1. Open `chrome://extensions`.
2. Turn on "Developer mode".
3. Click "Load unpacked" and select the `dist/chrome` folder.

**Firefox:**
1. Open `about:debugging#/runtime/this-firefox`.
2. Click "Load Temporary Add-on" and select `dist/firefox/manifest.json`.
   A temporary add-on disappears when Firefox restarts; for a permanent install use the version from Firefox Add-ons.
3. Open `about:addons` → Lumen Proxy → "Details" → "Run in Private Windows" → **Allow**.
   Without it Firefox does not let extensions change proxy settings. Until it is allowed, the popup and the settings
   show step-by-step instructions; once allowed, Lumen turns on by itself.

## Development

```bash
npm run dev:chrome     # rebuild on changes; then "Reload" in chrome://extensions
npm run dev:firefox    # same for Firefox; then "Reload" in about:debugging
npm test               # unit tests: PAC, routing, translations, manifests, Firefox platform
npm run check          # type check (Svelte + TypeScript)
npm run lint:firefox   # Mozilla's official add-ons linter on dist/firefox
npm run e2e            # end-to-end test of the Chrome build in real Chromium
npm run e2e:shots      # same + UI screenshots in .e2e/shots/
npm run e2e:firefox    # end-to-end test of the Firefox build in real Firefox
npm run zip            # lumen-proxy-chrome.zip and lumen-proxy-firefox.zip (or zip:chrome / zip:firefox)
npm run zip:source     # sources for AMO review (lumen-proxy-source.zip, instructions in SOURCE_BUILD.md)
npm run store          # store screenshots and promo images in store/
```

All commands work the same on Linux, macOS and Windows.

The end-to-end test needs a browser that can load an extension from the command line. Regular Google Chrome
stopped doing that in version 137, so the test looks for a browser in this order:
1. the path in the `CHROME_PATH` environment variable, if set;
2. an installed Chromium in the standard locations for your OS;
3. otherwise it downloads **Chrome for Testing** (~150 MB) once into `.e2e-browsers/` and reuses it.

So on Windows and macOS there is nothing to install by hand: `npm run e2e` is enough.

Project layout, rules and security invariants are described in [AGENTS.md](AGENTS.md).
Step-by-step instructions for common tasks are in [.claude/skills](.claude/skills).

## Stack

Manifest V3, Svelte 5, TypeScript, Vite, Vitest, Puppeteer (tests only).
The built extension has no external dependencies other than the Svelte runtime.

## Chrome and Firefox: the differences

Both versions are built from one codebase. Everything browser-specific lives in a separate layer,
so Firefox limitations do not affect the Chrome version.

| | Chrome | Firefox |
|---|---|---|
| Lists, modes, PAC by link and as text, block DIRECT, WebRTC, password for HTTP/HTTPS proxies | yes | yes |
| Needs the "Run in Private Windows" permission | no | yes, otherwise Firefox does not allow changing the proxy |
| Checking a new PAC before applying it | runs in a sandbox | syntax check only |
| PAC rollback if the browser could not run it | yes | no |
| Proxy unavailable with block DIRECT | the site does not open | the site does not open |
| The PAC script itself is broken with block DIRECT | the browser blocks requests (`mandatory`) | not verified |
| Exact route in the popup and "Check an address" for sites decided by an external PAC | yes | shows "decided by the PAC script" |

Firefox extensions cannot run external PAC code in their own pages, so the exact PAC answer for a specific site
is not available in the interface. Firefox itself still runs the full final PAC, just like Chrome.

Both versions are covered by end-to-end tests in real browsers (`npm run e2e` and `npm run e2e:firefox`):
routing by lists and PAC, proxy password, block DIRECT with an unavailable proxy, rejection of a broken PAC.
For Firefox the test also covers the first-install flow: without the permission the proxy is not applied and
instructions are shown, and once it is granted routing turns on by itself.

## Browser limitations

- Neither Chrome nor Firefox can pass a login and password to a SOCKS proxy set through PAC. Use
  an HTTP/HTTPS proxy or SOCKS with IP-based access.
- Only one extension at a time can control the browser's proxy. If another extension holds it,
  the popup will warn you.
- PAC scripts that pick a route by IP with `dnsResolve` or `isInNet` make DNS queries outside
  the proxy. That is a property of the scripts themselves, not of the extension.

## License

[MIT](LICENSE) © 2026 dkon70.

Every build includes `LICENSE.txt`: the Lumen Proxy license and the licenses of the third-party libraries that
ended up in that build (Svelte, esm-env, and acorn in the Firefox version, all MIT). The list is generated
automatically from the module graph at build time.

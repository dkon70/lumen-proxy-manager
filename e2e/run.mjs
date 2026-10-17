import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { findBrowser } from './browser.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist', 'chrome');
const WORK = path.join(ROOT, '.e2e');
const EXT = path.join(WORK, 'ext');
const PROFILE = path.join(WORK, 'profile');
const BROWSERS = path.join(ROOT, '.e2e-browsers');
const SHOTS = process.argv.includes('--shots') ? path.join(WORK, 'shots') : null;
const PROXY_PORT = 18080;
const PAC_PORT = 18081;
const DEBUG_PORT = Number(process.env.E2E_DEBUG_PORT ?? 9334);
const LARGE_PAC_MB = Number(process.env.E2E_LARGE_PAC_MB ?? 12);

if (!fs.existsSync(path.join(DIST, 'manifest.json'))) throw new Error('Run `npm run build:chrome` first');
fs.rmSync(WORK, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
fs.cpSync(DIST, EXT, { recursive: true });
const manifest = JSON.parse(fs.readFileSync(path.join(EXT, 'manifest.json'), 'utf8'));
manifest.host_permissions = ['<all_urls>'];
manifest.permissions.push('privacy');
fs.writeFileSync(path.join(EXT, 'manifest.json'), JSON.stringify(manifest));
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });

const proxyLog = [];
const AUTH = 'Basic ' + Buffer.from('user:pa:ss').toString('base64');
const proxy = http.createServer((req, res) => {
  if (req.headers['proxy-authorization'] !== AUTH) {
    proxyLog.push(`407 ${req.url}`);
    res.writeHead(407, { 'Proxy-Authenticate': 'Basic realm="lumen"' }).end();
    return;
  }
  proxyLog.push(`OK ${req.url}`);
  res.writeHead(200, { 'content-type': 'text/plain' }).end(`via-proxy:${new URL(req.url).hostname}`);
});
proxy.on('connect', (_req, sock) => sock.end('HTTP/1.1 502 Bad Gateway\r\n\r\n'));
await new Promise((r) => proxy.listen(PROXY_PORT, '127.0.0.1', r));

let pacText = `function FindProxyForURL(url, host) {
  if (dnsDomainIs(host, "pac.lumen")) return "PROXY 10.255.255.1:9; DIRECT";
  return "DIRECT";
}`;
const pacServer = http.createServer((_req, res) => res.writeHead(200, { 'content-type': 'application/x-ns-proxy-autoconfig' }).end(pacText));
await new Promise((r) => pacServer.listen(PAC_PORT, '127.0.0.1', r));

const browserBinary = await findBrowser(BROWSERS);
console.log(`Browser: ${browserBinary.path} (${browserBinary.source})`);

const noProxyEnv = { ...process.env, http_proxy: '', https_proxy: '', HTTP_PROXY: '', HTTPS_PROXY: '', no_proxy: '', NO_PROXY: '' };
const chrome = spawn(
  browserBinary.path,
  ['--headless=new', `--user-data-dir=${PROFILE}`, `--remote-debugging-port=${DEBUG_PORT}`, `--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--no-first-run', 'about:blank'],
  { env: noProxyEnv, stdio: ['ignore', 'ignore', 'pipe'] },
);
let browserStderr = '';
let browserExit = null;
chrome.stderr.on('data', (chunk) => (browserStderr = (browserStderr + chunk).slice(-4000)));
chrome.on('exit', (code) => (browserExit = code));

function launchFailure() {
  const lines = browserStderr.split('\n').filter((l) => l.trim() && !/dbus|update\.go/.test(l)).slice(-6).join('\n');
  const hint = /error while loading shared libraries/.test(browserStderr)
    ? '\nThe browser is missing system libraries. Install Chromium from your distro, or run once:\n  npx @puppeteer/browsers install chrome@stable --install-deps   (needs root)'
    : '';
  return new Error(`Could not start the browser${browserExit === null ? '' : ` (exit code ${browserExit})`}: ${browserBinary.path}\n${lines}${hint}`);
}

let browser;
for (let i = 0; i < 40 && !browser && browserExit === null; i++) {
  await new Promise((r) => setTimeout(r, 500));
  browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${DEBUG_PORT}`, defaultViewport: null }).catch(() => undefined);
}

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) failures++;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  if (!browser) throw launchFailure();
  const swTarget = await browser.waitForTarget((t) => t.type() === 'service_worker' && t.url().endsWith('/background.js'), { timeout: 15000 });
  const sw = await swTarget.worker();
  const base = `chrome-extension://${new URL(swTarget.url()).host}`;
  const inExt = (fn, ...args) => sw.evaluate(fn, ...args);
  const patchSettings = (patch) =>
    inExt(async (patch) => {
      const { settings } = await chrome.storage.local.get('settings');
      await chrome.storage.local.set({ settings: { ...settings, ...patch } });
    }, patch);

  await inExt(async (proxyPort, pacPort) => {
    await chrome.storage.local.set({
      settings: {
        mode: 'rules',
        proxies: [{ id: 'p1', name: 'Local test', scheme: 'http', host: '127.0.0.1', port: proxyPort, username: 'user', password: 'pa:ss' }],
        activeProxyId: 'p1',
        proxyList: ['site.lumen'],
        directList: ['direct.site.lumen'],
        pac: { enabled: true, kind: 'url', url: `http://127.0.0.1:${pacPort}/proxy.pac`, allowHttp: true, refreshMinutes: 60, useOwnProxy: true },
        blockDirect: true,
      },
    });
  }, PROXY_PORT, PAC_PORT);

  const page = (await browser.pages())[0] ?? (await browser.newPage());
  const opt = await browser.newPage();
  await opt.goto(`${base}/options.html`);
  const refresh = await opt.evaluate(() => chrome.runtime.sendMessage({ type: 'refreshPac' }));
  check('PAC is downloaded', refresh.ok === true, JSON.stringify(refresh));
  await sleep(800);

  const ps = await inExt(() => chrome.proxy.settings.get({}));
  check('Chrome receives pac_script', ps.value.mode === 'pac_script' && ps.levelOfControl === 'controlled_by_this_extension');
  check('mandatory=true when DIRECT is blocked', ps.value.pacScript?.mandatory === true);

  const visit = async (url) => {
    try {
      const r = await page.goto(url, { timeout: 10000 });
      return (await r.text()).slice(0, 80);
    } catch (e) {
      return 'ERR ' + e.message.split('\n')[0];
    }
  };

  check('list domain goes via proxy with auth', (await visit('http://site.lumen/')) === 'via-proxy:site.lumen');
  check('subdomain goes via proxy', (await visit('http://www.site.lumen/')) === 'via-proxy:www.site.lumen');
  const exception = await visit('http://direct.site.lumen/');
  check('exception goes direct', exception.includes('NAME_NOT_RESOLVED'), exception);
  check('PAC proxy is replaced with own proxy', (await visit('http://pac.lumen/')) === 'via-proxy:pac.lumen');
  const other = await visit('http://other.lumen/');
  check('unlisted domain goes direct', other.includes('NAME_NOT_RESOLVED'), other);
  check('credentials sent after 407', proxyLog.some((l) => l.startsWith('407')) && proxyLog.some((l) => l.startsWith('OK')), proxyLog.join(' | '));

  await patchSettings({ mode: 'global' });
  await sleep(500);
  check('global mode proxies everything', (await visit('http://other.lumen/')) === 'via-proxy:other.lumen');
  const globalException = await visit('http://direct.site.lumen/');
  check('global mode keeps exceptions', globalException.includes('NAME_NOT_RESOLVED'), globalException);

  const heading = async () => {
    await opt.goto(`${base}/options.html#proxies`);
    await sleep(300);
    return opt.$eval('h1', (el) => el.textContent);
  };
  await patchSettings({ language: 'en' });
  await sleep(300);
  check('language setting: English', (await heading()) === 'Proxy servers');
  check('document lang follows the setting', (await opt.evaluate(() => document.documentElement.lang)) === 'en');
  await patchSettings({ language: 'ru' });
  await sleep(300);
  check('language setting: Russian', (await heading()) === 'Прокси-серверы');
  const title = await inExt(() => chrome.action.getTitle({}));
  check('toolbar tooltip is translated', title.includes('по правилам') || title.includes('весь трафик'), title);
  await opt.goto(`${base}/options.html#proxies`);
  await sleep(300);
  await opt.evaluate(() => [...document.querySelectorAll('button[role=radio]')].find((b) => b.textContent.trim() === 'English').click());
  await sleep(500);
  check('switching language in the UI updates the page live', (await opt.$eval('h1', (el) => el.textContent)) === 'Proxy servers');

  if (SHOTS) {
    await patchSettings({ mode: 'rules', proxyList: ['site.lumen', 'youtube.com', 'discord.com', 'discord.gg', ...Array.from({ length: 40000 }, (_, i) => `host${i}.example${i % 97}.net`)] });
    await sleep(500);
    for (const [scheme, language] of [['light', 'en'], ['dark', 'en'], ['light', 'ru'], ['dark', 'ru']]) {
      await patchSettings({ language });
      await sleep(300);
      await opt.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: scheme }]);
      await opt.setViewport({ width: 1180, height: 820 });
      for (const section of ['proxies', 'lists', 'pac', 'protection']) {
        await opt.goto(`${base}/options.html#${section}`);
        await sleep(400);
        if (section === 'lists') await opt.type('input[type=search]', 'disc');
        await opt.screenshot({ path: path.join(SHOTS, `options-${section}-${scheme}-${language}.png`) });
      }
      for (const host of ['www.site.lumen', 'news.other.lumen']) {
        await page.bringToFront();
        await visit(`http://${host}/`);
        await inExt(() => chrome.action.openPopup());
        const popup = await (await browser.waitForTarget((t) => t.url().endsWith('/popup.html'), { timeout: 5000 })).asPage();
        await popup.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: scheme }]);
        await sleep(700);
        await popup.screenshot({ path: path.join(SHOTS, `popup-${host.split('.')[1]}-${scheme}-${language}.png`) });
        await popup.close();
      }
    }
  }

  await patchSettings({ mode: 'rules', webrtc: 'public_only' });
  await sleep(500);
  const rtc = await inExt(() => chrome.privacy.network.webRTCIPHandlingPolicy.get({}));
  check('WebRTC policy is applied', rtc.value === 'default_public_interface_only', rtc.value);

  pacText = 'function FindProxyForURL(url, host) { return "DIRECT" ';
  const broken = await opt.evaluate(() => chrome.runtime.sendMessage({ type: 'refreshPac' }));
  check('broken PAC is rejected by the sandbox', broken.ok === false && broken.error.key === 'pacFetch.invalid' && /SyntaxError/.test(JSON.stringify(broken.error)), JSON.stringify(broken.error));
  const cached = await inExt(async () => (await chrome.storage.local.get('pacCache')).pacCache.content);
  check('previous PAC version is kept', cached.includes('pac.lumen'));

  const entries = [];
  for (let i = 0, size = 0; size < LARGE_PAC_MB * 1024 * 1024; i++) {
    const entry = `"d${i}.blocked-example${i % 1000}.org":1`;
    entries.push(entry);
    size += entry.length + 1;
  }
  pacText = `var D = {${entries.join(',')}};
function FindProxyForURL(url, host) {
  if (host === "big.lumen" || D[host]) return "PROXY 10.255.255.1:9; DIRECT";
  return "DIRECT";
}`;
  const started = Date.now();
  const large = await opt.evaluate(() => chrome.runtime.sendMessage({ type: 'refreshPac' }));
  const loadSeconds = ((Date.now() - started) / 1000).toFixed(1);
  check(`large PAC (${(pacText.length / 1048576).toFixed(1)} MB) is accepted`, large.ok === true, `${loadSeconds}s ${JSON.stringify(large)}`);
  await sleep(1500);
  const bigStarted = Date.now();
  const big = await visit('http://big.lumen/');
  check('large PAC routes through own proxy', big === 'via-proxy:big.lumen', `${big}, first request ${Date.now() - bigStarted} ms`);
  check('large PAC: last entry is matched', (await visit(`http://d${entries.length - 1}.blocked-example${(entries.length - 1) % 1000}.org/`)).startsWith('via-proxy:'));

  proxy.close();
  proxy.closeAllConnections();
  await sleep(300);
  const down = await visit('http://site.lumen/');
  check('proxy down fails instead of going DIRECT', /PROXY_CONNECTION_FAILED|MANDATORY_PROXY/.test(down), down);
  await sleep(500);
  const status = await inExt(async () => (await chrome.storage.local.get('status')).status);
  check('proxy error is reported in status', status.lastError?.key === 'proxyError.connectionFailed', JSON.stringify(status.lastError));
} catch (e) {
  console.error(e);
  failures++;
} finally {
  await browser?.close().catch(() => {});
  chrome.kill();
  pacServer.close();
  proxy.close();
}

if (SHOTS) console.log(`\nScreenshots: ${SHOTS}`);
console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
process.exit(failures ? 1 : 0);

import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { findFirefox } from './browser.mjs';
import { RdpClient, addonConsole, extensionPage, grantPermissions, installTemporaryAddon } from './firefox-rdp.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist', 'firefox');
const ADDON_ID = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest', 'firefox.json'), 'utf8')).browser_specific_settings.gecko.id;
const PROXY_PORT = 18080;
const PAC_PORT = 18081;
const RDP_PORT = Number(process.env.E2E_RDP_PORT ?? 6007);

if (!fs.existsSync(path.join(DIST, 'manifest.json'))) throw new Error('Run `npm run build:firefox` first');

const firefox = await findFirefox(path.join(ROOT, '.e2e-browsers'));
console.log(`Browser: ${firefox.path} (${firefox.source})`);
const profileRoot = firefox.path.includes('/snap/') ? path.join(os.homedir(), 'snap', 'firefox', 'common', 'lumen-e2e') : path.join(ROOT, '.e2e', 'firefox');

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
await new Promise((r) => proxy.listen(PROXY_PORT, '127.0.0.1', r));

let pacText = `function FindProxyForURL(url, host) {
  if (dnsDomainIs(host, "pac.lumen")) return "PROXY 10.255.255.1:9; DIRECT";
  return "DIRECT";
}`;
const pacServer = http.createServer((_req, res) => res.writeHead(200, { 'content-type': 'application/x-ns-proxy-autoconfig' }).end(pacText));
await new Promise((r) => pacServer.listen(PAC_PORT, '127.0.0.1', r));

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) failures++;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const SETTINGS = {
  mode: 'rules',
  proxies: [{ id: 'p1', name: 'Local test', scheme: 'http', host: '127.0.0.1', port: PROXY_PORT, username: 'user', password: 'pa:ss' }],
  activeProxyId: 'p1',
  proxyList: ['site.lumen'],
  directList: ['direct.site.lumen'],
  pac: { enabled: true, kind: 'url', url: `http://127.0.0.1:${PAC_PORT}/proxy.pac`, allowHttp: true, refreshMinutes: 60, useOwnProxy: true },
  blockDirect: true,
};

async function session(name, run) {
  const profile = path.join(profileRoot, name);
  fs.rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
  fs.mkdirSync(profile, { recursive: true });
  const browser = await puppeteer.launch({
    browser: 'firefox',
    executablePath: firefox.path,
    headless: true,
    userDataDir: profile,
    args: ['--start-debugger-server', String(RDP_PORT)],
    extraPrefsFirefox: {
      'devtools.debugger.remote-enabled': true,
      'devtools.chrome.enabled': true,
      'devtools.debugger.prompt-connection': false,
      'network.proxy.type': 0,
    },
  });
  const rdp = await RdpClient.connect(RDP_PORT);
  let tab = (await browser.pages())[0] ?? (await browser.newPage());
  await tab.goto('data:text/html,<title>lumen e2e</title>');
  const visit = async (url, { freshTab = false } = {}) => {
    if (freshTab) tab = await browser.newPage();
    try {
      const r = await tab.goto(url, { timeout: 10000 });
      return (await r.text()).slice(0, 80);
    } catch (e) {
      return 'ERR ' + (e.message.match(/NS_ERROR_\w+/)?.[0] ?? e.message.split('\n')[0]);
    }
  };
  try {
    await run({ rdp, visit });
  } catch (e) {
    console.error(e);
    failures++;
  } finally {
    rdp.close();
    await browser.close().catch(() => {});
  }
}

await session('no-permission', async ({ rdp, visit }) => {
  const id = await installTemporaryAddon(rdp, DIST);
  const bg = await addonConsole(rdp, id);
  await bg.evaluate(`browser.storage.local.set({ settings: ${JSON.stringify(SETTINGS)} })`);
  await sleep(1000);
  const state = await bg.evaluate(`(async () => ({
    incognito: await browser.extension.isAllowedIncognitoAccess(),
    proxyType: (await browser.proxy.settings.get({})).value.proxyType,
    access: (await browser.storage.local.get('status')).status.accessProblem,
  }))()`);
  check('without private windows permission the proxy is not applied', state.incognito === false && state.proxyType !== 'autoConfig', JSON.stringify(state));
  check('the missing permission is reported', state.access?.key === 'firefox.privateAccess');
  const options = await extensionPage(rdp, id, 'options.html');
  const text = await options.evaluate('Promise.resolve(document.body.textContent)');
  check('settings page shows the setup steps', text.includes('about:addons'), text.slice(0, 120));

  await grantPermissions(rdp, id, { privateBrowsing: true, origins: ['<all_urls>'], reload: true });
  let routed = '';
  for (let i = 0; i < 5 && !routed.startsWith('via-proxy'); i++) {
    await sleep(1500);
    routed = await visit(`http://site.lumen/after-grant-${i}`, { freshTab: true });
  }
  check('allowing private windows turns routing on by itself', routed === `via-proxy:site.lumen`, routed);
});

await session('granted', async ({ rdp, visit }) => {
  await grantPermissions(rdp, ADDON_ID, { privateBrowsing: true, origins: ['<all_urls>'], reload: false });
  const id = await installTemporaryAddon(rdp, DIST);
  const bg = await addonConsole(rdp, id);
  await bg.evaluate(`browser.storage.local.set({ settings: ${JSON.stringify(SETTINGS)} })`);
  await sleep(800);
  const options = await extensionPage(rdp, id, 'options.html');
  const refresh = await options.evaluate(`browser.runtime.sendMessage({ type: 'refreshPac' })`);
  check('PAC is downloaded', refresh.ok === true, JSON.stringify(refresh));
  await sleep(800);

  const proxySettings = await bg.evaluate('browser.proxy.settings.get({})');
  check('Firefox receives the PAC as autoConfig', proxySettings.value.proxyType === 'autoConfig' && proxySettings.value.autoConfigUrl.startsWith('data:'));

  check('list domain goes via proxy with auth', (await visit('http://site.lumen/')) === 'via-proxy:site.lumen');
  check('subdomain goes via proxy', (await visit('http://www.site.lumen/')) === 'via-proxy:www.site.lumen');
  const exception = await visit('http://direct.site.lumen/');
  check('exception goes direct', exception.includes('UNKNOWN_HOST'), exception);
  const pacRoute = await visit('http://pac.lumen/');
  check('PAC proxy is replaced with own proxy', pacRoute === 'via-proxy:pac.lumen', pacRoute);
  const other = await visit('http://other.lumen/');
  check('unlisted domain goes direct', other.includes('UNKNOWN_HOST'), other);
  check('credentials sent after 407', proxyLog.some((l) => l.startsWith('407')) && proxyLog.some((l) => l.startsWith('OK')), proxyLog.slice(0, 3).join(' | '));

  await bg.evaluate(`browser.storage.local.get('settings').then(({ settings }) => browser.storage.local.set({ settings: { ...settings, mode: 'global' } }))`);
  await sleep(800);
  check('global mode proxies everything', (await visit('http://other.lumen/')) === 'via-proxy:other.lumen');
  await bg.evaluate(`browser.storage.local.get('settings').then(({ settings }) => browser.storage.local.set({ settings: { ...settings, mode: 'rules' } }))`);
  await sleep(800);

  pacText = 'function FindProxyForURL(url, host) { return "DIRECT" ';
  const broken = await options.evaluate(`browser.runtime.sendMessage({ type: 'refreshPac' })`);
  check('broken PAC is rejected by the syntax check', broken.ok === false && broken.error?.key === 'pacFetch.invalid', JSON.stringify(broken.error));
  const cached = await bg.evaluate(`browser.storage.local.get('pacCache').then((x) => x.pacCache.content)`);
  check('previous PAC version is kept', cached.includes('pac.lumen'));

  proxy.close();
  proxy.closeAllConnections();
  await sleep(300);
  const down = await visit('http://site.lumen/down');
  check('proxy down fails instead of going DIRECT', down.includes('PROXY_CONNECTION_REFUSED'), down);
  await sleep(800);
  const status = await bg.evaluate(`browser.storage.local.get('status').then((x) => x.status.lastError)`);
  check('proxy error is reported in status', status?.key === 'proxyError.connectionFailed', JSON.stringify(status));
});

pacServer.close();
proxy.close();
console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
process.exit(failures ? 1 : 0);

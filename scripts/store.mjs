import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { findBrowser } from '../e2e/browser.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist', 'chrome');
const WORK = path.join(ROOT, '.store');
const EXT = path.join(WORK, 'ext');
const RAW = path.join(WORK, 'raw');
const OUT = path.join(ROOT, 'store');
const PROXY_PORT = 3128;
const PAC_PORT = 18443;
const DEBUG_PORT = 9335;
const LANGS = ['en', 'ru'];

const COPY = {
  en: {
    tagline: 'Proxy by your rules',
    chips: ['Own domain lists', 'PAC scripts', 'Block DIRECT', 'WebRTC protection'],
    popup: ['See where every site goes', 'The popup shows the route and the rule behind it. Add or remove a site in one click.'],
    lists: ['Your own domain list', 'Instant search, even across tens of thousands of domains. A domain covers all its subdomains.'],
    proxies: ['Several proxies, switch in a click', 'HTTP, HTTPS, SOCKS4 and SOCKS5, with login and password.'],
    pac: ['Connect a PAC script', 'By link with auto-update or as text. Your lists always win, and the script runs isolated.'],
    protection: ['No silent fallback to direct', 'If the proxy is down, listed sites stay closed instead of leaking. WebRTC leak protection too.'],
    proxyNames: ['Amsterdam', 'Frankfurt', 'Helsinki'],
  },
  ru: {
    tagline: 'Прокси по вашим правилам',
    chips: ['Свои списки доменов', 'PAC-скрипты', 'Запрет DIRECT', 'Защита WebRTC'],
    popup: ['Видно, куда идёт каждый сайт', 'Попап показывает маршрут и правило. Сайт добавляется в список или убирается в один клик.'],
    lists: ['Свой список доменов', 'Мгновенный поиск даже по десяткам тысяч доменов. Домен действует вместе с поддоменами.'],
    proxies: ['Несколько прокси, смена в один клик', 'HTTP, HTTPS, SOCKS4 и SOCKS5, с логином и паролем.'],
    pac: ['Подключение PAC-скрипта', 'По ссылке с автообновлением или текстом. Ваши списки всегда важнее, а скрипт изолирован.'],
    protection: ['Без тихого перехода на DIRECT', 'Если прокси недоступен, сайты из списка не откроются напрямую. И защита от утечек WebRTC.'],
    proxyNames: ['Амстердам', 'Франкфурт', 'Хельсинки'],
  },
};

const PROXY_LIST = [
  'youtube.com', 'youtu.be', 'ytimg.com', 'googlevideo.com', 'discord.com', 'discord.gg', 'discordapp.com', 'discordapp.net',
  'discord.media', 'instagram.com', 'cdninstagram.com', 'x.com', 'twimg.com', 'linkedin.com', 'medium.com', 'spotify.com',
  'scdn.co', 'soundcloud.com', 'notion.so', 'figma.com', 'patreon.com', 'chatgpt.com', 'claude.ai', 'netflix.com', 'twitch.tv',
];
const PADDING = Array.from({ length: 12380 }, (_, i) => `n${i.toString(36)}.example${i % 89}.org`);
const DIRECT_LIST = ['zoom.us', 'teams.microsoft.com', 'meet.google.com', 'icloud.com', 'mail.youtube.com'];
const PAC_TEXT = `function FindProxyForURL(url, host) {\n${['github.com', 'githubusercontent.com', 'npmjs.com', 'stackoverflow.com', ...Array.from({ length: 1400 }, (_, i) => `blocked${i}.example.com`)]
  .map((d) => `  if (dnsDomainIs(host, "${d}")) return "PROXY pac-gw.example.org:8080; DIRECT";`)
  .join('\n')}\n  return "DIRECT";\n}\n`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function settingsFor(lang) {
  const [ams, fra, hel] = COPY[lang].proxyNames;
  return {
    mode: 'rules',
    proxies: [
      { id: 'fra', name: fra, scheme: 'http', host: 'fra.example.net', port: PROXY_PORT, username: 'alex', password: 'secret' },
      { id: 'ams', name: ams, scheme: 'socks5', host: 'ams.example.net', port: 1080, username: '', password: '' },
      { id: 'hel', name: hel, scheme: 'https', host: 'hel.example.net', port: 443, username: '', password: '' },
    ],
    activeProxyId: 'fra',
    proxyList: [...PROXY_LIST, ...PADDING],
    directList: DIRECT_LIST,
    pac: { enabled: true, kind: 'url', url: 'https://pac.example.net/proxy.pac', inline: '', refreshMinutes: 720, useOwnProxy: true, allowHttp: false },
    blockDirect: true,
    bypassLocal: true,
    webrtc: 'public_only',
    theme: 'auto',
    language: lang,
  };
}

function tlsCert() {
  const key = path.join(WORK, 'key.pem');
  const cert = path.join(WORK, 'cert.pem');
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', cert, '-days', '2', '-subj', '/CN=pac.example.net'], { stdio: 'ignore' });
  return { key: fs.readFileSync(key), cert: fs.readFileSync(cert) };
}

async function startBrowser() {
  const binary = await findBrowser(path.join(ROOT, '.e2e-browsers'));
  const chrome = spawn(
    binary.path,
    [
      '--headless=new',
      `--user-data-dir=${path.join(WORK, 'profile')}`,
      `--remote-debugging-port=${DEBUG_PORT}`,
      `--disable-extensions-except=${EXT}`,
      `--load-extension=${EXT}`,
      `--host-resolver-rules=MAP pac.example.net 127.0.0.1:${PAC_PORT}, MAP *.example.net 127.0.0.1`,
      '--ignore-certificate-errors',
      '--no-first-run',
      '--hide-scrollbars',
      '--force-device-scale-factor=2',
      'about:blank',
    ],
    { stdio: 'ignore' },
  );
  for (let i = 0; i < 40; i++) {
    await sleep(500);
    const browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${DEBUG_PORT}`, defaultViewport: null }).catch(() => undefined);
    if (browser) return browser;
  }
  chrome.kill();
  throw new Error('Could not start the browser');
}

function prepareExtension() {
  if (!fs.existsSync(path.join(DIST, 'manifest.json'))) throw new Error('Run `npm run build:chrome` first');
  fs.rmSync(WORK, { recursive: true, force: true });
  fs.cpSync(DIST, EXT, { recursive: true });
  fs.mkdirSync(RAW, { recursive: true });
  const manifest = JSON.parse(fs.readFileSync(path.join(EXT, 'manifest.json'), 'utf8'));
  manifest.host_permissions = ['<all_urls>'];
  manifest.permissions.push('privacy');
  fs.writeFileSync(path.join(EXT, 'manifest.json'), JSON.stringify(manifest));
}

async function capture(browser) {
  const proxy = http.createServer((req, res) => res.writeHead(200, { 'content-type': 'text/html' }).end('<!doctype html><title>ok</title>'));
  proxy.on('connect', (_req, sock, head) => {
    const upstream = net.connect(PAC_PORT, '127.0.0.1', () => {
      sock.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      upstream.write(head);
      upstream.pipe(sock).pipe(upstream);
    });
    upstream.on('error', () => sock.destroy());
    sock.on('error', () => upstream.destroy());
  });
  await new Promise((r) => proxy.listen(PROXY_PORT, '127.0.0.1', r));
  const pacServer = https.createServer(tlsCert(), (req, res) =>
    req.url === '/proxy.pac'
      ? res.writeHead(200, { 'content-type': 'application/x-ns-proxy-autoconfig' }).end(PAC_TEXT)
      : res.writeHead(200, { 'content-type': 'text/html' }).end('<!doctype html><title>ok</title>'),
  );
  await new Promise((r) => pacServer.listen(PAC_PORT, '127.0.0.1', r));

  try {
    const swTarget = await browser.waitForTarget((t) => t.type() === 'service_worker' && t.url().endsWith('/background.js'), { timeout: 15000 });
    const sw = await swTarget.worker();
    const base = `chrome-extension://${new URL(swTarget.url()).host}`;
    const setSettings = (s) => sw.evaluate((s) => chrome.storage.local.set({ settings: s }), s);
    const page = (await browser.pages())[0] ?? (await browser.newPage());
    const opt = await browser.newPage();

    for (const lang of LANGS) {
      await setSettings(settingsFor(lang));
      await opt.goto(`${base}/options.html`);
      const r = await opt.evaluate(() => chrome.runtime.sendMessage({ type: 'refreshPac' }));
      if (!r.ok) throw new Error(`PAC refresh failed: ${JSON.stringify(r)}`);
      await sleep(600);

      for (const scheme of ['light', 'dark']) {
        await opt.bringToFront();
        await opt.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: scheme }]);
        await opt.setViewport({ width: 1200, height: 760, deviceScaleFactor: 2 });
        for (const section of ['proxies', 'lists', 'pac', 'protection', 'check']) {
          await opt.goto(`${base}/options.html#${section}`);
          await sleep(500);
          if (section === 'lists') await opt.type('input[type=search]', 'disc');
          if (section === 'check') {
            await opt.type('textarea', 'https://www.youtube.com/\nhttps://github.com/\nhttps://meet.google.com/\nhttp://192.168.1.1/');
            await opt.click('button[type=submit]');
            await sleep(500);
          }
          await opt.evaluate(() => document.activeElement?.blur());
          await sleep(200);
          await opt.screenshot({ path: path.join(RAW, `options-${section}-${scheme}-${lang}.png`) });
        }

        for (const [name, url] of [['proxy', 'http://www.youtube.com/'], ['pac', 'http://gist.github.com/']]) {
          await page.bringToFront();
          await page.goto(url, { timeout: 10000 }).catch(() => undefined);
          await sw.evaluate(() => chrome.action.openPopup());
          const popup = await (await browser.waitForTarget((t) => t.url().endsWith('/popup.html'), { timeout: 5000 })).asPage();
          await popup.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: scheme }]);
          await sleep(300);
          await sleep(500);
          const size = await popup.evaluate(() => [document.body.getBoundingClientRect().width, document.documentElement.scrollHeight]);
          const cdp = await popup.createCDPSession();
          const shot = await cdp.send('Page.captureScreenshot', {
            format: 'png',
            captureBeyondViewport: true,
            clip: { x: 0, y: 0, width: size[0], height: size[1], scale: 1 },
          });
          fs.writeFileSync(path.join(RAW, `popup-${name}-${scheme}-${lang}.png`), Buffer.from(shot.data, 'base64'));
          await popup.close();
        }
      }
    }
  } finally {
    proxy.close();
    pacServer.close();
  }
}

const dataUrl = (file) => `data:image/png;base64,${fs.readFileSync(file).toString('base64')}`;
const raw = (name) => dataUrl(path.join(RAW, name));
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

async function inlineFonts() {
  const css = await (
    await fetch('https://fonts.googleapis.com/css2?family=Manrope:wght@500;600;700;800&display=block', {
      headers: { 'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36' },
    })
  ).text();
  const urls = [...new Set(css.match(/https:[^)]+\.woff2/g))];
  const files = await Promise.all(urls.map(async (u) => Buffer.from(await (await fetch(u)).arrayBuffer()).toString('base64')));
  return urls.reduce((acc, u, i) => acc.replaceAll(u, `data:font/woff2;base64,${files[i]}`), css);
}

const BASE_CSS = `
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:100%;height:100%}
body{font-family:Manrope,sans-serif;overflow:hidden;-webkit-font-smoothing:antialiased;color:#0d1f1d}
.bg{position:absolute;inset:0;background:
  radial-gradient(1200px 700px at 100% 0%,#d6f2ee 0%,transparent 60%),
  radial-gradient(900px 600px at 0% 100%,#e6ebf7 0%,transparent 60%),#f4f7f8}
.bg.dark{background:
  radial-gradient(1100px 700px at 95% 0%,#14524b 0%,transparent 60%),
  radial-gradient(900px 600px at 0% 100%,#1b2140 0%,transparent 60%),#0b1114;color:#eef4f3}
.grid{position:absolute;inset:0;background-image:linear-gradient(rgb(15 138 126/7%) 1px,transparent 1px),linear-gradient(90deg,rgb(15 138 126/7%) 1px,transparent 1px);
  background-size:40px 40px;mask-image:radial-gradient(ellipse at 70% 30%,#000 0%,transparent 70%)}
.brand{display:flex;align-items:center;gap:12px;font-weight:800;font-size:22px;letter-spacing:-.01em}
.brand img{width:36px;height:36px}
h1{font-weight:800;letter-spacing:-.025em;line-height:1.08}
p.sub{font-weight:500;line-height:1.45;opacity:.72}
.shot{display:block;border-radius:14px;box-shadow:0 2px 6px rgb(13 31 29/10%),0 24px 60px rgb(13 31 29/18%);outline:1px solid rgb(13 31 29/8%)}
.dark .shot{box-shadow:0 2px 6px rgb(0 0 0/40%),0 30px 70px rgb(0 0 0/50%);outline:1px solid rgb(255 255 255/8%)}
.accent{color:#0f8a7e}.dark .accent{color:#35c2b1}
`;

const icon = dataUrl(path.join(DIST, 'icons', '128.png'));

function popupSlide(lang) {
  const [title, sub] = COPY[lang].popup;
  return `<div class="bg"><div class="grid"></div></div>
<div style="position:absolute;left:80px;top:0;bottom:0;width:470px;display:flex;flex-direction:column;justify-content:center;gap:26px">
  <div class="brand"><img src="${icon}">Lumen Proxy</div>
  <h1 style="font-size:54px">${esc(title)}</h1>
  <p class="sub" style="font-size:22px">${esc(sub)}</p>
</div>
<img class="shot" src="${raw(`popup-proxy-light-${lang}.png`)}" style="position:absolute;left:580px;top:130px;width:320px">
<img class="shot" src="${raw(`popup-pac-dark-${lang}.png`)}" style="position:absolute;left:930px;top:240px;width:320px">`;
}

function windowSlide(lang, key, scheme) {
  const [title, sub] = COPY[lang][key];
  const dark = scheme === 'dark';
  return `<div class="bg${dark ? ' dark' : ''}"><div class="grid"></div></div>
<div class="${dark ? 'dark' : ''}" style="position:absolute;inset:0;${dark ? 'color:#eef4f3' : ''}">
  <div style="position:absolute;left:0;right:0;top:56px;text-align:center;padding:0 120px">
    <h1 style="font-size:46px">${esc(title)}</h1>
    <p class="sub" style="font-size:21px;margin-top:14px">${esc(sub)}</p>
  </div>
  <div class="shot" style="position:absolute;left:110px;top:236px;width:1060px;height:640px;overflow:hidden;background:${dark ? '#0f1318' : '#fff'}">
    <div style="height:34px;display:flex;align-items:center;gap:8px;padding:0 14px;background:${dark ? '#1e242d' : '#e8ecf0'}">
      <i style="width:11px;height:11px;border-radius:50%;background:#ff5f57"></i>
      <i style="width:11px;height:11px;border-radius:50%;background:#febc2e"></i>
      <i style="width:11px;height:11px;border-radius:50%;background:#28c840"></i>
    </div>
    <img src="${raw(`options-${key}-${scheme}-${lang}.png`)}" style="display:block;width:1060px">
  </div>
</div>`;
}

function smallTile(lang) {
  return `<div class="bg dark"><div class="grid"></div></div>
<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;color:#eef4f3;text-align:center">
  <img src="${icon}" style="width:92px;height:92px;filter:drop-shadow(0 10px 24px rgb(0 0 0/45%))">
  <div style="font-weight:800;font-size:38px;letter-spacing:-.02em">Lumen Proxy</div>
  <div style="font-weight:600;font-size:19px;color:#35c2b1">${esc(COPY[lang].tagline)}</div>
</div>`;
}

function marquee(lang) {
  const c = COPY[lang];
  const chips = c.chips
    .map((x) => `<span style="padding:9px 16px;border-radius:999px;background:rgb(53 194 177/12%);border:1px solid rgb(53 194 177/35%);font-weight:600;font-size:18px">${esc(x)}</span>`)
    .join('');
  return `<div class="bg dark"><div class="grid"></div></div>
<div class="dark" style="position:absolute;inset:0;color:#eef4f3">
  <div style="position:absolute;left:90px;top:0;bottom:0;width:600px;display:flex;flex-direction:column;justify-content:center;gap:24px">
    <div style="display:flex;align-items:center;gap:20px">
      <img src="${icon}" style="width:84px;height:84px;filter:drop-shadow(0 10px 24px rgb(0 0 0/45%))">
      <div style="font-weight:800;font-size:58px;letter-spacing:-.025em">Lumen Proxy</div>
    </div>
    <div style="font-weight:700;font-size:34px;color:#35c2b1;letter-spacing:-.015em">${esc(c.tagline)}</div>
    <div style="display:flex;flex-wrap:wrap;gap:10px;max-width:560px">${chips}</div>
  </div>
  <div class="shot" style="position:absolute;left:800px;top:76px;width:760px;height:520px;overflow:hidden;background:#0f1318">
    <img src="${raw(`options-lists-dark-${lang}.png`)}" style="display:block;width:760px">
  </div>
  <img class="shot" src="${raw(`popup-proxy-dark-${lang}.png`)}" style="position:absolute;left:650px;top:160px;width:300px">
</div>`;
}

async function compose(browser) {
  const fonts = await inlineFonts();
  const page = await browser.newPage();
  const render = async (body, width, height, file) => {
    await page.setViewport({ width, height, deviceScaleFactor: 1 });
    await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${fonts}${BASE_CSS}</style></head><body>${body}</body></html>`, {
      waitUntil: 'load',
    });
    await page.evaluate(() => document.fonts.ready);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    await page.screenshot({ path: file, type: 'png', omitBackground: false });
  };
  try {
    fs.rmSync(OUT + '/screenshots', { recursive: true, force: true });
    fs.rmSync(OUT + '/promo', { recursive: true, force: true });
    for (const lang of LANGS) {
      const slides = [
        popupSlide(lang),
        windowSlide(lang, 'lists', 'light'),
        windowSlide(lang, 'proxies', 'dark'),
        windowSlide(lang, 'pac', 'light'),
        windowSlide(lang, 'protection', 'dark'),
      ];
      for (const [i, body] of slides.entries()) await render(body, 1280, 800, path.join(OUT, 'screenshots', lang, `${i + 1}.png`));
      await render(smallTile(lang), 440, 280, path.join(OUT, 'promo', lang, 'small-tile-440x280.png'));
      await render(marquee(lang), 1400, 560, path.join(OUT, 'promo', lang, 'marquee-1400x560.png'));
    }
    fs.cpSync(path.join(OUT, 'screenshots', 'en'), path.join(OUT, 'screenshots', 'global'), { recursive: true });
    fs.cpSync(path.join(OUT, 'promo', 'en'), path.join(OUT, 'promo', 'global'), { recursive: true });
  } finally {
    await page.close();
  }
}

const composeOnly = process.argv.includes('--compose-only');
if (!composeOnly) prepareExtension();
const browser = await startBrowser();
try {
  if (!composeOnly) await capture(browser);
  await compose(browser);
} finally {
  await browser.close();
}
console.log(`Store assets: ${OUT}`);

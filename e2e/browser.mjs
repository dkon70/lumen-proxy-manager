import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  Browser,
  computeExecutablePath,
  detectBrowserPlatform,
  getInstalledBrowsers,
  install,
  resolveBuildId,
} from '@puppeteer/browsers';

function localChromiumCandidates() {
  const home = os.homedir();
  switch (process.platform) {
    case 'win32': {
      const roots = [process.env.LOCALAPPDATA, process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)']].filter(Boolean);
      return roots.map((root) => path.join(root, 'Chromium', 'Application', 'chrome.exe'));
    }
    case 'darwin':
      return [
        '/Applications/Chromium.app/Contents/MacOS/Chromium',
        path.join(home, 'Applications', 'Chromium.app', 'Contents', 'MacOS', 'Chromium'),
      ];
    default:
      return ['/snap/bin/chromium', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
  }
}

async function chromeForTesting(cacheDir) {
  const platform = detectBrowserPlatform();
  if (!platform) throw new Error(`Unsupported platform for Chrome for Testing: ${process.platform} ${process.arch}`);
  const wanted = process.env.E2E_CHROME_VERSION;
  const installed = (await getInstalledBrowsers({ cacheDir })).filter((b) => b.browser === Browser.CHROME && b.platform === platform);
  const reuse = wanted ? installed.find((b) => b.buildId === wanted) : installed.sort((a, b) => b.buildId.localeCompare(a.buildId, 'en', { numeric: true }))[0];
  if (reuse) return reuse.executablePath;

  const buildId = wanted ?? (await resolveBuildId(Browser.CHROME, platform, 'stable'));
  console.log(`Downloading Chrome for Testing ${buildId} to ${cacheDir} (one time, ~150 MB)…`);
  await install({ browser: Browser.CHROME, buildId, cacheDir, platform });
  return computeExecutablePath({ browser: Browser.CHROME, buildId, cacheDir, platform });
}

export async function findBrowser(cacheDir) {
  if (process.env.CHROME_PATH) {
    if (!fs.existsSync(process.env.CHROME_PATH)) throw new Error(`CHROME_PATH does not exist: ${process.env.CHROME_PATH}`);
    return { path: process.env.CHROME_PATH, source: 'CHROME_PATH' };
  }
  if (process.env.E2E_BROWSER !== 'cft') {
    const local = localChromiumCandidates().find((p) => fs.existsSync(p));
    if (local) return { path: local, source: 'local Chromium' };
  }
  return { path: await chromeForTesting(cacheDir), source: 'Chrome for Testing' };
}

function localFirefoxCandidates() {
  switch (process.platform) {
    case 'win32': {
      const roots = [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA].filter(Boolean);
      return roots.map((root) => path.join(root, 'Mozilla Firefox', 'firefox.exe'));
    }
    case 'darwin':
      return ['/Applications/Firefox.app/Contents/MacOS/firefox', path.join(os.homedir(), 'Applications', 'Firefox.app', 'Contents', 'MacOS', 'firefox')];
    default:
      return ['/snap/bin/firefox', '/usr/bin/firefox', '/usr/bin/firefox-esr'];
  }
}

export async function findFirefox(cacheDir) {
  if (process.env.FIREFOX_PATH) {
    if (!fs.existsSync(process.env.FIREFOX_PATH)) throw new Error(`FIREFOX_PATH does not exist: ${process.env.FIREFOX_PATH}`);
    return { path: process.env.FIREFOX_PATH, source: 'FIREFOX_PATH' };
  }
  const local = localFirefoxCandidates().find((p) => fs.existsSync(p));
  if (local) return { path: local, source: 'local Firefox' };
  const platform = detectBrowserPlatform();
  const installed = (await getInstalledBrowsers({ cacheDir })).find((b) => b.browser === Browser.FIREFOX && b.platform === platform);
  if (installed) return { path: installed.executablePath, source: 'downloaded Firefox' };
  const buildId = await resolveBuildId(Browser.FIREFOX, platform, 'stable');
  console.log(`Downloading Firefox ${buildId} to ${cacheDir} (one time)…`);
  await install({ browser: Browser.FIREFOX, buildId, cacheDir, platform });
  return { path: computeExecutablePath({ browser: Browser.FIREFOX, buildId, cacheDir, platform }), source: 'downloaded Firefox' };
}

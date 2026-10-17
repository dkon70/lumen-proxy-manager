import net from 'node:net';

export class RdpClient {
  #socket;
  #buffer = Buffer.alloc(0);
  #waiters = [];
  #listeners = [];

  static async connect(port, attempts = 60) {
    for (let i = 0; i < attempts; i++) {
      try {
        const client = new RdpClient();
        await client.#open(port);
        return client;
      } catch {
        await new Promise((r) => setTimeout(r, 500));
      }
    }
    throw new Error(`Could not connect to the Firefox debugger on port ${port}`);
  }

  #open(port) {
    return new Promise((resolve, reject) => {
      const socket = net.connect(port, '127.0.0.1');
      socket.once('error', reject);
      socket.on('data', (chunk) => this.#onData(chunk));
      this.#socket = socket;
      this.#waiters.push({ from: 'root', resolve, reject, match: (p) => Boolean(p.applicationType) });
    });
  }

  #onData(chunk) {
    this.#buffer = Buffer.concat([this.#buffer, chunk]);
    for (;;) {
      const colon = this.#buffer.indexOf(':');
      if (colon < 0) return;
      const length = Number(this.#buffer.subarray(0, colon).toString());
      if (this.#buffer.length < colon + 1 + length) return;
      const packet = JSON.parse(this.#buffer.subarray(colon + 1, colon + 1 + length).toString());
      this.#buffer = this.#buffer.subarray(colon + 1 + length);
      this.#dispatch(packet);
    }
  }

  #dispatch(packet) {
    for (const listener of this.#listeners) listener(packet);
    const index = this.#waiters.findIndex((w) => w.from === packet.from && (!w.match || w.match(packet)));
    if (index < 0) return;
    const [waiter] = this.#waiters.splice(index, 1);
    if (packet.error) waiter.reject(new Error(`${packet.error}: ${packet.message ?? ''}`));
    else waiter.resolve(packet);
  }

  onPacket(listener) {
    this.#listeners.push(listener);
  }

  request(to, type, extra = {}, match = (p) => !p.type || Boolean(p.error), timeoutMs = 30000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`No reply from ${to} to ${type}`)), timeoutMs);
      this.#waiters.push({
        from: to,
        match,
        resolve: (p) => (clearTimeout(timer), resolve(p)),
        reject: (e) => (clearTimeout(timer), reject(e)),
      });
      const body = Buffer.from(JSON.stringify({ to, type, ...extra }));
      this.#socket.write(`${body.length}:`);
      this.#socket.write(body);
    });
  }

  waitFor(from, match, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Timed out waiting for a packet from ${from}`)), timeoutMs);
      this.#waiters.push({
        from,
        match,
        resolve: (p) => (clearTimeout(timer), resolve(p)),
        reject: (e) => (clearTimeout(timer), reject(e)),
      });
    });
  }

  close() {
    this.#socket?.destroy();
  }
}

export async function installTemporaryAddon(client, addonPath) {
  const root = await client.request('root', 'getRoot');
  const { addon } = await client.request(root.addonsActor, 'installTemporaryAddon', { addonPath, openDevTools: false });
  return addon.id;
}

async function evaluateIn(client, resolveConsole, code) {
  const wrapped = `(async () => { try { globalThis.__lumenResult = { ok: true, value: await (${code}) }; } catch (e) { globalThis.__lumenResult = { ok: false, value: String(e) + " " + String(e && e.stack) }; } })(); "started"`;
  for (let attempt = 0; ; attempt++) {
    try {
      const consoleActor = await resolveConsole();
      await run(client, consoleActor, `delete globalThis.__lumenResult; ${wrapped}`);
      for (let j = 0; j < 150; j++) {
        const raw = await run(client, consoleActor, 'globalThis.__lumenResult ? JSON.stringify(globalThis.__lumenResult) : ""');
        if (raw) {
          const r = JSON.parse(raw);
          if (!r.ok) throw Object.assign(new Error(r.value), { fromPage: true });
          return r.value;
        }
        await new Promise((res) => setTimeout(res, 100));
      }
      throw new Error(`Evaluation did not finish: ${code}`);
    } catch (e) {
      if (e.fromPage || attempt >= 2) throw e;
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}

async function descriptorFor(client, addonId) {
  for (let i = 0; i < 40; i++) {
    const { addons } = await client.request('root', 'listAddons');
    const descriptor = addons.find((a) => a.id === addonId);
    if (descriptor) return descriptor;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Add-on ${addonId} not found`);
}

export async function addonConsole(client, addonId) {
  const descriptor = await descriptorFor(client, addonId);
  const resolve = () => backgroundConsoleActor(client, descriptor.actor);
  await resolve();
  return { evaluate: (code) => evaluateIn(client, resolve, code) };
}

const watchers = new Map();

async function addonTargets(client, descriptorActor) {
  if (watchers.has(descriptorActor)) return watchers.get(descriptorActor);
  const { actor: watcher } = await client.request(descriptorActor, 'getWatcher', { isServerTargetSwitchingEnabled: true });
  const targets = [];
  client.onPacket((p) => {
    if (p.from !== watcher) return;
    if (p.type === 'target-available-form' && p.target?.consoleActor) targets.push(p.target);
    if (p.type === 'target-destroyed-form') {
      const index = targets.findIndex((t) => t.actor === p.target?.actor);
      if (index >= 0) targets.splice(index, 1);
    }
  });
  await client.request(watcher, 'watchTargets', { targetType: 'frame' });
  const entry = { watcher, targets };
  watchers.set(descriptorActor, entry);
  return entry;
}

async function findTarget(client, descriptorActor, predicate, what) {
  const { targets } = await addonTargets(client, descriptorActor);
  for (let i = 0; i < 100; i++) {
    const target = targets.findLast(predicate);
    if (target) return target;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`${what} not found; targets: ${targets.map((t) => t.url).join(', ')}`);
}

async function backgroundConsoleActor(client, descriptorActor) {
  const target = await findTarget(client, descriptorActor, (t) => t.url?.startsWith('moz-extension://') && t.url.includes('background'), 'Background page');
  return target.consoleActor;
}

async function run(client, consoleActor, text) {
  const started = await client.request(consoleActor, 'evaluateJSAsync', { text }, (p) => Boolean(p.resultID) && p.type !== 'evaluationResult', 8000);
  const result = await client.waitFor(consoleActor, (p) => p.type === 'evaluationResult' && p.resultID === started.resultID);
  if (result.exceptionMessage) throw new Error(result.exceptionMessage);
  const value = result.result;
  if (value && typeof value === 'object') {
    if (value.type === 'undefined' || value.type === 'null') return '';
    if (value.type === 'longString') return value.initial;
  }
  return value;
}

export async function grantPermissions(client, addonId, { privateBrowsing = false, origins = [], reload = true } = {}) {
  const { processDescriptor } = await client.request('root', 'getProcess', { id: 0 });
  const { process } = await client.request(processDescriptor.actor, 'getTarget');
  await run(client, process.consoleActor, `(async () => {
    const { ExtensionPermissions } = ChromeUtils.importESModule('resource://gre/modules/ExtensionPermissions.sys.mjs');
    const { AddonManager } = ChromeUtils.importESModule('resource://gre/modules/AddonManager.sys.mjs');
    await ExtensionPermissions.add(${JSON.stringify(addonId)}, { permissions: ${JSON.stringify(privateBrowsing ? ['internal:privateBrowsingAllowed'] : [])}, origins: ${JSON.stringify(origins)} });
    if (${JSON.stringify(reload)}) {
      const addon = await AddonManager.getAddonByID(${JSON.stringify(addonId)});
      await addon.reload();
    }
  })(); "started"`);
  await new Promise((r) => setTimeout(r, reload ? 4000 : 500));
}

export async function extensionPage(client, addonId, urlPart) {
  const descriptor = await descriptorFor(client, addonId);
  const resolve = async () => (await findTarget(client, descriptor.actor, (t) => t.url?.includes(urlPart), `Extension page ${urlPart}`)).consoleActor;
  await resolve();
  return {
    evaluate: (code) => evaluateIn(client, resolve, code),
    target: () => findTarget(client, descriptor.actor, (t) => t.url?.includes(urlPart), `Extension page ${urlPart}`),
  };
}

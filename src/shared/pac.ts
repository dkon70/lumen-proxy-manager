import { activeProxy, isValidPort, isValidProxyHost } from './settings';
import type { ProxyServer, Settings } from './types';

export function proxyToken(p: ProxyServer): string {
  if (!isValidProxyHost(p.host) || !isValidPort(p.port)) throw new Error(`Invalid proxy address: ${p.host}:${p.port}`);
  const addr = p.host.includes(':') ? `[${p.host}]:${p.port}` : `${p.host}:${p.port}`;
  switch (p.scheme) {
    case 'http':
      return `PROXY ${addr}`;
    case 'https':
      return `HTTPS ${addr}`;
    case 'socks4':
      return `SOCKS ${addr}`;
    case 'socks5':
      return `SOCKS5 ${addr}`;
  }
}

const RULE_PROXY = 1;
const RULE_DIRECT = 2;

export interface PacBuildInput {
  settings: Settings;
  remotePac: string | null;
}

export function buildPac({ settings: s, remotePac }: PacBuildInput): string {
  const proxy = activeProxy(s);
  const token = proxy ? proxyToken(proxy) : null;
  const viaProxy = token ? (s.blockDirect ? token : `${token}; DIRECT`) : null;

  const rules: Record<string, number> = {};
  for (const d of s.proxyList) rules[d] = RULE_PROXY;
  for (const d of s.directList) rules[d] = RULE_DIRECT;

  const global = s.mode === 'global';
  const useRemote = !global && remotePac !== null && remotePac.trim() !== '';
  const fallback = global || s.defaultAction === 'proxy' ? viaProxy : null;

  const config = {
    proxy: viaProxy,
    fallback,
    bypassLocal: s.bypassLocal,
    blockDirect: s.blockDirect,
    replacePac: s.pac.useOwnProxy && viaProxy !== null,
  };

  const remoteBlock = useRemote
    ? `var remote = (function () {\n${remotePac}\n;return typeof FindProxyForURL === "function" ? FindProxyForURL : null;\n})();`
    : 'var remote = null;';

  return toAscii(`var FindProxyForURL = (function () {
  var apply = Reflect.apply;
  var toStr = String;
  var hasOwn = Object.prototype.hasOwnProperty;
  var sIndexOf = String.prototype.indexOf;
  var sSubstring = String.prototype.substring;
  var sSplit = String.prototype.split;
  var sTrim = String.prototype.trim;
  var sUpper = String.prototype.toUpperCase;
  var sCharCode = String.prototype.charCodeAt;
  var aJoin = Array.prototype.join;
  var aPush = Array.prototype.push;
  var cfg = ${JSON.stringify(config)};
  var rules = ${JSON.stringify(rules)};

  function isLocal(h) {
    if (apply(sIndexOf, h, ["."]) < 0 && apply(sIndexOf, h, [":"]) < 0) return true;
    if (h === "localhost" || endsWith(h, ".localhost") || endsWith(h, ".local") || endsWith(h, ".internal")) return true;
    var c = apply(sCharCode, h, [0]);
    if (c === 91) h = apply(sSubstring, h, [1, h.length - 1]);
    if (h === "::1") return true;
    var p = apply(sSplit, h, ["."]);
    if (p.length === 4 && isNum(p[0])) {
      var a = +p[0], b = +p[1];
      return a === 10 || a === 127 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31) || (a === 169 && b === 254) || (a === 100 && b >= 64 && b <= 127);
    }
    var pre = apply(sSubstring, h, [0, 4]);
    return pre === "fe80" || apply(sSubstring, h, [0, 2]) === "fc" || apply(sSubstring, h, [0, 2]) === "fd";
  }
  function isNum(x) {
    if (!x.length) return false;
    for (var i = 0; i < x.length; i++) { var c = apply(sCharCode, x, [i]); if (c < 48 || c > 57) return false; }
    return true;
  }
  function endsWith(h, tail) {
    return h.length > tail.length && apply(sSubstring, h, [h.length - tail.length]) === tail;
  }
  function lookup(h) {
    for (;;) {
      if (apply(hasOwn, rules, [h])) return rules[h];
      var i = apply(sIndexOf, h, ["."]);
      if (i < 0) return 0;
      h = apply(sSubstring, h, [i + 1]);
    }
  }
  function orDefault() {
    return cfg.fallback || "DIRECT";
  }
  function fixRemote(r) {
    if (typeof r !== "string") return orDefault();
    var parts = apply(sSplit, r, [";"]), keep = [], direct = false;
    for (var i = 0; i < parts.length; i++) {
      var t = apply(sTrim, parts[i], []);
      if (!t) continue;
      if (apply(sUpper, t, []) === "DIRECT") direct = true; else apply(aPush, keep, [t]);
    }
    if (!keep.length) return direct ? "DIRECT" : orDefault();
    if (cfg.replacePac) return cfg.proxy;
    if (cfg.blockDirect || !direct) return apply(aJoin, keep, ["; "]);
    return apply(aJoin, keep, ["; "]) + "; DIRECT";
  }

  ${remoteBlock}

  return function FindProxyForURL(url, host) {
    host = toStr(host);
    if (cfg.bypassLocal && isLocal(host)) return "DIRECT";
    var rule = lookup(host);
    if (rule === ${RULE_DIRECT}) return "DIRECT";
    if (rule === ${RULE_PROXY} && cfg.proxy) return cfg.proxy;
    if (remote) {
      try { return fixRemote(remote(url, host)); }
      catch (e) { return cfg.blockDirect && cfg.proxy ? cfg.proxy : orDefault(); }
    }
    return orDefault();
  };
})();
Object.defineProperty(this, "FindProxyForURL", { value: FindProxyForURL, writable: false });
`);
}

function toAscii(src: string): string {
  return src.replace(/[^\x00-\x7f]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
}

import { isValidPort, isValidProxyHost } from './settings';
import type { ProxyScheme, ProxyServer } from './types';

const SCHEME_ALIASES: Record<string, ProxyScheme> = {
  http: 'http',
  https: 'https',
  socks: 'socks5',
  socks5: 'socks5',
  socks5h: 'socks5',
  socks4: 'socks4',
  socks4a: 'socks4',
};

export function parseProxyString(input: string): Partial<ProxyServer> | null {
  const s = input.trim();
  if (!s) return null;
  const m = /^([a-z0-9]+):\/\//i.exec(s);
  if (m) {
    const scheme = SCHEME_ALIASES[m[1].toLowerCase()];
    if (!scheme) return null;
    try {
      const u = new URL(`http://${s.slice(m[0].length)}`);
      const host = u.hostname.replace(/^\[|\]$/g, '');
      const port = Number(u.port || (scheme === 'https' ? 443 : scheme === 'http' ? 80 : 1080));
      if (!isValidProxyHost(host) || !isValidPort(port)) return null;
      return { scheme, host, port, username: decodeURIComponent(u.username), password: decodeURIComponent(u.password) };
    } catch {
      return null;
    }
  }
  const parts = s.split(':');
  if (parts.length === 2 || parts.length === 4) {
    const [host, portStr, username = '', password = ''] = parts;
    const port = Number(portStr);
    if (isValidProxyHost(host.toLowerCase()) && isValidPort(port)) return { host: host.toLowerCase(), port, username, password };
  }
  return null;
}

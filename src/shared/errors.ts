import { localized, type Localized, type MessageKey } from './i18n';

const KNOWN: Record<string, MessageKey> = {
  'net::ERR_PROXY_CONNECTION_FAILED': 'proxyError.connectionFailed',
  'net::ERR_TUNNEL_CONNECTION_FAILED': 'proxyError.tunnelFailed',
  'net::ERR_SOCKS_CONNECTION_FAILED': 'proxyError.socksFailed',
  'net::ERR_SOCKS_CONNECTION_HOST_UNREACHABLE': 'proxyError.socksUnreachable',
  'net::ERR_PROXY_AUTH_UNSUPPORTED': 'proxyError.authUnsupported',
  'net::ERR_PROXY_AUTH_REQUESTED': 'proxyError.authRequested',
  'net::ERR_PROXY_CERTIFICATE_INVALID': 'proxyError.certificate',
  'net::ERR_PAC_SCRIPT_FAILED': 'proxyError.pacFailed',
  'net::ERR_PAC_NOT_IN_DHCP': 'proxyError.pacNotFound',
  'net::ERR_MANDATORY_PROXY_CONFIGURATION_FAILED': 'proxyError.mandatory',
  'net::ERR_PROXY_HTTP_1_1_REQUIRED': 'proxyError.http11',
  'net::ERR_NAME_NOT_RESOLVED': 'proxyError.nameNotResolved',
  NS_ERROR_PROXY_CONNECTION_REFUSED: 'proxyError.connectionFailed',
  NS_ERROR_UNKNOWN_PROXY_HOST: 'proxyError.nameNotResolved',
  NS_ERROR_PROXY_AUTHENTICATION_FAILED: 'proxyError.authRequested',
  NS_ERROR_PROXY_BAD_GATEWAY: 'proxyError.tunnelFailed',
  NS_ERROR_PROXY_GATEWAY_TIMEOUT: 'proxyError.tunnelFailed',
  NS_ERROR_SOCKS_CONNECTION_REFUSED: 'proxyError.socksFailed',
};

export function describeProxyError(code: string): Localized {
  const key = KNOWN[code];
  return key ? localized(key) : localized('proxyError.unknown', { code: code.replace(/^(net::|NS_ERROR_)/, '') });
}

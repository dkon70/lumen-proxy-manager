export const PAC_HELPERS = String.raw`
function isPlainHostName(host) { return host.indexOf('.') < 0; }
function dnsDomainIs(host, domain) {
  return host.length >= domain.length && host.substring(host.length - domain.length) === domain;
}
function localHostOrDomainIs(host, hostdom) {
  return host === hostdom || hostdom.lastIndexOf(host + '.', 0) === 0;
}
function __isIp(h) { return /^\d{1,3}(\.\d{1,3}){3}$/.test(h); }
function isResolvable(host) { return __isIp(host); }
function isResolvableEx(host) { return __isIp(host); }
function dnsResolve(host) { return __isIp(host) ? host : null; }
function dnsResolveEx(host) { return dnsResolve(host) || ''; }
function myIpAddress() { return '127.0.0.1'; }
function myIpAddressEx() { return '127.0.0.1'; }
function convert_addr(ip) {
  var b = ip.split('.');
  return (((b[0] & 0xff) << 24) | ((b[1] & 0xff) << 16) | ((b[2] & 0xff) << 8) | (b[3] & 0xff)) >>> 0;
}
function isInNet(ipaddr, pattern, maskstr) {
  var ip = dnsResolve(ipaddr);
  if (!ip || !__isIp(pattern) || !__isIp(maskstr)) return false;
  var m = convert_addr(maskstr);
  return (convert_addr(ip) & m) === (convert_addr(pattern) & m);
}
function isInNetEx(ip, prefix) {
  var p = prefix.split('/');
  var bits = +p[1];
  var mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  var a = dnsResolve(ip);
  if (!a || !__isIp(p[0])) return false;
  return ((convert_addr(a) & mask) >>> 0) === ((convert_addr(p[0]) & mask) >>> 0);
}
function dnsDomainLevels(host) { return host.split('.').length - 1; }
function shExpMatch(url, pattern) {
  pattern = pattern.replace(/[.+^$(){}|\\[\]]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.');
  return new RegExp('^' + pattern + '$').test(url);
}
var __days = ['SUN','MON','TUE','WED','THU','FRI','SAT'];
function weekdayRange(a, b, gmt) {
  if (b === 'GMT') { gmt = b; b = undefined; }
  var d = gmt === 'GMT' ? new Date().getUTCDay() : new Date().getDay();
  var s = __days.indexOf(a), e = b === undefined ? s : __days.indexOf(b);
  return s <= e ? d >= s && d <= e : d >= s || d <= e;
}
function dateRange() { return true; }
function timeRange() { return true; }
function alert() {}
`;

---
name: pac-routing
description: Change how Lumen Proxy decides where a request goes - the generated PAC script (src/shared/pac.ts), list matching, DIRECT blocking or external PAC handling. Use for any routing bug or routing feature.
---

# Change routing / PAC generation

`buildPac()` in `src/shared/pac.ts` produces the only script Chrome sees. The UI explains routes with
`matchRule()` in `src/shared/route.ts` and by evaluating the same generated PAC in the sandbox.

## Decision order (keep it)

1. `bypassLocal` and a local host (plain name, localhost, *.local, *.internal, private IPv4/IPv6 literals) -> `DIRECT`.
   Detection is by the host string only; never call `dnsResolve` or `isInNet` (DNS leak).
2. Longest suffix match in `rules` (`proxyList` = 1, `directList` = 2; direct overwrites proxy on the same key).
3. External PAC, only in `rules` mode, post-processed by `fixRemote()`.
4. `fallback`: own proxy in `global` mode or with `defaultAction: 'proxy'`, otherwise `DIRECT`.

`viaProxy` is `"<TOKEN>"` with `blockDirect`, otherwise `"<TOKEN>; DIRECT"`. `pacScript.mandatory` equals
`blockDirect` in Chrome (`src/platform/chrome.ts`); Firefox has no equivalent flag.

## Hard rules

- Output must be ASCII: everything is wrapped in `toAscii()`. Never bypass it.
- Do not add `"use strict"` to the wrapper. The external PAC is nested inside it and would become strict.
- Inside the template, call built-ins only through the captured references (`apply(sIndexOf, h, ["."])`).
  `Reflect.apply` needs an args array even when empty: `apply(sTrim, t, [])`.
- Embed data only via `JSON.stringify` of values already validated by `normalizeSettings()`.
- Keep `FindProxyForURL` non-writable (`Object.defineProperty` at the end of the script).
- If list matching or the decision order changes, change `matchRule()` / `allMatches()` / `isLocalHost()` /
  `explainRoute()` in `route.ts` the same way. Firefox UI relies on `explainRoute()` alone, and
  `tests/route.test.ts` compares it with the generated PAC.

## Workflow

1. Write the failing test first in `tests/pac.test.ts`. `run(buildPac(...))` evaluates the PAC in a clean
   `node:vm` context like Chrome does. Cover both `blockDirect` values when the change touches fallbacks.
2. Change `pac.ts` (and `route.ts` if needed).
3. `npm test` - the hostile-PAC test ("не может подменить точку входа...") must keep passing.
4. `npm run build && npm run e2e` - Chrome may reject scripts that pass in Node. `npm test` also runs the built
   Firefox background against a mocked `browser` and evaluates the PAC it applies.
5. Check the popup and "Проверка адреса" still explain the route correctly (`npm run e2e:shots`).

## Debugging a real route

- Options -> "Проверка адреса" runs the exact generated PAC in the sandbox for any URL.
- `chrome://net-internals/#proxy` shows the active PAC and recent proxy errors.
- Service worker console: `chrome://extensions` -> Lumen Proxy -> "service worker". Apply errors are logged
  as `[lumen] apply failed`.

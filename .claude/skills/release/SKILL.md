---
name: release
description: Prepare a Lumen Proxy release - bump the version, run all checks, build and zip the extension for the Chrome Web Store or manual install. Use when the user asks to release, package, publish or bump the version.
---

# Release

## Steps

1. **Version** - bump `version` in both `package.json` and `manifest/base.json`; they must match.
   Chrome versions are 1-4 dot-separated integers (`0.2.0`), no suffixes like `-beta`.

2. **Checks** - all must pass:
   ```bash
   npm test && npm run check && npm run build && npm run lint:firefox && npm run e2e
   ```

3. **Permission review** - diff `manifest/*.json` against the previous release:
   - new entries in `permissions` or `host_permissions` show a warning on update and disable the extension
     until the user accepts; prefer `optional_permissions` / `optional_host_permissions`;
   - `content_security_policy` must keep `script-src 'self'` for extension pages and `connect-src 'none'`
     for the sandbox.

4. **Package** - `npm run zip` builds both targets and creates `lumen-proxy-chrome.zip` and
   `lumen-proxy-firefox.zip` with `scripts/zip.mjs` (pure Node, works on every OS). Check that each archive has
   `manifest.json` at its root, `LICENSE.txt` with notices for every bundled package, and no source maps.
   The project is MIT (`LICENSE`); a new runtime dependency must have a license compatible with MIT and a license
   file, otherwise the build fails while generating `LICENSE.txt`. The Firefox zip is what AMO expects (it signs it into .xpi).

5. **Smoke test** - load `dist/` via `chrome://extensions` -> "Load unpacked" in a clean profile; open the
   popup on a normal site, switch modes, open every options section in light and dark themes and in both languages.

6. **Notes** - write release notes in Russian and English, user-facing: what changed for the user, not internals.
   Mention any new permission and why it is needed.

7. **Docs and listing** - if features changed, update `README.md` and `README.ru.md` together, and
   `store/description.en.txt` / `store/description.ru.txt`. If the UI changed visibly, run `npm run store` and
   commit the regenerated `store/screenshots/` and `store/promo/` (the copy on the images lives in `COPY` in
   `scripts/store.mjs`, in both languages).

## Firefox Add-ons (AMO) specifics

- Listing: https://addons.mozilla.org/firefox/addon/lumen-proxy/ (no locale in links; AMO picks the user's language).
- The add-on id `{746b5e76-a6b7-4690-aed0-ae70ea57dace}` in `manifest/firefox.json` is permanent: AMO binds it to the listing on
  the first upload and rejects any other add-on using it ("Duplicate add-on ID"). Never change it; new releases are
  uploaded as new versions of the same listing.
- `data_collection_permissions` is `none`; keep it true.
- Reviewers may ask about the remaining linter warning (`innerHTML`): it is Svelte's runtime creating DOM from
  compile-time templates; no user data reaches it (`{@html}` is not used).
- AMO asks for source code because the build is minified: upload `lumen-proxy-source.zip` from
  `npm run zip:source` (git-tracked and unignored files except `store/` and `.github/`, includes `package-lock.json` and `SOURCE_BUILD.md` with the
  reviewer instructions). Before uploading, prove reproducibility: unpack it into an empty folder, run
  `npm ci && npm run build:firefox`, and `diff -r` the result with `dist/firefox` — it must be identical.
  Keep the Node/npm versions in `SOURCE_BUILD.md` in sync with the ones you release with.

## Chrome Web Store specifics

- Listing: https://chromewebstore.google.com/detail/lumen-proxy/bohgadimlbncallihhhnigidffjfalec
- Every permission, including optional ones (`privacy`), needs a justification on the "Privacy practices" tab.
  The texts, the single purpose, the remote code answer and the data usage answer are in `store/privacy.en.txt`;
  when a permission is added or its use changes, update that file and paste the new text into the dashboard.
- Remote code: answered "Yes" - the user's PAC script is test-run in the sandbox page and handed to
  `chrome.proxy`; extension code itself is never loaded remotely.
- Privacy: the extension sends no data anywhere; it downloads only the PAC URL the user entered. No data usage
  categories are ticked.

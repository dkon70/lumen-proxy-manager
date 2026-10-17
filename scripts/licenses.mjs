import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const LICENSE_FILES = ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'license', 'license.md'];

export function packageOf(moduleId) {
  const match = moduleId.replace(/\\/g, '/').match(/node_modules\/((?:@[^/]+\/)?[^/]+)\//g);
  if (!match) return null;
  return match[match.length - 1].replace(/^node_modules\/|\/$/g, '');
}

function licenseText(dir) {
  const file = LICENSE_FILES.map((name) => join(dir, name)).find((f) => existsSync(f));
  return file ? readFileSync(file, 'utf8').trim() : null;
}

export function thirdPartyNotices(packages, root = process.cwd()) {
  const own = readFileSync(join(root, 'LICENSE'), 'utf8').trim();
  const sections = [...packages].sort().map((name) => {
    const dir = join(root, 'node_modules', name);
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
    const text = licenseText(dir);
    if (!text) throw new Error(`No license file found for bundled package ${name}`);
    return `${pkg.name} ${pkg.version} (${pkg.license})\n${'-'.repeat(60)}\n${text}`;
  });
  return [`Lumen Proxy\n${'='.repeat(60)}\n${own}`, 'Third-party software bundled in this extension', ...sections].join('\n\n\n') + '\n';
}

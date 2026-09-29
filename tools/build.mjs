// Inlines index.html's scripts into one self-contained file: dist/fogbound.html.
// Usage: node tools/build.mjs [--artifact out.html]
//   --artifact also writes a copy without the doctype/head/body wrapper, for hosts
//   (like Claude artifacts) that supply their own document skeleton.
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const m = html.match(/<!-- build:scripts -->([\s\S]*?)<!-- \/build:scripts -->/);
if (!m) throw new Error('no build:scripts block in index.html');
const srcs = [...m[1].matchAll(/<script src="([^"]+)"><\/script>/g)].map(x => x[1]);
let js = '';
for (const s of srcs) {
  const code = fs.readFileSync(path.join(root, s), 'utf8').replace(/^'use strict';\n/, '');
  js += `\n/* ---- ${s} ---- */\n${code}`;
}
const out = html.replace(m[0], `<script>\n(() => {\n'use strict';${js.replace(/<\/script/g, '<\\/script')}\n})();\n</script>`);
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist', 'fogbound.html'), out);
console.log(`dist/fogbound.html  ${(out.length / 1024).toFixed(0)} KB  (${srcs.length} scripts)`);
const ai = process.argv.indexOf('--artifact');
if (ai > 0) {
  const bare = out.replace(/<!doctype html>\s*<html[^>]*>\s*<head>\s*/i, '').replace(/<meta charset[^>]*>\s*<meta name="viewport"[^>]*>\s*/i, '')
    .replace(/<\/head>\s*<body>\s*/i, '\n').replace(/<\/body>\s*<\/html>\s*$/i, '\n');
  fs.writeFileSync(path.resolve(process.argv[ai + 1]), bare);
  console.log(`${process.argv[ai + 1]}  ${(bare.length / 1024).toFixed(0)} KB  (no document wrapper)`);
}

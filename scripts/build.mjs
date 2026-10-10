import { readFile, writeFile, mkdir, cp, rm, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateProbe } from './generate-probe.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const vendor = path.join(root, 'node_modules', 'shaka-player');
let installed;
try {
  installed = JSON.parse(await readFile(path.join(vendor, 'package.json'), 'utf8'));
  await access(path.join(vendor, 'dist', 'shaka-player.compiled.js'));
  await access(path.join(vendor, 'LICENSE'));
} catch {
  console.error('再生エンジンがありません。先に npm install --ignore-scripts --no-audit --no-fund を実行してください。');
  process.exit(1);
}
if (installed.version !== pkg.dependencies['shaka-player']) throw new Error('Shaka Playerの固定バージョンが一致しません。公開を中止します。');
const dist = path.join(root, 'dist');
await rm(dist, { recursive: true, force: true });
await mkdir(path.join(dist, 'vendor'), { recursive: true });
await cp(path.join(root, 'assets'), path.join(dist, 'assets'), { recursive: true });
await generateProbe(path.join(dist, 'assets', 'probe.mp4'));
await cp(path.join(root, 'index.html'), path.join(dist, 'index.html'));
await cp(path.join(vendor, 'dist', 'shaka-player.compiled.js'), path.join(dist, 'vendor', 'shaka-player.compiled.js'));
await cp(path.join(vendor, 'LICENSE'), path.join(dist, 'vendor', 'SHAKA-LICENSE.txt'));
await cp(path.join(root, 'LICENSE'), path.join(dist, 'LICENSE'));
await writeFile(path.join(dist, '.nojekyll'), '');
const engine = await readFile(path.join(dist, 'vendor', 'shaka-player.compiled.js'));
await writeFile(path.join(dist, 'vendor', 'VERSION.json'), JSON.stringify({ name: 'shaka-player', version: installed.version, sha256: createHash('sha256').update(engine).digest('hex') }, null, 2) + '\n');
console.log('dist/ を作成しました。公開後の再生にPCやNode.jsは不要です。');
await writeFile(path.join(dist, 'BUILD.json'), JSON.stringify({ app: pkg.name, version: pkg.version, commit: process.env.GITHUB_SHA || null, builtAt: new Date().toISOString() }, null, 2) + '\n');

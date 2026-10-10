import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const pkg = JSON.parse(await readFile('package.json', 'utf8'));
const vendor = JSON.parse(await readFile('dist/vendor/VERSION.json', 'utf8'));
assert.equal(vendor.version, pkg.dependencies['shaka-player']);
const engine = await readFile('dist/vendor/shaka-player.compiled.js');
assert.ok(engine.length > 100000, 'Expected the real compiled Shaka Player');
assert.equal(createHash('sha256').update(engine).digest('hex'), vendor.sha256);
assert.match(await readFile('dist/vendor/SHAKA-LICENSE.txt', 'utf8'), /Apache License/);
for (const file of ['index.html', 'assets/app.js', 'assets/core.js', 'assets/style.css', 'assets/probe.mp4', 'BUILD.json']) {
  assert.ok((await stat('dist/' + file)).size > 0, 'Missing build file: ' + file);
}
const result = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_name,width,height,r_frame_rate', '-show_entries', 'format=duration', '-of', 'json', 'dist/assets/probe.mp4'], { encoding: 'utf8', timeout: 30000 });
assert.equal(result.status, 0, result.stderr || String(result.error));
const media = JSON.parse(result.stdout);
const video = media.streams.find(s => s.codec_name === 'h264');
assert.ok(video && video.width === 640 && video.height === 360);
assert.equal(video.r_frame_rate, '24/1');
assert.ok(media.streams.some(s => s.codec_name === 'aac'));
assert.ok(Math.abs(Number(media.format.duration) - 10) < 0.2);
console.log('Build verified: real pinned Shaka, license, SHA-256, 10-second H.264/AAC probe.');
console.log('This is not verification of Piped, YouTube playback, or the Panasonic TV.');
console.log(JSON.stringify(vendor, null, 2));

import { spawnSync } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Only synthetic video and a quiet test tone; never downloads third-party media.
export async function generateProbe(destination) {
  await mkdir(path.dirname(destination), { recursive: true });
  const result = spawnSync('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=24:duration=10',
    '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=44100:duration=10',
    '-map', '0:v:0', '-map', '1:a:0', '-t', '10',
    '-c:v', 'libx264', '-profile:v', 'baseline', '-level:v', '3.0',
    '-pix_fmt', 'yuv420p', '-preset', 'veryfast', '-crf', '28',
    '-c:a', 'aac', '-b:a', '64k', '-ac', '1', '-af', 'volume=0.2',
    '-movflags', '+faststart', '-map_metadata', '-1', destination
  ], { encoding: 'utf8', timeout: 120000, maxBuffer: 1024 * 1024 });
  if (result.error || result.status !== 0) {
    throw new Error('合成テスト動画を作成できません。ffmpegが必要です。\n' +
      (result.error ? result.error.message : result.stderr));
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  await generateProbe(path.resolve(process.argv[2] || path.join(root, 'assets/probe.mp4')));
  console.log('10秒の合成テスト動画を作成しました。YouTube動画ではありません。');
}

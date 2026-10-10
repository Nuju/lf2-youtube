'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const C = require('../assets/core.js');
const id = 'jNQXAC9IVRw';
const v = { url: 'https://media.example.org/video?q=1&x=2', mimeType: 'video/mp4', codec: 'avc1.42E01E', videoOnly: true, height: 720, width: 1280, fps: 30, bitrate: 1000000, initStart: 0, initEnd: 735, indexStart: 736, indexEnd: 899 };
const a = { url: 'https://media.example.org/audio', mimeType: 'audio/mp4', codec: 'mp4a.40.2', bitrate: 128000, initStart: 0, initEnd: 611, indexStart: 612, indexEnd: 755 };
const data = (videos, audio = []) => ({ title: 'Test', duration: 120, videoStreams: videos, audioStreams: audio, livestream: false });
for (const [name, input] of [ ['id', id], ['watch', 'https://www.youtube.com/watch?v=' + id + '&t=4'], ['short', 'https://youtu.be/' + id], ['shorts', 'https://www.youtube.com/shorts/' + id], ['live', 'https://www.youtube.com/live/' + id], ['mobile', 'https://m.youtube.com/watch?v=' + id], ['embed', 'https://www.youtube-nocookie.com/embed/' + id] ]) {
  test('video ID: ' + name, () => assert.equal(C.parseVideoId(input), id));
}
for (const input of ['https://youtube.com.evil.org/watch?v=' + id, 'https://youtu.be@evil.org/' + id, 'javascript:alert(1)', 'https://www.youtube.com/playlist?list=abc', 'https://youtube.com/watch?v=abc', '', 'https://youtube.com:444/watch?v=' + id]) {
  test('reject invalid video URL: ' + input, () => assert.throws(() => C.parseVideoId(input)));
}
test('requested mobile test link keeps video ID and 5:19 start', () => {
  const input = 'https://m.youtube.com/watch?v=9-YYeiBjcak&t=319s&pp=ugUEEgJqYQ%3D%3D';
  assert.equal(C.parseVideoId(input), '9-YYeiBjcak');
  assert.equal(C.parseStartTime(input), 319);
});
for (const [name, suffix, seconds] of [
  ['integer seconds', '&t=319', 319],
  ['minutes and seconds', '&t=5m19s', 319],
  ['hours, minutes and seconds', '&t=1h2m3s', 3723],
  ['start parameter', '&start=319', 319],
  ['fragment time', '#t=5m19s', 319],
  ['zero', '&t=0s', 0],
  ['unspecified', '', 0]
]) {
  test('start time: ' + name, () => assert.equal(C.parseStartTime('https://www.youtube.com/watch?v=' + id + suffix), seconds));
}
test('video ID without a URL has no start time', () => assert.equal(C.parseStartTime(id), 0));
for (const value of ['', '-1', '1.5', '319junk', 'Infinity', '9007199254740992']) {
  test('invalid start time falls back to zero: ' + value, () => assert.equal(C.parseStartTime('https://www.youtube.com/watch?v=' + id + '&t=' + value), 0));
}
test('malformed or missing URL has no start time', () => {
  for (const value of [undefined, null, '', 'not a URL']) assert.equal(C.parseStartTime(value), 0);
});
for (const input of ['http://example.org', 'https://127.0.0.1', 'https://2130706433', 'https://0x7f000001', 'https://[::1]', 'https://router.local', 'https://localhost.', 'https://intranet', 'https://u:p@example.org', 'data:text/plain,x', 'https://example.org:8443']) {
  test('reject non-public/unsafe API: ' + input, () => assert.equal(C.publicHttps(input), null));
}
test('API base URL preserves subpath and strips slash', () => assert.equal(C.normalizeApi('https://api.example.org/piped/'), 'https://api.example.org/piped'));
test('API URL query is rejected', () => assert.throws(() => C.normalizeApi('https://api.example.org/?token=x')));
test('API URL streams endpoint is rejected', () => assert.throws(() => C.normalizeApi('https://api.example.org/streams/' + id)));
test('muxed AVC <=720 is first', () => { const out = C.candidates(data([{ ...v, videoOnly: false }, v], [a])); assert.equal(out[0].kind, 'mp4'); assert.equal(out[1].kind, 'dash-generated'); });
test('video-only URL never passed to native MP4', () => assert.equal(C.candidates(data([v])) .length, 0));
test('missing videoOnly is not assumed muxed', () => assert.equal(C.candidates(data([{ ...v, videoOnly: undefined }])).length, 0));
test('720p60 and 1080p are excluded', () => assert.equal(C.candidates(data([{ ...v, fps: 60, videoOnly: false }, { ...v, height: 1080, videoOnly: false }])).length, 0));
test('VP9/AV1 video is not used in AVC pipeline', () => assert.equal(C.candidates(data([{ ...v, codec: 'av01.0.01M.08' }], [a])).length, 0));
test('range strings are not accepted as verified ranges', () => assert.equal(C.hasRange({ ...v, indexStart: '736' }), false));
test('invalid ranges are excluded', () => assert.equal(C.candidates(data([{ ...v, indexStart: -1 }], [a])).length, 0));
test('overlapping ranges are excluded', () => assert.equal(C.hasRange({ ...v, indexStart: 10 }), false));
test('DASH contains exactly audio and video representations', () => { const xml = C.makeDash(data([v], [a]), v, a); assert.match(xml, /contentType="video"/); assert.match(xml, /contentType="audio"/); assert.equal((xml.match(/<Representation /g) || []).length, 2); assert.match(xml, /q=1&amp;x=2/); });
test('DASH does not accept unknown duration', () => assert.throws(() => C.makeDash({ duration: null }, v, a)));
test('live videos do not get a generated static manifest', () => assert.equal(C.candidates({ ...data([v], [a]), livestream: true }).length, 0));
test('upstream HLS and DASH URLs become candidates', () => assert.deepEqual(C.candidates({ ...data([]), hls: 'https://media.example.org/a.m3u8', dash: 'https://media.example.org/a.mpd' }).map(x => x.kind), ['hls', 'dash']));
test('unsafe stream URL removed', () => assert.equal(C.candidates(data([{ ...v, videoOnly: false, url: 'http://evil.org/x' }])).length, 0));
test('server errors get a stable code', () => assert.throws(() => C.candidates({ error: 'secret url' }), e => e.code === 'API_UPSTREAM' && !e.message.includes('secret')));
test('HTML-shaped / malformed response rejected', () => assert.throws(() => C.candidates({ title: 'hello' }), e => e.code === 'API_SCHEMA'));
test('diagnostic redaction hides full URLs and video ID', () => { const text = C.safeLogText('https://example.org/streams/' + id + '?token=secret ' + id); assert.ok(!text.includes('secret')); assert.ok(!text.includes(id)); });
test('CORS is never asserted as the only network failure cause', () => assert.match(C.shortError({ code: 'NETWORK' }), /区別できません/));

/* LF2 YouTube v0.1.0 — browser-independent validation and stream selection. */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LF2Core = api;
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  function failure(code, message) { var e = new Error(message); e.code = code; return e; }
  function parseVideoId(input) {
    var value = String(input || '').trim(), id = '';
    if (/^[A-Za-z0-9_-]{11}$/.test(value)) return value;
    if (!/^https?:\/\//i.test(value)) throw failure('INPUT', 'YouTubeのURL、または11文字の動画IDを入力してください。');
    var u;
    try { u = new URL(value); } catch (_) { throw failure('INPUT', 'URLを確認してください。'); }
    if (u.username || u.password || u.port) throw failure('INPUT', 'このURL形式には対応していません。');
    var host = u.hostname.toLowerCase();
    if (host === 'youtu.be') id = u.pathname.split('/')[1];
    else if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'www.youtube-nocookie.com', 'youtube-nocookie.com'].indexOf(host) >= 0) {
      if (u.pathname === '/watch') id = u.searchParams.get('v');
      else if (/^\/(shorts|live|embed)\//.test(u.pathname)) id = u.pathname.split('/')[2];
    }
    if (!/^[A-Za-z0-9_-]{11}$/.test(id || '')) throw failure('INPUT', '個別のYouTube動画URLを入力してください。チャンネルや一覧のURLは使えません。');
    return id;
  }
  function publicHttps(value) {
    if (typeof value !== 'string' || value.length > 16384) return null;
    try {
      var u = new URL(value), h = u.hostname.toLowerCase().replace(/\.$/, '');
      if (u.protocol !== 'https:' || u.username || u.password || u.port && u.port !== '443') return null;
      if (h.indexOf('.') < 0 || /(^|\.)(localhost|local|internal|lan|home|test-invalid)$/.test(h)) return null;
      // Public API configuration does not need literal IP addresses. Reject them all,
      // including URL-normalized alternative IPv4 representations and IPv6.
      if (/^[\d.]+$/.test(h) || h.indexOf(':') >= 0 || h.charAt(0) === '[') return null;
      return u.href;
    } catch (_) { return null; }
  }
  function normalizeApi(value) {
    var url = publicHttps(String(value || '').trim());
    if (!url) throw failure('API_URL', 'APIには、公開ドメインのHTTPS URLを入力してください。');
    var u = new URL(url);
    if (u.search || u.hash) throw failure('API_URL', 'API URLにはクエリや # を付けないでください。');
    u.pathname = u.pathname.replace(/\/+$/, '');
    if (/\/(streams|watch)(\/|$)/.test(u.pathname)) throw failure('API_URL', '動画ページではなくAPIのベースURLを入力してください。');
    return u.href.replace(/\/+$/, '');
  }
  function finitePositive(v) { return typeof v === 'number' && Number.isFinite(v) && v > 0; }
  function height(s) { return finitePositive(s.height) ? s.height : parseInt(s.quality, 10) || 0; }
  function isAvc(s) { return /^video\/mp4(?:;|$)/i.test(s.mimeType || '') && /^avc[13]\./i.test(s.codec || ''); }
  function inBudget(s) { return height(s) > 0 && height(s) <= 720 && (!s.fps || s.fps <= 30); }
  function hasRange(s) {
    return ['indexStart', 'indexEnd', 'initStart', 'initEnd'].every(function (k) {
      return Number.isSafeInteger(s[k]) && s[k] >= 0;
    }) && s.indexEnd > s.indexStart && s.initEnd > s.initStart && s.indexStart > s.initEnd;
  }
  function xml(value) {
    return String(value).replace(/[&<>"']/g, function (s) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[s];
    });
  }
  function representation(s, id, kind) {
    var bandwidth = finitePositive(s.bitrate) ? Math.round(s.bitrate) : kind === 'video' ? 1500000 : 128000;
    var extra = kind === 'video' ? ' width="' + Math.max(1, Math.round(s.width || height(s) * 16 / 9)) + '" height="' + height(s) + '"' : '';
    return '<AdaptationSet contentType="' + kind + '" mimeType="' + kind + '/mp4">' +
      '<Representation id="' + id + '" bandwidth="' + bandwidth + '" codecs="' + xml(s.codec) + '"' + extra + '>' +
      '<BaseURL>' + xml(s.url) + '</BaseURL><SegmentBase indexRange="' + s.indexStart + '-' + s.indexEnd + '">' +
      '<Initialization range="' + s.initStart + '-' + s.initEnd + '"/></SegmentBase></Representation></AdaptationSet>';
  }
  function makeDash(data, video, audio) {
    if (!finitePositive(data.duration) || !hasRange(video) || !hasRange(audio) || !publicHttps(video.url) || !publicHttps(audio.url)) {
      throw failure('DASH_METADATA', 'DASHの再生に必要な情報が不足しています。');
    }
    return '<?xml version="1.0" encoding="UTF-8"?>' +
      '<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" type="static" minBufferTime="PT2S" mediaPresentationDuration="PT' + data.duration + 'S" profiles="urn:mpeg:dash:profile:isoff-on-demand:2011">' +
      '<Period duration="PT' + data.duration + 'S">' + representation(video, 'v', 'video') + representation(audio, 'a', 'audio') + '</Period></MPD>';
  }
  function candidates(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw failure('API_SCHEMA', 'APIの応答形式が想定と異なります。');
    if (data.error || data.message && !Array.isArray(data.videoStreams)) throw failure('API_UPSTREAM', 'APIが動画を取得できませんでした。動画側の制限や接続先の不調の可能性があります。');
    if (!Array.isArray(data.videoStreams)) throw failure('API_SCHEMA', 'APIの応答にvideoStreamsがありません。');
    var videos = data.videoStreams.filter(function (s) { return s && publicHttps(s.url); });
    var audio = (Array.isArray(data.audioStreams) ? data.audioStreams : []).filter(function (s) {
      return s && publicHttps(s.url) && /^audio\/mp4(?:;|$)/i.test(s.mimeType || '') && /^mp4a\./i.test(s.codec || '') && hasRange(s);
    }).sort(function (a, b) { return (a.bitrate || 0) - (b.bitrate || 0); });
    var result = videos.filter(function (s) {
      return s.videoOnly === false && /^video\/mp4(?:;|$)/i.test(s.mimeType || '') && (!s.codec || /^avc[13]\./i.test(s.codec)) && inBudget(s);
    }).sort(function (a, b) { return height(b) - height(a); }).map(function (s) {
      return { kind: 'mp4', label: height(s) + 'p / 音声入りMP4', url: s.url, height: height(s), mime: 'video/mp4' };
    });
    // Never try a video-only URL as if it contained audio.
    if (!data.livestream && audio.length && finitePositive(data.duration)) {
      videos.filter(function (s) { return s.videoOnly === true && isAvc(s) && inBudget(s) && hasRange(s); })
        .sort(function (a, b) { return height(b) - height(a); }).slice(0, 3).forEach(function (s) {
          result.push({ kind: 'dash-generated', label: height(s) + 'p / DASH（映像＋音声）', manifest: makeDash(data, s, audio[0]), height: height(s), mime: 'application/dash+xml' });
        });
    }
    if (publicHttps(data.hls)) result.push({ kind: 'hls', label: 'HLS / 分割配信', url: data.hls, mime: 'application/x-mpegURL' });
    if (publicHttps(data.dash)) result.push({ kind: 'dash', label: 'DASH / 配信マニフェスト', url: data.dash, mime: 'application/dash+xml' });
    return result;
  }
  function shortError(error) {
    var code = error && error.code;
    var known = {
      TIMEOUT: '応答が時間内に届きませんでした。接続先を変更して再試行してください。',
      NETWORK: '通信できませんでした。CORS・証明書・DNS・通信遮断は、ブラウザだけでは区別できません。',
      API_JSON: 'JSONではない応答が届きました。APIではなく通常のWebページの可能性があります。',
      NO_FORMAT: 'この版で扱える形式がありません。動画取得成功と視聴成功は別です。',
      PLAYER_MISSING: 'DASH/HLS再生エンジンが未配置です。公開前に npm run build を実行してください。',
      PLAYER_UNSUPPORTED: 'このブラウザでは追加の再生エンジンを利用できません。音声入りMP4を試してください。'
    };
    return known[code] || (error && error.message) || '処理に失敗しました。';
  }
  function safeLogText(value) {
    return String(value || '').replace(/https?:\/\/[^\s"<>]+/g, '[URL omitted]').replace(/\b[A-Za-z0-9_-]{11}\b/g, '[id]').slice(0, 320);
  }
  return { failure: failure, parseVideoId: parseVideoId, publicHttps: publicHttps, normalizeApi: normalizeApi, candidates: candidates, makeDash: makeDash, hasRange: hasRange, shortError: shortError, safeLogText: safeLogText };
}));

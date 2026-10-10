/* LF2 YouTube v0.1.1. No background requests, credentials or viewing-history storage. */
(function () {
  'use strict';
  var C = window.LF2Core;
  var $ = function (id) { return document.getElementById(id); };
  var video = $('video');
  var state = { mode: 'none', apiOrigin: null, formats: [], index: -1, loadedIndex: -1, player: null,
    blob: null, busy: false, abort: null, generation: 0, events: [], errors: [], progress: false,
    heard: false, lastTime: 0, ticks: 0, ready: false, engine: null, startTime: 0, pendingStart: null };
  var stages = { api: '未確認', format: '未確認', play: '未確認', audio: '未確認' };
  function log(code, text) {
    state.events.push({ time: new Date().toISOString(), code: code, detail: C.safeLogText(text) });
    state.events = state.events.slice(-70);
    $('log').textContent = state.events.map(function (e) { return e.time.substr(11, 8) + '  ' + e.code + '  ' + e.detail; }).join('\n');
  }
  function status(text) { $('status').textContent = text; }
  function stage(key, text, css) { stages[key] = text; $('stage-' + key).textContent = text; $('stage-' + key).className = css || ''; }
  function setBusy(value) {
    state.busy = value;
    $('fetch').disabled = value; $('probe').disabled = value; $('test-video').disabled = value; $('cancel').disabled = !value;
    $('format').disabled = value; $('instance').disabled = value; $('api-url').disabled = value;
    $('play').disabled = value || state.mode === 'none' || state.mode === 'youtube' && !state.formats.length;
    ['back', 'forward', 'fullscreen'].forEach(function (id) { $(id).disabled = value || !state.ready; });
  }
  function reportError(error, area) {
    var code = typeof error.code === 'string' ? error.code : 'PLAYER';
    state.errors.push(code); state.errors = state.errors.slice(-20);
    stage(area, code, 'bad');
    status(C.shortError(error)); log(code, C.shortError(error));
  }
  function resetProgress() {
    state.progress = false; state.heard = false; state.ticks = 0; state.lastTime = 0;
    $('heard').disabled = true; stage('play', '未確認'); stage('audio', '未確認');
  }
  async function cleanup() {
    state.ready = false; state.loadedIndex = -1; state.pendingStart = null;
    video.pause(); video.removeAttribute('src'); video.load();
    var previous = state.player; state.player = null;
    if (previous) { try { await previous.destroy(); } catch (_) { log('CLEANUP', '再生エンジンを終了'); } }
    if (state.blob) { URL.revokeObjectURL(state.blob); state.blob = null; }
    $('empty').hidden = false;
  }
  function abortCheck(generation) {
    if (generation !== state.generation) throw C.failure('CANCELLED', '処理を中止しました。');
  }
  async function requestJson(url, signal) {
    var response;
    try { response = await fetch(url, { method: 'GET', mode: 'cors', credentials: 'omit', redirect: 'error', cache: 'no-store', signal: signal, headers: { Accept: 'application/json' } }); }
    catch (error) { if (error.name === 'AbortError') throw error; throw C.failure('NETWORK', C.shortError({ code: 'NETWORK' })); }
    if (!response.ok) throw C.failure('HTTP_' + response.status, 'APIがHTTP ' + response.status + 'を返しました。接続先の不調や制限の可能性があります。');
    var max = 2 * 1024 * 1024;
    if (Number(response.headers.get('content-length')) > max) throw C.failure('API_SIZE', 'APIの応答が大きすぎます。');
    var text = '';
    if (response.body && response.body.getReader) {
      var reader = response.body.getReader(), decoder = new TextDecoder(), size = 0;
      try {
        while (true) {
          var chunk = await reader.read();
          if (chunk.done) break;
          size += chunk.value.byteLength;
          if (size > max) { await reader.cancel(); throw C.failure('API_SIZE', 'APIの応答が大きすぎます。'); }
          text += decoder.decode(chunk.value, { stream: true });
        }
        text += decoder.decode();
      } finally { reader.releaseLock(); }
    } else { text = await response.text(); if (text.length > max) throw C.failure('API_SIZE', 'APIの応答が大きすぎます。'); }
    try { return JSON.parse(text); } catch (_) { throw C.failure('API_JSON', C.shortError({ code: 'API_JSON' })); }
  }
  function getApi() { return C.normalizeApi($('instance').value === 'custom' ? $('api-url').value : $('instance').value); }
  function saveApi(api) { try { localStorage.setItem('lf2-youtube-api-v1', api); } catch (_) { log('STORAGE', '設定はこの画面内だけで保持'); } }
  async function fetchInfo() {
    if (state.busy) return;
    var id, api, startTime;
    try {
      id = C.parseVideoId($('video-url').value); startTime = C.parseStartTime($('video-url').value); api = getApi();
      if (!$('consent').checked) throw C.failure('CONSENT', '接続先への送信確認にチェックを入れてください。');
    } catch (e) { status(C.shortError(e)); log(e.code || 'INPUT', C.shortError(e)); return; }
    var generation = ++state.generation, timedOut = false;
    setBusy(true); await cleanup(); resetProgress();
    state.mode = 'youtube'; state.formats = []; state.index = -1; state.startTime = 0; state.apiOrigin = new URL(api).origin;
    state.errors = []; $('formats-wrap').hidden = true; $('title').textContent = '動画情報を取得しています';
    stage('api', '接続中', 'warn'); stage('format', '未確認'); status('選択したAPIへ接続しています。');
    log('API_START', '選択した接続先へ1回だけ要求');
    var controller = new AbortController(); state.abort = controller;
    var timer = setTimeout(function () { timedOut = true; controller.abort(); }, 12000);
    try {
      abortCheck(generation);
      var data = await requestJson(api + '/streams/' + encodeURIComponent(id), controller.signal);
      abortCheck(generation);
      var formats = C.candidates(data);
      stage('api', '取得成功', 'ok'); saveApi(api); log('API_OK', 'JSONと必須項目を取得');
      state.formats = formats; state.index = formats.length ? 0 : -1; state.startTime = data.livestream ? 0 : startTime;
      $('title').textContent = String(data.title || 'タイトルなし').slice(0, 240);
      $('meta').textContent = data.livestream ? 'ライブ配信 / 対応する配信形式が必要です。' : '通常動画 / まず720p以下・30fps以下の形式を優先します。';
      if (state.startTime > 0) $('meta').textContent += ' 開始位置: ' + Math.floor(state.startTime / 60) + '分' + state.startTime % 60 + '秒。';
      var select = $('format'); select.textContent = '';
      formats.forEach(function (f, i) { var option = document.createElement('option'); option.value = String(i); option.textContent = f.label; select.appendChild(option); });
      $('formats-wrap').hidden = !formats.length;
      if (!formats.length) throw C.failure('NO_FORMAT', C.shortError({ code: 'NO_FORMAT' }));
      stage('format', formats.length + '形式あり', 'ok');
      log('FORMATS', formats.map(function (f) { return f.kind + (f.height ? ':' + f.height : ''); }).join(', '));
      status('動画情報を取得しました。再生ボタンで映像と音声を確認してください。');
    } catch (error) {
      if (generation !== state.generation || error.name === 'AbortError' && !timedOut || error.code === 'CANCELLED') {
        stage('api', '中止'); status('処理を中止しました。'); log('CANCELLED', 'ユーザーが中止');
      } else { if (timedOut) error = C.failure('TIMEOUT', ''); reportError(error, stages.api === '取得成功' ? 'format' : 'api'); }
      if (!state.formats.length) $('title').textContent = '動画の準備ができませんでした';
    } finally { clearTimeout(timer); state.abort = null; setBusy(false); }
  }
  var enginePromise = null;
  function loadEngine() {
    if (window.shaka) return Promise.resolve();
    if (enginePromise) return enginePromise;
    enginePromise = new Promise(function (resolve, reject) {
      var script = document.createElement('script'), done = false;
      var timer = setTimeout(function () { finish(C.failure('PLAYER_MISSING', '')); }, 10000);
      function finish(error) {
        if (done) return; done = true; clearTimeout(timer);
        if (error) { script.remove(); reject(error); } else resolve();
      }
      script.src = 'vendor/shaka-player.compiled.js';
      script.onload = function () { finish(window.shaka ? null : C.failure('PLAYER_MISSING', '')); };
      script.onerror = function () { finish(C.failure('PLAYER_MISSING', '')); };
      document.head.appendChild(script);
    }).catch(function (e) { enginePromise = null; throw e; });
    return enginePromise;
  }
  async function engineLoad(format, generation) {
    await loadEngine(); abortCheck(generation);
    window.shaka.polyfill.installAll();
    if (!window.shaka.Player.isBrowserSupported()) throw C.failure('PLAYER_UNSUPPORTED', '');
    state.engine = window.shaka.Player.version || 'unknown';
    var player = new window.shaka.Player(); state.player = player;
    await player.attach(video); abortCheck(generation);
    player.configure({
      preferredVideoCodecs: ['avc1'], preferredAudioCodecs: ['mp4a'],
      restrictions: { maxHeight: 720, maxFrameRate: 30 },
      streaming: { bufferingGoal: 15, rebufferingGoal: 2, bufferBehind: 10,
        retryParameters: { maxAttempts: 2, timeout: 12000, connectionTimeout: 8000, stallTimeout: 8000 } },
      manifest: { retryParameters: { maxAttempts: 2, timeout: 12000, connectionTimeout: 8000, stallTimeout: 8000 } }
    });
    player.getNetworkingEngine().registerRequestFilter(function (type, request) {
      if (type === window.shaka.net.NetworkingEngine.RequestType.LICENSE || type === window.shaka.net.NetworkingEngine.RequestType.SERVER_CERTIFICATE) throw C.failure('DRM_NOT_SUPPORTED', '有料コンテンツやDRMの認証は扱いません。');
      request.allowCrossSiteCredentials = false;
      request.uris.forEach(function (uri) {
        if (uri === state.blob) return;
        if (!C.publicHttps(uri)) throw C.failure('MEDIA_URL', '安全なHTTPS配信URLではありません。');
      });
    });
    player.addEventListener('error', function (event) {
      if (state.player !== player || state.busy) return;
      reportError(C.failure('SHAKA_' + (event.detail.code || 'ERROR'), '分割配信の再生中にエラーが発生しました。接続先や別の形式を確認してください。'), 'play');
    });
    var url = format.url;
    if (format.kind === 'dash-generated') { state.blob = URL.createObjectURL(new Blob([format.manifest], { type: 'application/dash+xml' })); url = state.blob; }
    await player.load(url, state.startTime, format.mime); abortCheck(generation);
  }
  async function startPlayback() {
    if (state.busy || state.mode === 'none') return;
    if (state.ready && (state.mode === 'probe' || state.loadedIndex === state.index)) {
      if (!video.paused) { video.pause(); return; }
      await playWithGesture(); return;
    }
    if (state.mode !== 'youtube' || !state.formats[state.index]) return;
    var generation = ++state.generation, format = state.formats[state.index];
    setBusy(true); await cleanup(); resetProgress();
    status('選択した形式を準備しています。'); stage('play', '準備中', 'warn'); log('LOAD', format.kind);
    var cancelledByTimer = false, timer = setTimeout(function () {
      cancelledByTimer = true; state.generation++; if (state.player) state.player.unload().catch(function () {});
    }, 30000);
    try {
      abortCheck(generation);
      if (format.kind === 'mp4' || format.kind === 'hls' && video.canPlayType('application/vnd.apple.mpegurl')) {
        state.pendingStart = state.startTime > 0 ? state.startTime : null;
        video.src = format.url; video.load();
      } else { await engineLoad(format, generation); }
      abortCheck(generation);
      state.ready = true; state.loadedIndex = state.index; $('empty').hidden = true;
      clearTimeout(timer); setBusy(false); await playWithGesture();
    } catch (error) {
      if (cancelledByTimer) error = C.failure('TIMEOUT', '');
      if (error.code === 'CANCELLED') { status('処理を中止しました。'); stage('play', '中止'); }
      else reportError(error, 'play');
      await cleanup();
    } finally { clearTimeout(timer); setBusy(false); }
  }
  async function playWithGesture() {
    var generation = state.generation;
    try { await video.play(); if (generation !== state.generation) return; status('再生を開始しました。映像の進行と、テレビから音が出ることを確認してください。'); log('PLAY', '再生要求が受理された（音声の実機確認は別）'); }
    catch (error) {
      if (generation !== state.generation || error.name === 'AbortError') return;
      if (error.name === 'NotAllowedError') { status('再生許可が必要です。もう一度「再生 / 一時停止」を押してください。'); log('USER_GESTURE', '再生操作待ち'); }
      else reportError(C.failure('MEDIA_PLAY', '再生を開始できませんでした。別の形式か接続先を試してください。'), 'play');
    }
  }
  async function probe() {
    if (state.busy) return;
    var generation = ++state.generation; setBusy(true); await cleanup(); resetProgress();
    abortCheck(generation); state.mode = 'probe'; state.formats = []; state.startTime = 0; state.apiOrigin = null; state.errors = [];
    $('formats-wrap').hidden = true; $('title').textContent = '基本再生テスト（YouTubeではありません）';
    $('meta').textContent = '同梱動画 / H.264 Baseline 640×360・24fps / AAC確認音 / 10秒';
    stage('api', '対象外（同梱動画）'); stage('format', 'H.264 + AAC');
    video.src = 'assets/probe.mp4'; video.load(); state.ready = true; $('empty').hidden = true;
    log('PROBE', '同梱の合成動画を再生。YouTube成功には数えない'); setBusy(false); await playWithGesture();
  }
  $('test-video').addEventListener('click', function () {
    $('video-url').value = $('video-url').defaultValue;
    status('指定のテスト動画を入力しました。送信確認にチェックを入れ、「動画情報を取得」を押してください。');
  });
  $('fetch').addEventListener('click', fetchInfo);
  $('probe').addEventListener('click', function () { probe().catch(function (e) { status(C.shortError(e)); setBusy(false); }); });
  $('play').addEventListener('click', startPlayback);
  $('cancel').addEventListener('click', function () {
    state.generation++;
    if (state.abort) state.abort.abort();
    if (state.player) state.player.unload().catch(function () {});
    status('中止しています。');
  });
  $('instance').addEventListener('change', function () { $('custom-wrap').hidden = $('instance').value !== 'custom'; $('consent').checked = false; });
  $('api-url').addEventListener('input', function () { $('consent').checked = false; });
  $('format').addEventListener('change', function () {
    state.index = Number($('format').value); video.pause(); resetProgress();
    status('形式を変更しました。再生ボタンで読み直してください。');
  });
  function seek(delta) {
    if (!state.ready || !video.seekable.length) { status('まだ早送り・巻き戻しできません。'); return; }
    var end = video.seekable.end(video.seekable.length - 1), start = video.seekable.start(0);
    try { video.currentTime = Math.min(Math.max(start, video.currentTime + delta), Math.max(start, end - 0.1)); log('SEEK', String(delta) + ' seconds requested'); }
    catch (_) { status('この形式ではまだ位置を変更できません。'); }
  }
  $('back').addEventListener('click', function () { seek(-10); }); $('forward').addEventListener('click', function () { seek(10); });
  $('fullscreen').addEventListener('click', function () {
    try {
      var method = video.requestFullscreen || video.webkitRequestFullscreen || video.webkitEnterFullscreen;
      if (!method) { status('このブラウザには全画面機能がありません。'); return; }
      var result = method.call(video); if (result && result.catch) result.catch(function () { status('全画面表示が許可されませんでした。'); });
    } catch (_) { status('全画面表示を開始できませんでした。'); }
  });
  $('heard').addEventListener('click', function () {
    if (!state.progress) return; state.heard = true;
    stage('audio', '本人が映像・音声を確認', 'ok');
    log('MANUAL_AV_OK', state.mode === 'probe' ? '同梱動画のみ' : '選んだYouTube動画');
    status(state.mode === 'probe' ? '基本再生テストを確認しました。次はYouTubeの動画でお試しください。' : 'この動画の映像・音声を確認済みとして記録しました。次は数分の継続再生と早送りをお確かめください。');
  });
  video.addEventListener('timeupdate', function () {
    var delta = video.currentTime - state.lastTime; state.lastTime = video.currentTime;
    if (!video.paused && !video.seeking && video.videoWidth > 0 && delta > 0 && delta < 2) state.ticks++;
    if (!state.progress && state.ticks >= 3) {
      state.progress = true; stage('play', '進行を検知', 'ok'); stage('audio', '実際に確認してください', 'warn'); $('heard').disabled = false;
      log('PROGRESS', '映像サイズと再生時刻の連続した進行を検知');
    }
  });
  video.addEventListener('seeking', function () { state.ticks = 0; });
  function applyStartTime() {
    if (state.pendingStart === null || state.mode !== 'youtube') return;
    var target = state.pendingStart;
    if (Number.isFinite(video.duration)) target = Math.min(target, Math.max(0, video.duration - 0.1));
    try {
      video.currentTime = target; state.pendingStart = null;
      log('START_POSITION', 'URLで指定された開始位置へ移動');
    } catch (_) { /* Some native players need loadeddata or canplay before seeking. */ }
  }
  video.addEventListener('loadedmetadata', function () { log('METADATA', video.videoWidth + 'x' + video.videoHeight); applyStartTime(); });
  video.addEventListener('loadeddata', applyStartTime);
  video.addEventListener('canplay', applyStartTime);
  video.addEventListener('error', function () {
    if (!state.ready || !video.error) return;
    var code = video.error.code;
    reportError(C.failure('MEDIA_' + code, code === 4 ? 'この配信URL・形式では再生できません。URLの失効、配信側の制限、形式非対応などが考えられます。' : '映像データの読み込みまたは再生に失敗しました。診断レポートにエラー番号を残しました。'), 'play');
  });
  function capabilities() {
    var mse = window.MediaSource;
    return { userAgent: navigator.userAgent, secureContext: window.isSecureContext === true,
      mediaSource: !!mse, avcMSE: !!(mse && mse.isTypeSupported('video/mp4; codecs="avc1.42E01E"')),
      aacMSE: !!(mse && mse.isTypeSupported('audio/mp4; codecs="mp4a.40.2"')),
      nativeMP4: video.canPlayType('video/mp4; codecs="avc1.42E01E, mp4a.40.2"'),
      nativeHLS: video.canPlayType('application/vnd.apple.mpegurl') };
  }
  function makeReport() {
    var selected = state.formats[state.index];
    return JSON.stringify({ app: 'LF2 YouTube', version: '0.1.1', exportedAt: new Date().toISOString(),
      testMode: state.mode, apiOrigin: state.apiOrigin, environment: capabilities(), engineVersion: state.engine,
      selectedFormat: selected ? { kind: selected.kind, height: selected.height || null } : null,
      stages: stages, progressionObserved: state.progress, manuallyConfirmedPictureAndAudio: state.heard,
      errors: state.errors, events: state.events,
      note: '同梱動画(probe)の成功はYouTube視聴成功ではありません。映像の進行だけでは音声出力を証明できません。' }, null, 2);
  }
  $('report-button').addEventListener('click', function () { $('report-wrap').hidden = false; $('report').value = makeReport(); $('report').focus(); });
  $('copy').addEventListener('click', async function () {
    $('report').value = makeReport();
    try { await navigator.clipboard.writeText($('report').value); status('診断レポートをコピーしました。'); }
    catch (_) { $('report').focus(); $('report').select(); status('自動コピーできません。このテキストを選択してコピーしてください。'); }
  });
  $('download').addEventListener('click', function () {
    var url = URL.createObjectURL(new Blob([makeReport()], { type: 'text/plain;charset=utf-8' }));
    var a = document.createElement('a'); a.href = url; a.download = 'lf2-youtube-diagnostic.txt'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
  });
  // Native clicks/pointer controls work without keyboard emulation. D-pad fallback
  // intentionally does not intercept typing, selects, native video controls or wheel.
  document.addEventListener('keydown', function (event) {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].indexOf(event.key) < 0) return;
    var current = document.activeElement;
    if (current && /^(INPUT|TEXTAREA|SELECT|VIDEO|SUMMARY)$/.test(current.tagName)) return;
    var targets = Array.prototype.filter.call(document.querySelectorAll('button:not(:disabled), input, select, summary'), function (el) { return el.offsetWidth > 0 && el.offsetHeight > 0; });
    if (!targets.length) return;
    var rect = current && current.getBoundingClientRect ? current.getBoundingClientRect() : { left: 0, top: 0, width: 0, height: 0 };
    var x = rect.left + rect.width / 2, y = rect.top + rect.height / 2, best = null, score = Infinity;
    targets.forEach(function (el) {
      if (el === current) return; var r = el.getBoundingClientRect(), dx = r.left + r.width / 2 - x, dy = r.top + r.height / 2 - y;
      var main = event.key === 'ArrowDown' ? dy : event.key === 'ArrowUp' ? -dy : event.key === 'ArrowRight' ? dx : -dx;
      var cross = event.key === 'ArrowUp' || event.key === 'ArrowDown' ? Math.abs(dx) : Math.abs(dy);
      var value = main + cross * 2;
      if (main > 5 && value < score) { score = value; best = el; }
    });
    if (best) { event.preventDefault(); best.focus(); }
  });
  try {
    var saved = localStorage.getItem('lf2-youtube-api-v1');
    if (saved) {
      saved = C.normalizeApi(saved);
      var exists = Array.prototype.some.call($('instance').options, function (o) { return o.value === saved; });
      $('instance').value = exists ? saved : 'custom'; $('api-url').value = saved; $('custom-wrap').hidden = exists;
    }
  } catch (_) { /* A corrupt saved preference never prevents startup. */ }
  var caps = capabilities(); $('capabilities').textContent = 'ブラウザ申告: MP4=' + (caps.nativeMP4 || '非対応') + ' / MSE=' + caps.mediaSource + ' / H.264=' + caps.avcMSE + ' / AAC=' + caps.aacMSE + '。実機の出力確認は別です。';
  log('READY', '外部通信なしで起動');
}());

"""Offline UI/integration tests. Mock APIs never count as real Piped success.
Run: python tests/browser_smoke.py (requires playwright and local Chromium).
"""
import functools
import json
import pathlib
import os
import re
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from playwright.sync_api import sync_playwright, expect

ROOT = pathlib.Path(__file__).resolve().parents[1]
SITE = ROOT / 'dist' if (ROOT / 'dist/index.html').exists() else ROOT
class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass
server = ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(QuietHandler, directory=str(SITE.parent)))
thread = threading.Thread(target=server.serve_forever, daemon=True)
thread.start()
BASE = f'http://127.0.0.1:{server.server_port}/{SITE.name}/'
API = 'https://api.example.org'
VIDEO_ID = 'jNQXAC9IVRw'
results = []
media_bytes = (SITE / 'assets/probe.mp4').read_bytes()

def media(route):
    match = re.match(r'bytes=(\d+)-(\d*)', route.request.headers.get('range', ''))
    headers = {'access-control-allow-origin': '*', 'accept-ranges': 'bytes'}
    if match:
        start = int(match.group(1))
        end = min(int(match.group(2)) if match.group(2) else len(media_bytes)-1, len(media_bytes)-1)
        headers['content-range'] = f'bytes {start}-{end}/{len(media_bytes)}'
        route.fulfill(status=206, content_type='video/mp4', headers=headers, body=media_bytes[start:end+1])
    else:
        route.fulfill(status=200, content_type='video/mp4', headers=headers, body=media_bytes)

def setup(page, payload=None, code=200, raw=None):
    page.goto(BASE)
    page.locator('#video-url').fill('https://www.youtube.com/watch?v=' + VIDEO_ID)
    page.locator('#instance').select_option('custom')
    page.locator('#api-url').fill(API)
    page.locator('#consent').check()
    if payload is not None or raw is not None:
        page.route(API + '/streams/**', lambda route: route.fulfill(status=code,
            content_type='application/json' if raw is None else 'text/html',
            headers={'access-control-allow-origin': '*'}, body=raw if raw is not None else json.dumps(payload)))

def mark(name):
    results.append({'name': name, 'result': 'pass'})
    print('PASS:', name, flush=True)

try:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH'), headless=True, args=['--no-sandbox'])
        page = browser.new_page(viewport={'width': 1600, 'height': 1150})
        script_errors = []
        page.on('pageerror', lambda e: script_errors.append(str(e)))
        requests = []
        page.on('request', lambda r: requests.append(r.url))
        page.goto(BASE)
        expect(page.locator('#title')).to_have_text('まだ動画を取得していません')
        # The owner explicitly requested this public test-video preset.
        # Only check the prefilled value; never request this video in CI.
        expect(page.locator('#video-url')).to_have_value('https://www.youtube.com/watch?v=9-YYeiBjcak')
        expect(page.locator('#video-url')).to_be_editable()
        expect(page.locator('#consent')).not_to_be_checked()
        expect(page.locator('#play')).to_be_disabled()
        assert page.locator('#video-url').evaluate('(input) => LF2Core.parseVideoId(input.value)') == '9-YYeiBjcak'
        assert not any(not u.startswith('http://127.0.0.1:') for u in requests), requests
        mark('指定テスト動画を事前入力・編集可能・自動取得や自動再生なし')
        page.screenshot(path=str(ROOT / 'docs/preview.png'), full_page=True)
        mark('初期表示・同一配下パス・操作前の外部通信なし')
        page.locator('#probe').click()
        expect(page.locator('#stage-play')).to_have_text('進行を検知', timeout=10000)
        page.locator('#heard').click()
        page.locator('#report-button').click()
        report = json.loads(page.locator('#report').input_value())
        assert report['testMode'] == 'probe' and report['manuallyConfirmedPictureAndAudio'] is True
        assert page.locator('#video').evaluate('(v) => v.videoWidth') == 640
        # Button click is simulated. A human hearing the TV is NOT verified here.
        mark('同梱H.264/AAC動画の実デコード・進行・手動確認記録の区分')
        if (SITE / 'vendor/shaka-player.compiled.js').exists():
            page.add_script_tag(url=BASE + 'vendor/shaka-player.compiled.js')
            engine = page.evaluate("""async () => {
                shaka.polyfill.installAll();
                const player = new shaka.Player();
                await player.attach(document.querySelector('#video'));
                const configured = player.configure({
                    preferredVideoCodecs: ['avc1'], preferredAudioCodecs: ['mp4a'],
                    restrictions: {maxHeight:720, maxFrameRate:30},
                    streaming: {bufferingGoal:15, rebufferingGoal:2, bufferBehind:10,
                        retryParameters:{maxAttempts:2,timeout:12000,connectionTimeout:8000,stallTimeout:8000}},
                    manifest:{retryParameters:{maxAttempts:2,timeout:12000,connectionTimeout:8000,stallTimeout:8000}}
                });
                const version = shaka.Player.version;
                await player.destroy();
                return {version, configured};
            }""")
            assert engine['version'].lstrip('v') == '4.16.52' and engine['configured'] is True, engine
            mark('同梱Shaka実ライブラリの読込・接続・設定・終了（DASH再生ではない）')
        page.close()
        page = browser.new_page(viewport={'width': 1600, 'height': 1150})
        page.on('pageerror', lambda e: script_errors.append(str(e)))
        payload = {'title': '<img src=x onerror=alert(1)> fixture', 'duration': 10,
                   'videoStreams': [{'url': 'https://media.example.org/probe.mp4?secret-signature=hidden',
                       'videoOnly': False, 'mimeType': 'video/mp4', 'codec': 'avc1.42E01E', 'height': 360, 'fps': 24}], 'audioStreams': []}
        setup(page, payload)
        page.route('https://media.example.org/**', media)
        page.locator('#consent').uncheck()
        page.locator('#fetch').click()
        expect(page.locator('#status')).to_contain_text('チェック')
        mark('外部送信の確認がない場合は取得しない')
        page.locator('#consent').check()
        page.locator('#fetch').click()
        expect(page.locator('#stage-api')).to_have_text('取得成功')
        assert page.locator('#title img').count() == 0
        expect(page.locator('#title')).to_have_text(payload['title'])
        mark('模擬API応答・タイトルのHTML無効化・音声入りMP4選択')
        page.locator('#play').click()
        expect(page.locator('#stage-play')).to_have_text('進行を検知', timeout=10000)
        page.locator('#heard').click()
        page.locator('#forward').click()
        page.locator('#report-button').click()
        report_text = page.locator('#report').input_value()
        assert VIDEO_ID not in report_text and 'secret-signature' not in report_text and payload['title'] not in report_text
        assert json.loads(report_text)['testMode'] == 'youtube'
        mark('模擬API→同梱動画の再生・シーク操作・診断から動画情報を除外')
        page.close()
        for name, payload, code, raw, expected, stage in [
            ('HTTPエラー', {'message': 'secret'}, 503, None, 'HTTP_503', '#stage-api'),
            ('HTML応答', None, 200, '<html>server error</html>', 'API_JSON', '#stage-api'),
            ('映像のみ・音声なし', {'videoStreams': [{'url': 'https://media.example.org/v', 'height': 720, 'videoOnly': True, 'mimeType': 'video/mp4', 'codec': 'avc1.42E01E'}], 'audioStreams': [], 'duration': 10}, 200, None, 'NO_FORMAT', '#stage-format'),
        ]:
            page = browser.new_page()
            page.on('pageerror', lambda e: script_errors.append(str(e)))
            setup(page, payload, code, raw)
            page.locator('#fetch').click()
            expect(page.locator(stage)).to_have_text(expected)
            expect(page.locator('#fetch')).to_be_enabled()
            mark(name + 'を再生成功と混同しない')
            page.close()
        page = browser.new_page()
        setup(page)
        page.route(API + '/streams/**', lambda route: route.abort('failed'))
        page.locator('#fetch').click()
        expect(page.locator('#stage-api')).to_have_text('NETWORK')
        expect(page.locator('#status')).to_contain_text('区別できません')
        mark('通信失敗をCORSだけと断定しない')
        page.close()
        page = browser.new_page()
        setup(page)
        pending = []
        page.route(API + '/streams/**', lambda route: pending.append(route))
        page.locator('#fetch').click()
        expect(page.locator('#cancel')).to_be_enabled()
        page.locator('#cancel').click()
        expect(page.locator('#stage-api')).to_have_text('中止', timeout=5000)
        expect(page.locator('#fetch')).to_be_enabled()
        mark('API要求の中止・再試行可能な状態へ復帰')
        page.close()
        page = browser.new_page(viewport={'width': 390, 'height': 844})
        page.goto(BASE)
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        mark('スマートフォン幅で横にはみ出さない')
        page.close()
        assert not script_errors, script_errors
        mark('検証した画面で未処理JavaScript例外なし')
        browser.close()
finally:
    server.shutdown()
    server.server_close()
(ROOT / 'docs/browser-results.json').write_text(json.dumps({'scope': 'Offline mocks + generated MP4; not real YouTube / not TV hardware', 'tests': results}, ensure_ascii=False, indent=2), encoding='utf-8')
print(f'{len(results)} browser checks passed; REAL PIPED / TV SOUND NOT VERIFIED.')

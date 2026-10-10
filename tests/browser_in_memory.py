"""No-network DOM tests using only our generated files.
The host blocks HTTP browser navigation, so this is intentionally NOT an HTTP,
CORS, GitHub Pages, Shaka or live Piped test. No browser policies are changed.
"""
import base64
import json
import pathlib
import os
import re
from playwright.sync_api import sync_playwright, expect

ROOT = pathlib.Path(__file__).resolve().parents[1]
SITE = ROOT / 'dist' if (ROOT / 'dist/index.html').exists() else ROOT
html = (SITE / 'index.html').read_text()
# In-memory fixture has no origin or HTTP headers. Remove URL-based resources
# and CSP from this fixture only, never from the shipped application.
html = re.sub(r'<meta http-equiv="Content-Security-Policy"[^>]+>', '', html)
html = re.sub(r'<link[^>]+>', '', html)
html = re.sub(r'<script\b[^>]*>.*?</script>', '', html, flags=re.S)
core = (SITE / 'assets/core.js').read_text()
app = (SITE / 'assets/app.js').read_text()
css = (SITE / 'assets/style.css').read_text()
media64 = base64.b64encode((SITE / 'assets/probe.mp4').read_bytes()).decode()
results = []
ID = 'jNQXAC9IVRw'

def mark(name):
    results.append({'name': name, 'result': 'pass'})
    print('PASS:', name, flush=True)

def boot(browser, width=1600):
    page = browser.new_page(viewport={'width': width, 'height': 1150 if width > 1000 else 844})
    page.route('**/*', lambda route: route.abort())  # No external network at all.
    page.set_content(html)
    page.add_style_tag(content=css)
    page.evaluate('''(base64) => {
      const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
      window.fixtureBlob = URL.createObjectURL(new Blob([bytes], {type:'video/mp4'}));
      const prop = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'src');
      Object.defineProperty(HTMLMediaElement.prototype, 'src', {
        get: prop.get, set(value) {
          prop.set.call(this, value === 'assets/probe.mp4' || String(value).startsWith('https://media.example.org/') ? window.fixtureBlob : value);
        }, configurable: true
      });
      window.fixture = {calls: [], payload: null, status:200, raw:null, fail:false, hang:false};
      window.fetch = function(url, options) {
        window.fixture.calls.push(String(url));
        if (window.fixture.fail) return Promise.reject(new TypeError('fixture network failure'));
        if (window.fixture.hang) return new Promise((resolve, reject) => {
          options.signal.addEventListener('abort', () => reject(new DOMException('aborted','AbortError')));
        });
        return Promise.resolve(new Response(window.fixture.raw === null ? JSON.stringify(window.fixture.payload) : window.fixture.raw, {
          status:window.fixture.status, headers:{'Content-Type':window.fixture.raw === null ? 'application/json' : 'text/html'}
        }));
      };
    }''', media64)
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.add_script_tag(content=core)
    page.add_script_tag(content=app)
    return page, errors

def setup(page, payload=None):
    page.locator('#video-url').fill('https://www.youtube.com/watch?v=' + ID)
    page.locator('#instance').select_option('custom')
    page.locator('#api-url').fill('https://api.example.org')
    page.locator('#consent').check()
    if payload is not None:
        page.evaluate('(p) => { window.fixture.payload = p; }', payload)

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH'), headless=True, args=['--no-sandbox'])
    page, errors = boot(browser)
    expect(page.locator('#title')).to_have_text('まだ動画を取得していません')
    assert page.evaluate('fixture.calls.length') == 0
    page.screenshot(path=str(ROOT / 'docs/preview.png'), full_page=True)
    mark('メモリ内で初期画面を表示・操作前にAPI要求なし')
    page.locator('#probe').click()
    expect(page.locator('#stage-play')).to_have_text('進行を検知', timeout=10000)
    assert page.locator('#video').evaluate('(v) => v.videoWidth') == 640
    page.locator('#heard').click()
    page.locator('#report-button').click()
    report = json.loads(page.locator('#report').input_value())
    assert report['testMode'] == 'probe' and report['manuallyConfirmedPictureAndAudio']
    mark('同梱動画をBlobで実デコード・映像進行を検知（実音声は未確認）')
    assert not errors, errors
    page.close()
    page, errors = boot(browser)
    payload = {'title':'<img src=x onerror=alert(1)> fixture', 'duration':10, 'videoStreams':[
        {'url':'https://media.example.org/test.mp4?secret-signature=hidden','videoOnly':False,
         'mimeType':'video/mp4','codec':'avc1.42E01E','height':360,'fps':24}], 'audioStreams':[]}
    setup(page, payload)
    page.locator('#consent').uncheck()
    page.locator('#fetch').click()
    expect(page.locator('#status')).to_contain_text('チェック')
    assert page.evaluate('fixture.calls.length') == 0
    mark('送信確認が未選択ならAPIを呼ばない')
    page.locator('#consent').check()
    page.locator('#fetch').click()
    expect(page.locator('#stage-api')).to_have_text('取得成功')
    assert page.locator('#title img').count() == 0
    expect(page.locator('#title')).to_have_text(payload['title'])
    assert page.evaluate('fixture.calls.length') == 1
    mark('模擬JSONから形式を選択・HTMLタイトルを文字列として表示')
    page.locator('#play').click()
    expect(page.locator('#stage-play')).to_have_text('進行を検知', timeout=10000)
    page.locator('#heard').click()
    page.locator('#forward').click()
    page.locator('#report-button').click()
    text = page.locator('#report').input_value()
    assert ID not in text and 'secret-signature' not in text and payload['title'] not in text
    assert json.loads(text)['testMode'] == 'youtube'
    mark('模擬API→Blob動画の再生・シーク操作・診断の情報除外')
    assert not errors, errors
    page.close()
    for name, payload, fields, expected, stage in [
        ('HTTPエラー', {'message':'secret'}, {'status':503}, 'HTTP_503','#stage-api'),
        ('非JSON', {}, {'raw':'<html>server error</html>'}, 'API_JSON','#stage-api'),
        ('映像のみ', {'videoStreams':[{'url':'https://media.example.org/a','height':720,'videoOnly':True,'mimeType':'video/mp4','codec':'avc1.42E01E'}],'audioStreams':[],'duration':10}, {}, 'NO_FORMAT','#stage-format'),
        ('通信失敗', {}, {'fail':True}, 'NETWORK','#stage-api')
    ]:
        page, errors = boot(browser)
        setup(page,payload)
        page.evaluate('(fields) => Object.assign(window.fixture,fields)',fields)
        page.locator('#fetch').click()
        expect(page.locator(stage)).to_have_text(expected)
        expect(page.locator('#fetch')).to_be_enabled()
        if expected == 'NETWORK': expect(page.locator('#status')).to_contain_text('区別できません')
        assert not errors, errors
        mark(name+'の模擬エラーを成功と区別')
        page.close()
    page, errors = boot(browser)
    setup(page,{})
    page.evaluate('fixture.hang = true')
    page.locator('#fetch').click()
    page.locator('#cancel').click()
    expect(page.locator('#stage-api')).to_have_text('中止')
    expect(page.locator('#fetch')).to_be_enabled()
    mark('中止で模擬要求を破棄し操作可能に復帰')
    assert not errors,errors
    page.close()
    page, errors = boot(browser,390)
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    mark('390px幅のメモリ内画面に横方向のはみ出しなし')
    assert not errors,errors
    page.close()
    browser.close()
(ROOT / 'docs/browser-in-memory-results.json').write_text(json.dumps({
  'scope':'IN-MEMORY ONLY: no HTTP, no CORS, no real Piped, no Shaka, no TV hardware. Generated MP4 decoded via Blob. Human AV confirmation was a simulated button click.',
  'tests':results},ensure_ascii=False,indent=2),encoding='utf-8')
print(f'{len(results)} in-memory checks passed. Real service and TV NOT VERIFIED.')

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync(require('node:path').join(__dirname, '../index.html'), 'utf8');
function setup(navigator = {}) {
  const elements = {};
  const get = id => elements[id] ||= { value: '', options: [{ value: '2026' }], focus() {}, select() {}, scrollIntoView() { this.scrolled = true; } };
  get('summaryYear').value = '2026'; get('summaryMonth').value = '9';
  const c = { URL, URLSearchParams, navigator, document: { getElementById: get },
    window: { location: { href: 'https://example.com/book/?old=value#private', search: '' } },
    showToast(text) { c.toast = text; }, showPage(page) { c.page = page; }, applyDetailFilter() { c.filtered = true; } };
  vm.createContext(c);
  vm.runInContext(html.slice(html.indexOf('function buildMonthlyShare('), html.indexOf('function initSummaryFilters(')), c);
  return { c, get };
}
test('both requests identify selected month and carry only routing parameters', () => {
  const { c } = setup();
  for (const step of ['settlement', 'review']) {
    const p = c.buildMonthlyShare(step, '2026', '9', c.window.location.href);
    assert.match(p.text, /2026년 9월/);
    assert.match(p.text, step === 'settlement' ? /정산내역을 입력/ : /회고를 작성/);
    assert.equal(p.url, `https://example.com/book/?shareStep=${step}&shareMonth=2026-09`);
  }
});
test('cancel stays quiet; unavailable native sharing copies complete message', async () => {
  let copied;
  const { c } = setup({ share: async () => { throw { name: 'AbortError' }; }, clipboard: { writeText: async text => { copied = text; } } });
  await c.shareMonthlyStep('settlement');
  assert.equal(copied, undefined);
  delete c.navigator.share;
  await c.shareMonthlyStep('review');
  assert.match(copied, /회고를 작성/);
  assert.match(copied, /shareMonth=2026-09/);
});
test('clipboard failure exposes selectable text and shared links route to selected month', async () => {
  const { c, get } = setup();
  await c.shareMonthlyStep('review');
  assert.equal(get('monthlyShareFallback').hidden, false);
  assert.match(get('monthlyShareText').value, /회고/);
  c.window.location.search = '?shareStep=settlement&shareMonth=2026-08';
  c.openMonthlyShareLink();
  assert.equal(c.page, 'detail'); assert.equal(get('detailMonth').value, '8'); assert.equal(c.filtered, true);
  c.window.location.search = '?shareStep=review&shareMonth=2026-07';
  c.openMonthlyShareLink();
  assert.equal(c.page, 'summary'); assert.equal(get('summaryMonth').value, '7'); assert.equal(get('monthlyReview').scrolled, true);
});

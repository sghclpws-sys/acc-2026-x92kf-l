const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const HouseholdSummary = require('../household-summary.js');
const html = fs.readFileSync(require('node:path').join(__dirname, '../index.html'), 'utf8');

test('private rendered containers are empty in public HTML', () => {
  for (const id of ['summaryStats', 'donutSvg', 'donutLegend', 'topItems', 'monthCompareChart',
    'smartInsights', 'insightCards', 'detailBody', 'detailPagination', 'uploadCardTotals',
    'incomeGrid', 'catModalStore', 'txDetailTitle', 'txDetailDate', 'txDetailAmount', 'toast']) {
    assert.match(html, new RegExp('id="' + id + '"[^>]*>\\s*</'), id);
  }
  assert.match(html, /id="authGate"[^>]*display:flex/);
  const card = html.indexOf('id="householdSummaryCard"');
  assert(card > html.indexOf('id="page-summary"') && card < html.indexOf('id="page-detail"'));
  assert.match(html, /id="detailBulkActions"[^>]*hidden/);
});

function setup() {
  const elements = {};
  const get = id => elements[id] ||= { value: '', textContent: '', disabled: false };
  get('summaryYear').value = '2026';
  get('summaryMonth').value = '8';
  const context = {
    document: { getElementById: get }, HouseholdSummary, transactions: [], incomeData: {},
    window: { _fbAllowed: () => true, _fbLoadHouseholdSummary: async () => null,
      _fbSaveHouseholdSummary: async () => {} }
  };
  vm.createContext(context);
  vm.runInContext(html.slice(html.indexOf('let _summaryPreview = null;'), html.indexOf('// ===== AUTH =====')), context);
  return { context, get };
}

test('summary states compare saved data and invalidate preview on month changes', async () => {
  const { context: c, get } = setup();
  await c.refreshHouseholdSummaryState();
  assert.match(get('householdSummarySavedState').textContent, /미저장/);
  c.previewHouseholdSummary();
  assert.equal(get('householdSummarySave').disabled, false);
  const saved = HouseholdSummary.build({ month: '2026-08', transactions: [], income: null });
  c.window._fbLoadHouseholdSummary = async () => saved;
  await c.refreshHouseholdSummaryState();
  assert.match(get('householdSummarySavedState').textContent, /저장 완료/);
  c.transactions.push({ date: '2026-08-01', amount: 100, category: '기타' });
  await c.refreshHouseholdSummaryState();
  assert.match(get('householdSummarySavedState').textContent, /변경사항 있음/);
  get('summaryMonth').value = '9';
  await c.refreshHouseholdSummaryState();
  assert.equal(get('householdSummaryMonth').value, '2026-09');
  assert.equal(get('householdSummarySave').disabled, true);
  assert.equal(get('householdSummaryPreview').textContent, '');
});

test('failed saves are retryable and successful saves reload persisted state', async () => {
  const { context: c, get } = setup();
  await c.refreshHouseholdSummaryState();
  c.previewHouseholdSummary();
  c.window._fbSaveHouseholdSummary = async () => { throw new Error('offline'); };
  await c.saveHouseholdSummary();
  assert.equal(get('householdSummarySave').disabled, false);
  assert.match(get('householdSummaryStatus').textContent, /offline/);
  c.window._fbSaveHouseholdSummary = async payload => {
    c.window._fbLoadHouseholdSummary = async () => payload;
  };
  await c.saveHouseholdSummary();
  assert.match(get('householdSummarySavedState').textContent, /저장 완료/);
  assert.equal(get('householdSummarySave').disabled, true);
});

test('late state responses cannot overwrite a newly selected month', async () => {
  const { context: c, get } = setup();
  let resolve;
  c.window._fbLoadHouseholdSummary = () => new Promise(r => { resolve = r; });
  const oldRequest = c.refreshHouseholdSummaryState();
  c.window._fbLoadHouseholdSummary = async () => null;
  get('summaryMonth').value = '9';
  await c.refreshHouseholdSummaryState();
  resolve(HouseholdSummary.build({ month: '2026-08', transactions: [], income: null }));
  await oldRequest;
  assert.match(get('householdSummarySavedState').textContent, /미저장/);
  assert.equal(get('householdSummaryMonth').value, '2026-09');
});

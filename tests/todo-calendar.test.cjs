const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '../todo.html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
function setup() {
  const elements = {}, storage = {};
  const get = id => elements[id] ||= { value: '', innerHTML: '', textContent: '', style: {}, classList: { add() {}, remove() {} }, focus() {}, select() {} };
  const c = vm.createContext({ document: { getElementById: get }, Intl, Date, navigator: {}, setTimeout: () => 1, clearTimeout() {}, localStorage: { getItem: k => storage[k] || null, setItem: (k,v) => storage[k] = v } });
  vm.runInContext(script.slice(0, script.indexOf("document.addEventListener('keydown'")), c);
  vm.runInContext("curY=2026;curM=7;", c);
  return { c, get, storage };
}
function sample() { return { month: '2026-08', periodStart: '2026-08-01', periodEnd: '2026-08-31', calendars: ['활동'], english: { dates: ['2026-08-03','2026-08-03','2026-08-01'], types: ['말하기'] }, exercise: { dates: null, types: [] }, observation: '조회 한계', suggestion: '유지' }; }
test('embedded script is syntactically valid', () => { new vm.Script(script); });
test('import deduplicates activity dates and distinguishes unknown from zero', () => {
  const { c } = setup(); const s = c.parseCalendarSummary('```json\n'+JSON.stringify(sample())+'\n```', '2026-08');
  assert.equal(s.english.dates.length, 2); assert.equal(s.exercise.dates, null);
  const rendered = c.calendarSummaryHtml(s);
  assert.match(rendered, /08-01~08-02: 1일/); assert.match(rendered, /08-03~08-09: 1일/); assert.match(rendered, /확인 필요/);
  s.exercise.dates=[]; assert.match(c.calendarSummaryHtml(s), /0<span class="stat-unit">일 기록/);
});
test('invalid and wrong-month data cannot be imported', () => {
  const { c } = setup();
  assert.throws(() => c.parseCalendarSummary('{}','2026-08'));
  for (const date of ['2026-09-01','2026-08-32','nonsense']) {
    const s=sample();s.english.dates=[date];assert.throws(()=>c.parseCalendarSummary(JSON.stringify(s),'2026-08'));
  }
  const s=sample();s.periodStart='2026-08-20';s.periodEnd='2026-08-01';assert.throws(()=>c.parseCalendarSummary(JSON.stringify(s),'2026-08'));
});
test('preview gates saving, persisted summary survives reload and month switching', () => {
  const { c, get, storage }=setup();
  vm.runInContext("curData().memoEnd='기존 회고';curData().todos=[{text:'영어 발표',highlighted:false}];",c);
  c.openCalendarImport();get('calendarInput').value=JSON.stringify(sample());c.previewCalendarImport();
  assert.equal(get('calendarSave').disabled,false);c.resetCalendarPreview();c.saveCalendarImport();assert.equal(storage['mg-data'],undefined);
  c.previewCalendarImport();c.saveCalendarImport();c.load();
  assert.equal(c.curData().calendarSummary.english.dates.length,2);assert.equal(c.curData().memoEnd,'기존 회고');
  assert.match(c.buildExport(),/캘린더 수행 기록/);
  vm.runInContext('curM=6',c);c.renderCalendarSummary();assert.match(get('calendarSummary').innerHTML,/아직 가져온/);
  vm.runInContext('curM=7',c);c.renderCalendarSummary();assert.match(get('calendarSummary').innerHTML,/08-03/);
});
test('failed storage save preserves old summary and allows retry', () => {
  const { c, get }=setup();c.curData().calendarSummary=sample();c.openCalendarImport();const s=sample();s.observation='새 요약';get('calendarInput').value=JSON.stringify(s);c.previewCalendarImport();
  const save=c.localStorage.setItem;c.localStorage.setItem=()=>{throw Error('full');};c.saveCalendarImport();
  assert.equal(c.curData().calendarSummary.observation,'조회 한계');assert.match(get('calendarError').textContent,/저장하지 못/);
  c.localStorage.setItem=save;c.saveCalendarImport();assert.equal(c.curData().calendarSummary.observation,'새 요약');
});
test('import escapes markup, prompt includes goals and clipboard has manual fallback', async () => {
  const { c, get }=setup();const s=sample();s.observation='<img src=x onerror=alert(1)>';assert.doesNotMatch(c.calendarSummaryHtml(s),/<img/);
  c.curData().todos=[{text:'업무 영어 발표'}];assert.match(c.makeCalendarPrompt('2026-08'),/업무 영어 발표/);
  c.setupCalendarModal(true);get('calendarInput').value='prompt';await c.copyCalendarPrompt();assert.match(get('calendarError').textContent,/Ctrl\+C/);
});
test('direction and next actions persist per month without rewriting previous goals', () => {
  const {c,get}=setup();
  get('directionFocus').value='영어 발표';get('directionStart').value='2026-08-01';get('directionPriority').value='말하기 집중';get('directionStatus').value='adjust';get('directionEvidence').value='녹음 비교';get('directionReason').value='연습 방식 변경';c.saveDirection();
  get('calendarKeep').value='매일 연습';get('calendarChange').value='말하기';get('calendarDefer').value='새 교재';c.saveCalendarDecision();c.load();c.renderDirection();
  assert.equal(get('directionFocus').value,'영어 발표');assert.match(c.directionPeriodText('2026-08-01'),/2026-10-29/);assert.match(c.buildExport(),/녹음 비교/);assert.match(c.makeCalendarPrompt('2026-08'),/말하기 집중/);
  vm.runInContext('curM=8',c);c.renderDirection();assert.equal(get('directionFocus').value,'');c.reuseDirectionFocus();assert.equal(c.curData().direction.focus,'영어 발표');
  get('directionFocus').value='다음 목표';c.saveDirection();vm.runInContext('curM=7',c);c.renderCalendarSummary();assert.equal(get('directionFocus').value,'영어 발표');assert.equal(get('calendarDefer').value,'새 교재');
});
test('month comparison uses shared day range and handles missing evidence', () => {
  const {c}=setup();const a=sample(),b=sample();a.periodEnd='2026-08-15';a.english.dates=['2026-08-01'];b.month='2026-07';b.periodStart='2026-07-01';b.periodEnd='2026-07-31';b.english.dates=['2026-07-01','2026-07-20'];
  const text=c.directionComparisonHtml(a,b);assert.match(text,/1~15일/);assert.match(text,/변동 없음/);assert.match(text,/비교 보류/);assert.match(c.directionComparisonHtml(a,null),/0일로 처리하지/);
  b.periodStart='2026-07-20';assert.match(c.directionComparisonHtml(a,b),/비교할 수 없습니다/);
});

const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync(require('node:path').join(__dirname, '../index.html'), 'utf8');
const HouseholdSummary = require('../household-summary.js');
function setup() {
  const elements = {};
  const get = id => elements[id] ||= {value:'', innerHTML:'', textContent:'', disabled:false};
  const c = {transactions:[], recurringItems:[], incomeData:{}, HouseholdSummary,
    CATEGORIES:['생활비','세금'], CAT_ICON:{}, CAT_COLORS:{},
    document:{getElementById:get}, window:{}, saveCount:0,
    saveData(){c.saveCount++;}, showToast(){}, confirm:()=>true,
    currentUploadKey:()=> '2026-10', renderRecentCashTx(){}, fmt:n=>n.toLocaleString('ko-KR')};
  vm.createContext(c);
  vm.runInContext(html.slice(html.indexOf('let editingRecurringId'), html.indexOf('function addCashTransaction()')),c);
  c.monthKeyNow=()=> '2026-10';
  return {c,get};
}
function item(overrides={}) { return {id:'r1', name:'용돈', amount:10000, category:'생활비', startMonth:'2026-10', active:true, generated:[], ...overrides}; }
test('recurring starts at requested month, uses month end and survives reload/deletion without duplicates',()=>{
  const {c}=setup();c.recurringItems=[item()];
  assert.equal(c.applyRecurring(),true);
  assert.equal(c.transactions.length,1);assert.equal(c.transactions[0].date,'2026-10-31');
  assert.equal(c.transactions[0].card,'현금');
  c.recurringItems=JSON.parse(JSON.stringify(c.recurringItems));
  c.transactions=JSON.parse(JSON.stringify(c.transactions));
  assert.equal(c.applyRecurring(),false);
  c.transactions=[];assert.equal(c.applyRecurring(),false);assert.equal(c.transactions.length,0);
});
test('future start waits; leap February and edited future amounts are correct',()=>{
  const {c}=setup();c.recurringItems=[item({startMonth:'2026-11'})];
  assert.equal(c.applyRecurring(),false);
  c.monthKeyNow=()=> '2026-11';c.applyRecurring();assert.equal(c.transactions[0].date,'2026-11-30');
  c.recurringItems[0].amount=20000;c.monthKeyNow=()=> '2026-12';c.applyRecurring();
  assert.equal(c.transactions[0].amount,10000);assert.equal(c.transactions[1].amount,20000);
  c.transactions=[];c.recurringItems=[item({startMonth:'2028-02'})];c.monthKeyNow=()=> '2028-02';c.applyRecurring();
  assert.equal(c.transactions[0].date,'2028-02-29');
});
test('resume skips paused months, deduplicates recurring keys and preserves ordinary transactions',()=>{
  const {c}=setup();c.recurringItems=[item({startMonth:'2026-07',active:false,generated:['2026-07']})];
  c.toggleRecurringItem('r1');assert.equal(c.transactions.length,1);assert.equal(c.transactions[0].date,'2026-10-31');
  c.transactions.push({...c.transactions[0],id:2},{id:3,amount:50});c.applyRecurring();
  assert.equal(c.transactions.length,2);assert.equal(c.transactions[1].id,3);
  c.deleteRecurringItem('r1');assert.equal(c.recurringItems.length,0);assert.equal(c.transactions.length,2);
});
test('invalid calendar months are skipped and recurring names are escaped',()=>{
  const {c,get}=setup();c.recurringItems=[item({startMonth:'2026-00',name:'<img src=x>'})];
  assert.equal(c.applyRecurring(),false);c.renderRecurring();
  assert.match(get('recurringList').innerHTML,/&lt;img src=x&gt;/);
});
function adviceSetup(){
  const {c,get}=setup();
  c.transactions=[
    {date:'2026-07-01',store:'prior',category:'생활비',amount:100},
    {date:'2026-08-01',store:'prior',category:'생활비',amount:200},
    {date:'2026-09-01',store:'prior',category:'생활비',amount:300},
    {date:'2026-09-02',store:'prior tax',category:'세금',amount:10000,irregular:true},
    {date:'2026-10-01',store:'current',category:'생활비',amount:400},
    {date:'2026-10-02',store:'current tax',category:'세금',amount:20000,settlement:1000,irregular:true}];
  c.getMonthRange=()=>[7,8,9,10].map(month=>({year:2026,month}));
  c.getMonthlyTx=(y,m)=>c.transactions.filter(t=>t.date.startsWith(y+'-'+String(m).padStart(2,'0')));
  vm.runInContext(html.slice(html.indexOf('function getAdviceScope'),html.indexOf('function _advicePrompt')),c);
  return {c,get};
}
test('monthly AI payload isolates merchants, retains real totals and compares prior regular expenses',()=>{
  const {c,get}=adviceSetup();get('adviceScope').value='2026-10';const p=c.buildAdvicePayload();
  assert.equal(c._adviceDocKey(),'month-2026-10');assert.equal(p.월별요약.length,1);
  assert.equal(p.월별요약[0].카드지출,19400);assert.equal(p.비정기지출[0].금액,19000);
  assert.equal(p.주요가맹점_상위60.length,2);assert(p.주요가맹점_상위60.every(s=>s.가맹점.startsWith('current')));
  assert.equal(p.비교기준_직전월평균.카테고리별['생활비'],200);
  assert.equal(p.비교기준_직전월평균.카테고리별['세금'],undefined);
  get('adviceScope').value='';assert.equal(c._adviceDocKey(),'2026-10');assert.equal(c.buildAdvicePayload().월별요약.length,4);
});
test('late advice cache response cannot overwrite the newly selected scope',async()=>{
  const {c,get}=adviceSetup();c._adviceLoaded=false;
  vm.runInContext(html.slice(html.indexOf('let _adviceRenderRequest'),html.indexOf('// ===== PRIVATE HOUSEHOLD SUMMARY')),c);
  c.initAdviceScope=()=>{};const pending={};c.window._fbLoadAdvice=k=>new Promise(resolve=>pending[k]=resolve);
  c._paintAdvice=items=>{get('adviceBody').innerHTML=items[0].title;};
  get('adviceScope').value='2026-09';const first=c.renderAdviceCard();
  get('adviceScope').value='2026-10';c._adviceLoaded=false;const second=c.renderAdviceCard();
  pending['month-2026-10']({items:'[{"title":"October"}]'});await second;
  pending['month-2026-09']({items:'[{"title":"September"}]'});await first;
  assert.equal(get('adviceBody').innerHTML,'October');
});
test('average comparison excludes irregular-only current spending and explains the exclusion',()=>{
  const {c,get}=adviceSetup();c.transactions=c.transactions.filter(t=>t.date<'2026-10'||t.irregular);
  vm.runInContext(html.slice(html.indexOf('function renderBudgetAlert'),html.indexOf('function renderHeatmap')),c);
  c.renderBudgetAlert();assert.match(get('budgetAlert').innerHTML,/19,000원은 비교에서 제외/);
});

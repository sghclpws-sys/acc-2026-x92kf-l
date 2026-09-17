const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function app(globals = {}) {
  const html = fs.readFileSync(path.join(__dirname, '../portfolio.html'), 'utf8');
  const script = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'));
  new vm.Script(script);
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, { value:'', checked:false, textContent:'', innerHTML:'', style:{}, classList:{contains:()=>false}, addEventListener(){} });
    return elements.get(id);
  };
  const context = vm.createContext({ document:{getElementById:element, querySelectorAll:()=>[]}, console, ...globals });
  vm.runInContext(script.slice(0, script.lastIndexOf('loadSavedData();')), context);
  const run = code => vm.runInContext(code, context);
  for (const [id,value] of Object.entries({'an-lambda':'2.5','an-mu':'8','an-rf':'4.3','an-sigma':'17'})) element(id).value=value;
  return {run,element};
}

test('PB and headline USD exposure both respect hedged holdings', () => {
  const {run} = app();
  run(`P={accounts:[{assets:[{asset_class:'bond_us',currency_exposure:'KRW',amount:40},{asset_class:'equity_global',currency_exposure:'USD',amount:60}]}]}`);
  assert.equal(run('usdExposure()'),60);
  assert.equal(run('getExpandedPortfolioMetrics().usdPct'),60);
});

test('10Y without a key shows stored data with provenance rather than blank', async () => {
  const {run,element}=app({localStorage:{getItem:()=>null}});
  run("P={accounts:[],macro_assumptions:{us10y:4.78,updated_at:'2026-09-03'}}");
  assert.equal(await run('fetchFRED()'),false);
  assert.equal(element('m-t10').textContent,'4.78%');
  assert.match(element('m-t10-sub').textContent,/저장값.*2026-09-03.*키 미설정/);
  run("TAA={updated_at:'2026-09-14',scorecard:{inputs:{us10y:4.5}}};renderMacroReadings()");
  assert.equal(element('m-t10').textContent,'4.50%');
  assert.match(element('m-t10-sub').textContent,/TAA 저장값/);
});

test('FRED accepts a single valid observation after holiday gaps', async () => {
  const {run,element}=app({localStorage:{getItem:()=>'test-only'},AbortSignal,
    fetch:async()=>({ok:true,json:async()=>({observations:[{date:'2026-09-15',value:'.'},{date:'2026-09-14',value:'4.21'}]})})});
  assert.equal(await run('fetchFRED()'),true);
  assert.equal(element('m-t10').textContent,'4.21%');
  assert.match(element('m-t10-sub').textContent,/FRED 관측값.*2026-09-14/);
  assert.equal(run('M.rates.t10y.change'),null);
});

test('failed FRED response retains stored value and labels failure', async () => {
  const {run,element}=app({localStorage:{getItem:()=>'test-only'},AbortSignal,
    console:{warn(){},error(){}},fetch:async()=>({ok:false,status:503})});
  run("P={accounts:[],macro_assumptions:{us10y:4.78,updated_at:'2026-09-03'}}");
  assert.equal(await run('fetchFRED()'),false);
  assert.equal(element('m-t10').textContent,'4.78%');
  assert.match(element('m-t10-sub').textContent,/조회 실패/);
});

test('ERP conversion preserves missing values and decimal ratios', () => {
  const {run} = app();
  assert.equal(run('displayErpValue(null)'),null);
  assert.equal(run('displayErpValue(0)'),0);
  assert.equal(run('displayErpValue(0.00296)'),0.296);
  assert.equal(run('displayErpValue(2)'),2);
});

test('automatic rates apply before calculation; manual zero is preserved', () => {
  const {run,element} = app();
  element('an-rf-auto').checked=true;
  run('P={accounts:[],macro_assumptions:{us10y:4.78}}');
  assert.equal(run('getAnalyticsInputs().rf'),0.0478);
  run('M.rates={t10y:{value:6}}');
  assert.equal(run('getAnalyticsInputs().rf'),0.06);
  assert.equal(element('an-rf').value,'6');
  element('an-rf-auto').checked=false;
  element('an-rf').value='0'; element('an-mu').value='0';
  assert.equal(run('getAnalyticsInputs().rf'),0);
  assert.equal(run('getAnalyticsInputs().mu_eq'),0);
  element('an-sigma').value='0';
  assert.equal(run('getAnalyticsInputs()'),null);
});

test('crypto target warning follows SAA including zero target', () => {
  const {run}=app();
  run(`P={accounts:[{name:'crypto',assets:[{name:'BTC',asset_class:'crypto',amount:8},{name:'cash',asset_class:'cash',amount:92}]}]};ASSET_TARGETS.current=normalizeAssetTarget({crypto:8,cash:92})`);
  assert.equal(run("checkRiskLimits().filter(a=>a.title.startsWith('BTC 비중')).length"),0);
  run('ASSET_TARGETS.current=normalizeAssetTarget({crypto:0,cash:100})');
  assert.match(run("checkRiskLimits().find(a=>a.title.startsWith('BTC 비중')).reason"), /목표 0%/);
});

test('decision comparison uses the displayed target and never labels negative difference a loss', () => {
  const {run,element}=app();
  run(`P={accounts:[{assets:[{name:'stock',asset_class:'equity_global',amount:100}]}]};ASSET_TARGETS.merton=normalizeAssetTarget({equity_global:40,bond_us:50,cash:10});renderDecisionMatrix(1,0.08,0.043,0.17)`);
  const result=element('an-decision-body').innerHTML;
  assert.match(result,/주식 40% 참고 배분/);
  assert.match(result,/현재 포트폴리오의 효용이 더 높음/);
  assert.doesNotMatch(result,/효용 손실|효용 최대화|추가자금 투입으로 조정/);
});

test('cash inside accounts and separate cash agree across status, snapshots and analytics', () => {
  const {run}=app();
  run(`P={accounts:[{assets:[{asset_class:'equity_global',amount:600},{asset_class:'cash',amount:200}]}],cash:{available:200}};ASSET_TARGETS.current=normalizeAssetTarget({equity_global:60,cash:40})`);
  assert.equal(run('totalWithCash()'),1000);
  assert.equal(run('classBreakdown().cash'),400);
  assert.equal(run('getAllocationSummary().pct.cash'),40);
  assert.equal(run('getCurrentWeights().cash'),0.4);
  assert.equal(run('getPortfolioStatus().drifted.length'),0);
  assert.equal(run("runRuleEngine().filter(a=>a.account==='SAA 드리프트').length"),0);
});

test('cost basis wins over stale percentages; zero valuation retains full loss', () => {
  const {run}=app();
  run(`P={accounts:[{assets:[{amount:120,cost_basis:100,pnl_pct:99},{amount:0,cost_basis:50},{amount:40}]}]}`);
  assert.equal(run('totalPnLStats().pnl'),-30);
  assert.equal(run('totalPnLStats().covered'),2);
  assert.equal(run('holdingPnL({amount:0,cost_basis:50}).pct'),-100);
  assert.equal(run('holdingPnL({amount:10,pnl_pct:-100})'),null);
  assert.equal(run('holdingPnL({amount:0})'),null);
  assert.equal(run('holdingPnL({amount:110,pnl_pct:10}).pnl').toFixed(6),'10.000000');
});

test('new money uses cumulative account capacity across asset classes', () => {
  const {run}=app();
  run(`P={accounts:[{id:'isa',name:'ISA',type:'isa',annual_limit:100000,deposited_this_year:90000,assets:[]},{id:'tax',name:'Taxable',type:'taxable',assets:[{asset_class:'equity_global',amount:100000}]}]};ASSET_TARGETS.current=normalizeAssetTarget({bond_us:50,gold:50});var plan=buildBuyPlanByAsset(100000)`);
  assert.equal(run("plan.filter(r=>r.accountName==='ISA').reduce((s,r)=>s+r.amount,0)"),10000);
  assert.equal(run('plan.reduce((s,r)=>s+r.amount,0)+plan.unallocated'),100000);
  assert.equal(run('plan.blocked'),0);
});

test('unknown and exhausted account limits leave explicit unallocated cash', () => {
  const {run}=app();
  run(`P={accounts:[{name:'ISA',type:'isa',annual_limit:100000,deposited_this_year:100000,assets:[]},{name:'Unknown',type:'isa',assets:[]}]};ASSET_TARGETS.current=normalizeAssetTarget({bond_us:100});var plan=buildBuyPlanByAsset(15000)`);
  assert.equal(run('plan.length'),0);
  assert.equal(run('plan.unallocated'),15000);
  assert.equal(run('plan.blocked'),15000);
});

test('new-money plan uses post-deposit total, reserves cash and never overshoots target', () => {
  const {run}=app();
  run(`P={accounts:[{name:'Tax',type:'taxable',assets:[{asset_class:'equity_global',amount:100000}]}]};ASSET_TARGETS.current=normalizeAssetTarget({equity_global:50,bond_us:40,cash:10});var plan=buildBuyPlanByAsset(100000)`);
  assert.equal(run('plan.reduce((s,r)=>s+r.amount,0)'),80000);
  assert.equal(run('plan.reserve'),20000);
  assert.equal(run('plan.unallocated'),20000);
  assert.equal(run('plan.every(r=>r.assetKey==="bond_us")'),true);
});

test('calculator preserves 15000 and small amounts without rounding up', () => {
  const {run,element}=app();
  run(`P={accounts:[{name:'Tax',type:'taxable',assets:[]}]};ASSET_TARGETS.current=normalizeAssetTarget({bond_us:100})`);
  for (const amount of [15000,9999,1]) {
    element('calcAmt').value=String(amount);
    run('calcRebal()');
    assert.match(element('calcResult').innerHTML,new RegExp('₩'+amount.toLocaleString('en-US')));
    assert.equal(run(`buildBuyPlanByAsset(${amount}).reduce((s,r)=>s+r.amount,0)`),amount);
  }
  element('calcAmt').value='-1'; run('calcRebal()');
  assert.match(element('calcResult').textContent,/정수/);
  assert.equal(run('buildBuyPlanByAsset(Infinity).length'),0);
});

test('top-three concentration does not depend on holding sort', () => {
  const {run,element}=app();
  run(`P={accounts:[{name:'Tax',assets:[{name:'A',amount:10},{name:'B',amount:20},{name:'C',amount:30},{name:'D',amount:40}]}]};_holdingSort='name';renderHoldingsAnalysis()`);
  assert.match(element('holdingsAnalysisPanel').innerHTML,/90\.0%/);
});

test('optional private portfolio integration does not change total assets', {skip:!process.env.PORTFOLIO_AUDIT_JSON}, () => {
  const raw=JSON.parse(fs.readFileSync(process.env.PORTFOLIO_AUDIT_JSON,'utf8'));
  const {run}=app();
  run(`P=normalizePortfolioData(${JSON.stringify(raw)});syncTAAtoTargets()`);
  const expected=raw.accounts.filter(a=>!a.exclude_from_portfolio).reduce((s,a)=>s+a.assets.reduce((sum,h)=>sum+h.amount,0),raw.cash.available);
  assert.equal(run('totalWithCash()'),expected);
  assert.ok(Math.abs(run('Object.values(classBreakdown()).reduce((s,n)=>s+n,0)')-expected)<0.01);
  for (const amount of [15000,1000000,30000000]) {
    run(`var plan=buildBuyPlanByAsset(${amount})`);
    assert.equal(run('plan.reduce((s,r)=>s+r.amount,0)+plan.unallocated'),amount);
    assert.equal(run(`getActiveAccounts().every(a=>plan.filter(r=>r.accountName===a.name).reduce((s,r)=>s+r.amount,0)<=getNewMoneyCapacity(a))`),true);
  }
  run('renderAccounts();renderHoldingsAnalysis();renderPortfolioSummary()');
});

const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const { build } = require('../household-summary.js');
const income = { yejin: 1000, gihyuk: 2000, etc: 0, interestExpense: 100 };
const transactions = [
  { date: '2026-08-01', amount: 500, settlement: 100, category: '외식', store: 'PRIVATE_STORE', note: 'PRIVATE_NOTE', uid: 'PRIVATE_UID' },
  { date: '2026-08-02', amount: -50, category: '외식' },
  { date: '2026-07-01', amount: 900, category: '여행' }
];
test('refunds and settlements match category totals and exclude other months', () => {
  const s = build({ month: '2026-08', transactions, income });
  assert.equal(s.netCardExpense, 350);
  assert.equal(s.categories['외식'], 350);
  assert.equal(s.totalExpense, 450);
  assert.equal(s.balance, 2550);
  assert.equal(s.transactionCount, 2);
  assert.equal(s.surplusRate, 85);
  assert.equal(Object.values(s.categories).reduce((a,b) => a+b,0), s.netCardExpense);
  assert(!JSON.stringify(s).includes('PRIVATE_'));
});
test('unknown income and interest are not interpreted as zero', () => {
  const s = build({ month: '2026-08', transactions });
  assert.equal(s.income, null); assert.equal(s.totalExpense, null);
  assert.equal(s.surplusRate, null); assert.equal(s.quality.incomeMissing, true);
  const partial = build({ month: '2026-08', transactions, income: { yejin: 100 } });
  assert.equal(partial.income, null);
});
test('invalid month and amounts fail before writing', () => {
  assert.throws(() => build({ month: '2026-13' }));
  assert.throws(() => build({ month: '2026-08', transactions: [{date:'2026-08-01',amount:'invalid'}] }));
});
test('empty and zero income months remain provisional', () => {
  const s = build({month:'2026-08', transactions:[],income:{yejin:0,gihyuk:0,etc:0,interestExpense:0}});
  assert.equal(s.income,0); assert.equal(s.surplusRate,null); assert.equal(s.status,'provisional');
});
test('every inline app script parses, including Firebase module', () => {
  const html = fs.readFileSync('index.html','utf8');
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
    if (/\bsrc=/.test(m[1])) continue;
    if (/type="module"/.test(m[1])) {
      const result = spawnSync(process.execPath, ['--input-type=module','--check'], {input:m[2],encoding:'utf8'});
      assert.equal(result.status,0,result.stderr);
    } else new vm.Script(m[2]);
  }
});
test('in-app advisor preserves merchant detail while sharing monthly arithmetic', () => {
  const html = fs.readFileSync('index.html','utf8');
  const functions = html.slice(html.indexOf('function _netAmt'), html.indexOf('function _advicePrompt'));
  const ctx = { HouseholdSummary: {build}, transactions, incomeData:{'2026-08':income}, CATEGORIES:['외식','여행'],
    getMonthRange:()=>[{year:2026,month:8}], getMonthlyTx:()=>transactions.filter(t=>t.date.startsWith('2026-08')) };
  vm.createContext(ctx); vm.runInContext(functions,ctx);
  const payload=ctx.buildAdvicePayload();
  assert.equal(payload.월별요약[0].카드지출,350);
  assert(payload.주요가맹점_상위60.some(s=>s.가맹점==='PRIVATE_STORE'));
});
test('public household entry files contain no embedded transaction or income records', () => {
  const html = fs.readFileSync('index.html','utf8');
  assert.match(html,/window\._INIT_TX = \[\];/);
  assert.match(html,/const INIT_INCOME = \{\};/);
  for(const file of fs.readdirSync('.').filter(f=>f.endsWith('.html') && !['index.html','todo.html','portfolio.html'].includes(f))) {
    const text=fs.readFileSync(file,'utf8');
    assert(text.length<1000); assert(text.includes('./index.html'));
  }
});
